from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_utente_admin, get_db_session
from app.schemas.articolo import (
    ArticoloCreate, ArticoloUpdate, ArticoloResponse,
    ArticoloPaginato, CategoriaArticoloCreate, CategoriaArticoloResponse
)
from app.services.articolo_service import ArticoloService
from app.models.utente import Utente

router = APIRouter(prefix="/articoli", tags=["Articoli e Catalogo"])


@router.post("/categorie", response_model=CategoriaArticoloResponse, status_code=status.HTTP_201_CREATED)
def crea_categoria(
    dati: CategoriaArticoloCreate,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Crea una nuova categoria articoli. Solo admin."""
    return ArticoloService.crea_categoria(db=db, dati=dati, creato_da=utente_corrente.id)


@router.get("/categorie", response_model=list[CategoriaArticoloResponse])
def lista_categorie(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista tutte le categorie articoli."""
    return ArticoloService.get_categorie(db=db)


@router.post("", response_model=ArticoloResponse, status_code=status.HTTP_201_CREATED)
def crea_articolo(
    dati: ArticoloCreate,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Crea un nuovo articolo nel catalogo. Solo admin."""
    return ArticoloService.crea_articolo(db=db, dati=dati, creato_da=utente_corrente.id)


@router.get("", response_model=ArticoloPaginato)
def lista_articoli(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    cerca: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    categoria_id: Optional[int] = Query(None),
    attivo: Optional[bool] = Query(True),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista articoli con ricerca e filtri."""
    return ArticoloService.get_articoli(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        cerca=cerca,
        tipo=tipo,
        categoria_id=categoria_id,
        attivo=attivo
    )


@router.get("/{articolo_id}", response_model=ArticoloResponse)
def get_articolo(
    articolo_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un articolo per id."""
    return ArticoloService.get_articolo(db=db, articolo_id=articolo_id)


@router.patch("/{articolo_id}", response_model=ArticoloResponse)
def aggiorna_articolo(
    articolo_id: int,
    dati: ArticoloUpdate,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Aggiorna un articolo del catalogo. Solo admin."""
    return ArticoloService.aggiorna_articolo(
        db=db,
        articolo_id=articolo_id,
        dati=dati,
        modificato_da=utente_corrente.id
    )