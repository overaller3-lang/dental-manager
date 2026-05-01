from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
from typing import Optional
from app.api.deps import get_utente_corrente, get_db_session
from app.models.lista_attesa import ListaAttesa, StatoAttesa, PrioritaAttesa
from app.models.paziente import Paziente
from app.models.appuntamento import Appuntamento, TipoAppuntamento
from app.models.utente import Utente
from app.schemas.lista_attesa import (
    ListaAttesaCreate, ListaAttesaUpdate, ListaAttesaResponse,
    ListaAttesaPromuovi, ListaAttesaPaginato,
)
from app.services.appuntamento_service import AppuntamentoService
from app.schemas.appuntamento import AppuntamentoCreate
from app.services.log_service import LogService
from app.models.log import TipoOperazione

router = APIRouter(prefix="/lista-attesa", tags=["Lista d'attesa"])


_PRIORITA_ORDER = {
    PrioritaAttesa.URGENTE: 0,
    PrioritaAttesa.ALTA: 1,
    PrioritaAttesa.MEDIA: 2,
    PrioritaAttesa.BASSA: 3,
}


def _denormalizza(item: ListaAttesa) -> ListaAttesa:
    if item.paziente:
        item.paziente_nome = item.paziente.nome
        item.paziente_cognome = item.paziente.cognome
        item.paziente_telefono = item.paziente.telefono
    if item.dentista:
        item.dentista_nome = item.dentista.nome
        item.dentista_cognome = item.dentista.cognome
    return item


@router.get("", response_model=ListaAttesaPaginato)
def lista(
    stato: Optional[StatoAttesa] = Query(None),
    priorita: Optional[PrioritaAttesa] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    q = db.query(ListaAttesa).options(
        joinedload(ListaAttesa.paziente),
        joinedload(ListaAttesa.dentista),
    )
    if stato:
        q = q.filter(ListaAttesa.stato == stato)
    if priorita:
        q = q.filter(ListaAttesa.priorita == priorita)

    items = q.all()
    # Ordina per priorità (urgente prima) e poi per data di inserimento
    items.sort(key=lambda x: (_PRIORITA_ORDER.get(x.priorita, 9), x.created_at or datetime.min))
    for it in items:
        _denormalizza(it)
    return {"items": items, "totale": len(items)}


@router.post("", response_model=ListaAttesaResponse, status_code=201)
def crea(
    dati: ListaAttesaCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    paziente = db.query(Paziente).filter(Paziente.id == dati.paziente_id, Paziente.attivo == True).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato o non attivo")

    item = ListaAttesa(**dati.model_dump(), creato_da=utente_corrente.id)
    db.add(item)
    db.flush()
    LogService.log_evento(
        db=db, operazione=TipoOperazione.INSERT, utente_id=utente_corrente.id,
        tabella="lista_attesa", record_id=item.id, modulo="appuntamenti",
        dati_dopo={"paziente_id": item.paziente_id, "priorita": item.priorita.value},
        successo=True,
    )
    db.commit()
    db.refresh(item)
    item = db.query(ListaAttesa).options(
        joinedload(ListaAttesa.paziente), joinedload(ListaAttesa.dentista)
    ).filter(ListaAttesa.id == item.id).first()
    return _denormalizza(item)


@router.patch("/{item_id}", response_model=ListaAttesaResponse)
def aggiorna(
    item_id: int,
    dati: ListaAttesaUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    item = db.query(ListaAttesa).filter(ListaAttesa.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Voce non trovata")

    cambi = dati.model_dump(exclude_unset=True)
    if "stato" in cambi and cambi["stato"] == StatoAttesa.CONTATTATO:
        item.contattato_da = utente_corrente.id
        item.data_contatto = datetime.now(timezone.utc)
    for k, v in cambi.items():
        setattr(item, k, v)

    LogService.log_evento(
        db=db, operazione=TipoOperazione.UPDATE, utente_id=utente_corrente.id,
        tabella="lista_attesa", record_id=item.id, modulo="appuntamenti",
        dati_dopo=cambi, successo=True,
    )
    db.commit()
    db.refresh(item)
    item = db.query(ListaAttesa).options(
        joinedload(ListaAttesa.paziente), joinedload(ListaAttesa.dentista)
    ).filter(ListaAttesa.id == item.id).first()
    return _denormalizza(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def elimina(
    item_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    item = db.query(ListaAttesa).filter(ListaAttesa.id == item_id).first()
    if not item:
        return
    LogService.log_evento(
        db=db, operazione=TipoOperazione.DELETE, utente_id=utente_corrente.id,
        tabella="lista_attesa", record_id=item.id, modulo="appuntamenti",
        successo=True,
    )
    db.delete(item)
    db.commit()


@router.post("/{item_id}/promuovi")
def promuovi(
    item_id: int,
    dati: ListaAttesaPromuovi,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Promuove la voce in lista d'attesa creando un appuntamento reale.

    Riusa AppuntamentoService.crea_appuntamento per riutilizzare la
    validazione conflitti/orari/giorni lavorativi.
    """
    item = db.query(ListaAttesa).filter(ListaAttesa.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Voce non trovata")
    if item.stato == StatoAttesa.PRENOTATO:
        raise HTTPException(status_code=409, detail="Voce già promossa in appuntamento")

    dentista_id = dati.dentista_id or item.dentista_id
    if not dentista_id:
        raise HTTPException(status_code=400, detail="Dentista non specificato")

    tipo_str = (item.tipo_appuntamento or TipoAppuntamento.VISITA.value)
    try:
        tipo = TipoAppuntamento(tipo_str)
    except ValueError:
        tipo = TipoAppuntamento.VISITA

    nuovo = AppuntamentoCreate(
        piano_cura_id=dati.piano_cura_id,
        paziente_id=item.paziente_id,
        dentista_id=dentista_id,
        data_ora_inizio=dati.data_ora_inizio,
        data_ora_fine=dati.data_ora_fine,
        sala=dati.sala,
        tipo=tipo,
        motivo=item.motivo,
    )
    appuntamento = AppuntamentoService.crea_appuntamento(db, nuovo, creato_da=utente_corrente.id)

    item.stato = StatoAttesa.PRENOTATO
    item.appuntamento_id = appuntamento.id
    db.commit()
    return {"appuntamento_id": appuntamento.id, "lista_attesa_id": item.id}
