from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.preventivo import PreventivoCreate, PreventivoUpdate, PreventivoResponse, PreventivoPaginato
from app.services.preventivo_service import PreventivoService
from app.models.utente import Utente

router = APIRouter(prefix="/preventivi", tags=["Preventivi"])


@router.post("", response_model=PreventivoResponse, status_code=status.HTTP_201_CREATED)
def crea_preventivo(
    dati: PreventivoCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Crea un nuovo preventivo.
    Obbligo di legge per trattamenti odontoiatrici (D.Lgs. 206/2005).
    Scadenza default 30 giorni.
    """
    return PreventivoService.crea_preventivo(
        db=db,
        dati=dati,
        creato_da=utente_corrente.id
    )


@router.get("", response_model=PreventivoPaginato)
def lista_preventivi(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    paziente_id: Optional[int] = Query(None),
    dentista_id: Optional[int] = Query(None),
    stato: Optional[str] = Query(None),
    piano_cura_id: Optional[int] = Query(None),
    cerca: Optional[str] = Query(None, description="Ricerca su numero, descrizione, nome e cognome paziente"),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista preventivi con filtri, ricerca, paginazione e ordinamento server-side."""
    return PreventivoService.get_preventivi(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id,
        dentista_id=dentista_id,
        stato=stato,
        piano_cura_id=piano_cura_id,
        cerca=cerca,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/{preventivo_id}", response_model=PreventivoResponse)
def get_preventivo(
    preventivo_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un preventivo per id."""
    return PreventivoService.get_preventivo(db=db, preventivo_id=preventivo_id)


@router.patch("/{preventivo_id}", response_model=PreventivoResponse)
def aggiorna_preventivo(
    preventivo_id: int,
    dati: PreventivoUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Aggiorna un preventivo.
    Solo i preventivi in stato BOZZA o INVIATO possono essere modificati.
    """
    return PreventivoService.aggiorna_preventivo(
        db=db,
        preventivo_id=preventivo_id,
        dati=dati,
        modificato_da=utente_corrente.id
    )


@router.post("/{preventivo_id}/invia")
def invia_preventivo(
    preventivo_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Cambia stato preventivo da BOZZA a INVIATO."""
    from app.models.preventivo import StatoPreventivo
    PreventivoService.aggiorna_preventivo(
        db=db,
        preventivo_id=preventivo_id,
        dati=PreventivoUpdate(stato=StatoPreventivo.INVIATO),
        modificato_da=utente_corrente.id
    )
    return {"message": f"Preventivo {preventivo_id} inviato con successo"}


@router.post("/{preventivo_id}/firma-consenso")
def firma_consenso(
    preventivo_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Registra la firma del consenso informato (L. 219/2017).
    Obbligatorio prima di procedere con i trattamenti.
    """
    from datetime import datetime, timezone
    PreventivoService.aggiorna_preventivo(
        db=db,
        preventivo_id=preventivo_id,
        dati=PreventivoUpdate(
            consenso_firmato=True,
            data_firma_consenso=datetime.now(timezone.utc)
        ),
        modificato_da=utente_corrente.id
    )
    return {"message": "Consenso informato registrato con successo"}