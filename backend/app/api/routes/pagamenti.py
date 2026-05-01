from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.pagamento import PagamentoCreate, PagamentoResponse, PagamentoPaginato, RiepilogoPagamenti
from app.services.pagamento_service import PagamentoService
from app.models.utente import Utente

router = APIRouter(prefix="/pagamenti", tags=["Pagamenti"])


@router.post("", response_model=PagamentoResponse, status_code=status.HTTP_201_CREATED)
def registra_pagamento(
    dati: PagamentoCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Registra un pagamento per un ordine.
    Aggiorna automaticamente il residuo sull'ordine.
    """
    return PagamentoService.registra_pagamento(
        db=db,
        dati=dati,
        registrato_da=utente_corrente.id
    )


@router.get("", response_model=PagamentoPaginato)
def lista_pagamenti(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    paziente_id: Optional[int] = Query(None),
    ordine_id: Optional[int] = Query(None),
    stato: Optional[str] = Query(None),
    metodo: Optional[str] = Query(None),
    cerca: Optional[str] = Query(None, description="Ricerca su numero ordine e nome/cognome paziente"),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista pagamenti con filtri, ricerca, paginazione e ordinamento server-side."""
    return PagamentoService.get_pagamenti(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id,
        ordine_id=ordine_id,
        stato=stato,
        metodo=metodo,
        cerca=cerca,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/riepilogo", response_model=RiepilogoPagamenti)
def get_riepilogo(
    paziente_id: Optional[int] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Riepilogo finanziario per la dashboard."""
    return PagamentoService.get_riepilogo(db=db, paziente_id=paziente_id)


@router.get("/{pagamento_id}", response_model=PagamentoResponse)
def get_pagamento(
    pagamento_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un pagamento per id."""
    return PagamentoService.get_pagamento(db=db, pagamento_id=pagamento_id)


@router.post("/{pagamento_id}/rimborsa")
def rimborsa_pagamento(
    pagamento_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Rimborsa un pagamento e aggiorna il residuo sull'ordine."""
    PagamentoService.rimborsa_pagamento(
        db=db,
        pagamento_id=pagamento_id,
        rimborsato_da=utente_corrente.id
    )
    return {"message": f"Pagamento {pagamento_id} rimborsato con successo"}