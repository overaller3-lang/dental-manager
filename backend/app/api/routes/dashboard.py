from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session
from typing import Any
from datetime import date, datetime
from pydantic import BaseModel
from app.api.deps import get_utente_corrente, get_db_session
from app.models.utente import Utente
from app.models.dashboard_layout import DashboardLayout
from app.models.appuntamento import Appuntamento
from app.models.ordine import Ordine, DocumentoFiscale, TipoDocumentoFiscale

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class LayoutPayload(BaseModel):
    layout: Any


@router.get("/layout")
def get_layout(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Layout dashboard dell'utente corrente. Restituisce null se non personalizzato."""
    riga = db.query(DashboardLayout).filter(DashboardLayout.utente_id == utente_corrente.id).first()
    return {"layout": riga.layout if riga else None}


@router.put("/layout")
def salva_layout(
    payload: LayoutPayload,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Salva o aggiorna il layout dashboard dell'utente corrente."""
    riga = db.query(DashboardLayout).filter(DashboardLayout.utente_id == utente_corrente.id).first()
    if riga is None:
        riga = DashboardLayout(utente_id=utente_corrente.id, layout=payload.layout)
        db.add(riga)
    else:
        riga.layout = payload.layout
    db.commit()
    return {"ok": True}


@router.get("/conteggio-giornaliero")
def conteggio_giornaliero(
    tipo: str = Query("appuntamenti", pattern="^(appuntamenti|ordini|fatture)$"),
    data_da: date = Query(...),
    data_a: date = Query(...),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Conteggio giornaliero per il widget calendario settimanale.
    Ritorna {YYYY-MM-DD: n} per il tipo richiesto (appuntamenti, ordini o fatture)."""
    inizio = datetime.combine(data_da, datetime.min.time())
    fine = datetime.combine(data_a, datetime.max.time())

    if tipo == "appuntamenti":
        col = Appuntamento.data_ora_inizio
        q = db.query(cast(col, Date).label("giorno"), func.count(Appuntamento.id).label("n"))
        q = q.filter(col >= inizio, col <= fine)
    elif tipo == "ordini":
        col = Ordine.created_at
        q = db.query(cast(col, Date).label("giorno"), func.count(Ordine.id).label("n"))
        q = q.filter(col >= inizio, col <= fine)
    else:  # fatture
        col = DocumentoFiscale.data_emissione
        q = db.query(cast(col, Date).label("giorno"), func.count(DocumentoFiscale.id).label("n"))
        q = q.filter(
            col >= inizio,
            col <= fine,
            DocumentoFiscale.tipo == TipoDocumentoFiscale.FATTURA,
        )

    righe = q.group_by("giorno").all()
    return {r.giorno.isoformat(): r.n for r in righe}


@router.delete("/layout")
def reset_layout(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Cancella il layout personalizzato (ripristina default)."""
    riga = db.query(DashboardLayout).filter(DashboardLayout.utente_id == utente_corrente.id).first()
    if riga is not None:
        db.delete(riga)
        db.commit()
    return {"ok": True}
