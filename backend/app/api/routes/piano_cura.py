from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.piano_cura import (
    PianoCuraCreate, PianoCuraUpdate, PianoCuraResponse, PianoCuraPaginato,
)
from app.services.piano_cura_service import PianoCuraService
from app.models.utente import Utente

router = APIRouter(prefix="/piani-cura", tags=["Piani di cura"])


@router.post("", response_model=PianoCuraResponse, status_code=status.HTTP_201_CREATED)
def crea_piano(
    dati: PianoCuraCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Crea un nuovo piano di cura per un paziente. Stato iniziale: proposto."""
    return PianoCuraService.crea_piano(db=db, dati=dati, creato_da=utente_corrente.id)


@router.get("", response_model=PianoCuraPaginato)
def lista_piani(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    paziente_id: Optional[int] = Query(None),
    stato: Optional[str] = Query(None),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Lista piani di cura con filtri, paginazione e ordinamento server-side."""
    return PianoCuraService.get_piani(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id,
        stato=stato,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/{piano_id}", response_model=PianoCuraResponse)
def get_piano(
    piano_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Recupera un piano di cura per id (con preventivi/appuntamenti/ordine)."""
    return PianoCuraService.get_piano(db=db, piano_id=piano_id)


@router.patch("/{piano_id}", response_model=PianoCuraResponse)
def aggiorna_piano(
    piano_id: int,
    dati: PianoCuraUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Aggiorna un piano di cura (titolo, diagnosi, stato, ecc.)."""
    return PianoCuraService.aggiorna_piano(
        db=db, piano_id=piano_id, dati=dati, modificato_da=utente_corrente.id
    )
