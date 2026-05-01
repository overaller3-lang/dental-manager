from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_utente_corrente, get_db_session
from app.models.odontogramma import DenteStato, StatoDente
from app.models.paziente import Paziente
from app.models.utente import Utente
from app.schemas.odontogramma import (
    DenteStatoUpsert, DenteStatoResponse, OdontogrammaResponse, FDI_VALIDI,
)
from app.services.log_service import LogService
from app.models.log import TipoOperazione

router = APIRouter(prefix="/pazienti/{paziente_id}/odontogramma", tags=["Odontogramma"])


def _verifica_paziente(db: Session, paziente_id: int) -> Paziente:
    paziente = db.query(Paziente).filter(Paziente.id == paziente_id).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")
    return paziente


def _verifica_codice(codice: str) -> str:
    if codice not in FDI_VALIDI:
        raise HTTPException(
            status_code=422,
            detail=f"Codice FDI '{codice}' non valido (atteso 11-48 o 51-85)"
        )
    return codice


@router.get("", response_model=OdontogrammaResponse)
def get_odontogramma(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Restituisce lo stato corrente di tutti i denti registrati per il paziente."""
    _verifica_paziente(db, paziente_id)
    denti = db.query(DenteStato).filter(DenteStato.paziente_id == paziente_id).all()
    return {"paziente_id": paziente_id, "denti": denti}


@router.put("/{dente_codice}", response_model=DenteStatoResponse)
def upsert_dente(
    paziente_id: int,
    dente_codice: str,
    dati: DenteStatoUpsert,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Crea o aggiorna lo stato di un singolo dente.

    Il `dente_codice` nell'URL deve combaciare con quello del body, così il
    client non può aggiornare per errore un dente diverso da quello richiesto.
    """
    _verifica_paziente(db, paziente_id)
    _verifica_codice(dente_codice)
    if dati.dente_codice != dente_codice:
        raise HTTPException(status_code=400, detail="dente_codice URL e body non corrispondono")

    record = db.query(DenteStato).filter(
        DenteStato.paziente_id == paziente_id,
        DenteStato.dente_codice == dente_codice
    ).first()

    dati_prima = None
    if record:
        dati_prima = {"stato": record.stato.value, "note": record.note}
        record.stato = dati.stato
        record.note = dati.note
        record.aggiornato_da = utente_corrente.id
        operazione = TipoOperazione.UPDATE
    else:
        record = DenteStato(
            paziente_id=paziente_id,
            dente_codice=dente_codice,
            stato=dati.stato,
            note=dati.note,
            aggiornato_da=utente_corrente.id,
        )
        db.add(record)
        db.flush()
        operazione = TipoOperazione.INSERT

    LogService.log_evento(
        db=db,
        operazione=operazione,
        utente_id=utente_corrente.id,
        tabella="denti_stato",
        record_id=record.id,
        modulo="pazienti",
        dati_prima=dati_prima,
        dati_dopo={"dente_codice": dente_codice, "stato": dati.stato.value, "note": dati.note},
        successo=True,
    )
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{dente_codice}", status_code=status.HTTP_204_NO_CONTENT)
def reset_dente(
    paziente_id: int,
    dente_codice: str,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Rimuove lo stato di un dente (torna a 'sano' implicito)."""
    _verifica_paziente(db, paziente_id)
    _verifica_codice(dente_codice)
    record = db.query(DenteStato).filter(
        DenteStato.paziente_id == paziente_id,
        DenteStato.dente_codice == dente_codice,
    ).first()
    if not record:
        return
    LogService.log_evento(
        db=db,
        operazione=TipoOperazione.DELETE,
        utente_id=utente_corrente.id,
        tabella="denti_stato",
        record_id=record.id,
        modulo="pazienti",
        dati_prima={"dente_codice": dente_codice, "stato": record.stato.value, "note": record.note},
        successo=True,
    )
    db.delete(record)
    db.commit()
