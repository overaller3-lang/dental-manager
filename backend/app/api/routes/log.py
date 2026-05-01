from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_admin, get_db_session
from app.schemas.log import LogPaginato, LogVersioneResponse
from app.services.log_service import LogService
from app.models.utente import Utente

router = APIRouter(prefix="/log", tags=["Log e Audit"])


@router.get("/eventi", response_model=LogPaginato)
def lista_log_eventi(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(50, ge=1, le=200),
    utente_id: Optional[int] = Query(None),
    operazione: Optional[str] = Query(None),
    tabella: Optional[str] = Query(None),
    modulo: Optional[str] = Query(None),
    successo: Optional[bool] = Query(None),
    cerca: Optional[str] = Query(None, description="Ricerca su username, tabella, modulo, endpoint o ID record"),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """
    Lista eventi di log con filtri, ricerca, paginazione e ordinamento server-side.
    Solo admin — dati sensibili per audit GDPR.
    """
    return LogService.get_log_eventi(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        utente_id=utente_id,
        operazione=operazione,
        tabella=tabella,
        modulo=modulo,
        successo=successo,
        cerca=cerca,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/versioni/{tabella}/{record_id}", response_model=list[LogVersioneResponse])
def get_versioni_record(
    tabella: str,
    record_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """
    Storico completo delle versioni di un record.
    Permette di ricostruire lo stato di qualsiasi record nel tempo.
    Solo admin.
    """
    return LogService.get_versioni_record(
        db=db,
        tabella=tabella,
        record_id=record_id
    )