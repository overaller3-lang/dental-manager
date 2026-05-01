from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.stanza import StanzaCreate, StanzaUpdate, StanzaResponse
from app.models.stanza import Stanza
from app.models.utente import Utente
from app.models.log import TipoOperazione
from app.services.log_service import LogService

router = APIRouter(prefix="/stanze", tags=["Stanze"])


@router.get("", response_model=List[StanzaResponse])
def lista_stanze(
    solo_attive: bool = Query(True),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    query = db.query(Stanza)
    if solo_attive:
        query = query.filter(Stanza.attiva == True)
    return query.order_by(Stanza.nome).all()


@router.post("", response_model=StanzaResponse, status_code=status.HTTP_201_CREATED)
def crea_stanza(
    dati: StanzaCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    stanza = Stanza(**dati.model_dump())
    db.add(stanza)
    db.flush()
    LogService.log_evento(
        db=db,
        operazione=TipoOperazione.INSERT,
        utente_id=utente_corrente.id,
        tabella="stanze",
        record_id=stanza.id,
        modulo="stanze",
        dati_dopo={"nome": stanza.nome, "descrizione": stanza.descrizione, "colore": stanza.colore, "attiva": stanza.attiva},
        successo=True
    )
    db.commit()
    db.refresh(stanza)
    return stanza


@router.patch("/{stanza_id}", response_model=StanzaResponse)
def aggiorna_stanza(
    stanza_id: int,
    dati: StanzaUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    stanza = db.query(Stanza).filter(Stanza.id == stanza_id).first()
    if not stanza:
        raise HTTPException(status_code=404, detail="Stanza non trovata")

    dati_prima = {"nome": stanza.nome, "descrizione": stanza.descrizione, "colore": stanza.colore, "attiva": stanza.attiva}
    aggiornamenti = dati.model_dump(exclude_unset=True)
    for campo, valore in aggiornamenti.items():
        setattr(stanza, campo, valore)

    LogService.log_versione(db=db, tabella="stanze", record_id=stanza_id, dati=dati_prima, modificato_da=utente_corrente.id)
    LogService.log_evento(
        db=db,
        operazione=TipoOperazione.UPDATE,
        utente_id=utente_corrente.id,
        tabella="stanze",
        record_id=stanza_id,
        modulo="stanze",
        dati_prima=dati_prima,
        dati_dopo=aggiornamenti,
        successo=True
    )
    db.commit()
    db.refresh(stanza)
    return stanza


@router.delete("/{stanza_id}")
def elimina_stanza(
    stanza_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    stanza = db.query(Stanza).filter(Stanza.id == stanza_id).first()
    if not stanza:
        raise HTTPException(status_code=404, detail="Stanza non trovata")

    from app.models.appuntamento import Appuntamento
    n = db.query(Appuntamento).filter(Appuntamento.sala == stanza.nome).count()
    if n:
        raise HTTPException(
            status_code=409,
            detail={"messaggio": "Impossibile eliminare: la stanza ha appuntamenti collegati.", "referenze": {"appuntamenti": n}}
        )

    dati_prima = {"nome": stanza.nome, "descrizione": stanza.descrizione, "colore": stanza.colore, "attiva": stanza.attiva}
    db.delete(stanza)
    LogService.log_evento(
        db=db,
        operazione=TipoOperazione.DELETE,
        utente_id=utente_corrente.id,
        tabella="stanze",
        record_id=stanza_id,
        modulo="stanze",
        dati_prima=dati_prima,
        successo=True
    )
    db.commit()
    return {"message": "Stanza eliminata con successo"}
