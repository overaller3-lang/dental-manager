from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.ordine import (
    DocumentoFiscaleResponse,
    DocumentiFiscaliPaginato,
    TotaliDocumentiFiscali,
)
from app.models.ordine import DocumentoFiscale, Ordine, TipoDocumentoFiscale
from app.models.paziente import Paziente
from app.models.utente import Utente


router = APIRouter(prefix="/documenti-fiscali", tags=["Documenti Fiscali"])


def _denormalizza(documento: DocumentoFiscale) -> DocumentoFiscale:
    if documento.paziente:
        documento.paziente_nome = documento.paziente.nome
        documento.paziente_cognome = documento.paziente.cognome
    if documento.ordine:
        documento.ordine_numero = documento.ordine.numero
    return documento


@router.get("/totali", response_model=TotaliDocumentiFiscali)
def totali_documenti(
    tipo: Optional[TipoDocumentoFiscale] = Query(None),
    paziente_id: Optional[int] = Query(None),
    data_da: Optional[date] = Query(None),
    data_a: Optional[date] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Somme di imponibile / IVA / totale e conteggio per il periodo selezionato."""
    query = db.query(
        func.coalesce(func.sum(DocumentoFiscale.totale_imponibile), 0),
        func.coalesce(func.sum(DocumentoFiscale.totale_iva), 0),
        func.coalesce(func.sum(DocumentoFiscale.totale), 0),
        func.count(DocumentoFiscale.id),
    )
    if tipo is not None:
        query = query.filter(DocumentoFiscale.tipo == tipo)
    if paziente_id is not None:
        query = query.filter(DocumentoFiscale.paziente_id == paziente_id)
    if data_da is not None:
        query = query.filter(DocumentoFiscale.data_emissione >= datetime.combine(data_da, datetime.min.time()))
    if data_a is not None:
        query = query.filter(DocumentoFiscale.data_emissione <= datetime.combine(data_a, datetime.max.time()))

    imp, iva, tot, cnt = query.one()
    return TotaliDocumentiFiscali(
        totale_imponibile=Decimal(str(imp)),
        totale_iva=Decimal(str(iva)),
        totale=Decimal(str(tot)),
        conteggio=cnt or 0,
    )


@router.get("", response_model=DocumentiFiscaliPaginato)
def lista_documenti(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    tipo: Optional[TipoDocumentoFiscale] = Query(None),
    paziente_id: Optional[int] = Query(None),
    ordine_id: Optional[int] = Query(None),
    data_da: Optional[date] = Query(None),
    data_a: Optional[date] = Query(None),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Lista documenti fiscali con filtri, paginazione e ordinamento server-side."""
    from app.api.deps import applica_ordinamento
    from app.models.paziente import Paziente
    from app.models.ordine import Ordine
    query = db.query(DocumentoFiscale).options(
        joinedload(DocumentoFiscale.paziente),
        joinedload(DocumentoFiscale.ordine),
        joinedload(DocumentoFiscale.voci),
    )
    if tipo is not None:
        query = query.filter(DocumentoFiscale.tipo == tipo)
    if paziente_id is not None:
        query = query.filter(DocumentoFiscale.paziente_id == paziente_id)
    if ordine_id is not None:
        query = query.filter(DocumentoFiscale.ordine_id == ordine_id)
    if data_da is not None:
        query = query.filter(DocumentoFiscale.data_emissione >= datetime.combine(data_da, datetime.min.time()))
    if data_a is not None:
        query = query.filter(DocumentoFiscale.data_emissione <= datetime.combine(data_a, datetime.max.time()))

    SORT_MAP = {
        'numero': DocumentoFiscale.numero,
        'tipo': DocumentoFiscale.tipo,
        'paziente_cognome': Paziente.cognome,
        'paziente_nome': Paziente.nome,
        'ordine_numero': Ordine.numero,
        'data_emissione': DocumentoFiscale.data_emissione,
        'totale_imponibile': DocumentoFiscale.totale_imponibile,
        'totale_iva': DocumentoFiscale.totale_iva,
        'totale': DocumentoFiscale.totale,
    }
    if ordina_per in ('paziente_cognome', 'paziente_nome'):
        query = query.join(Paziente, Paziente.id == DocumentoFiscale.paziente_id)
    elif ordina_per == 'ordine_numero':
        query = query.join(Ordine, Ordine.id == DocumentoFiscale.ordine_id)

    totale = query.count()
    if ordina_per:
        query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
    else:
        query = query.order_by(DocumentoFiscale.data_emissione.desc(), DocumentoFiscale.id.desc())
    items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()
    for d in items:
        _denormalizza(d)
    return {
        "items": items,
        "totale": totale,
        "pagina": pagina,
        "per_pagina": per_pagina,
        "pagine_totali": (totale + per_pagina - 1) // per_pagina,
    }


@router.get("/{documento_id}", response_model=DocumentoFiscaleResponse)
def get_documento(
    documento_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Dettaglio singolo documento fiscale (con voci)."""
    documento = (
        db.query(DocumentoFiscale)
        .options(
            joinedload(DocumentoFiscale.paziente),
            joinedload(DocumentoFiscale.ordine),
            joinedload(DocumentoFiscale.voci),
        )
        .filter(DocumentoFiscale.id == documento_id)
        .first()
    )
    if not documento:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Documento fiscale {documento_id} non trovato")
    return _denormalizza(documento)
