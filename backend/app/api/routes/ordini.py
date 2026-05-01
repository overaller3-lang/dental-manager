from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.ordine import OrdineUpdate, OrdineResponse, OrdinePaginato, OrdineVoceResponse, EmettiDocumentoRequest
from app.models.ordine import TipoDocumentoFiscale
from app.services.ordine_service import OrdineService
from app.models.utente import Utente

router = APIRouter(prefix="/ordini", tags=["Ordini"])


class AggiungiVoceRequest(BaseModel):
    """Body per aggiungere una voce all'ordine, da articolo del catalogo o libera."""
    articolo_id: Optional[int] = None
    descrizione: Optional[str] = None
    quantita: Decimal = Decimal("1")
    prezzo_unitario: Optional[Decimal] = None
    aliquota_iva: Optional[Decimal] = None
    note: Optional[str] = None


@router.get("", response_model=OrdinePaginato)
def lista_ordini(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    paziente_id: Optional[int] = Query(None),
    stato: Optional[str] = Query(None),
    cerca: Optional[str] = Query(None, description="Ricerca su numero ordine e nome/cognome paziente"),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista ordini con filtri, ricerca, paginazione e ordinamento server-side."""
    return OrdineService.get_ordini(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id,
        stato=stato,
        cerca=cerca,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/{ordine_id}", response_model=OrdineResponse)
def get_ordine(
    ordine_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un ordine per id."""
    return OrdineService.get_ordine(db=db, ordine_id=ordine_id)


@router.patch("/{ordine_id}", response_model=OrdineResponse)
def aggiorna_ordine(
    ordine_id: int,
    dati: OrdineUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Aggiorna stato/note di un ordine. Per modificare le voci usare gli endpoint dedicati."""
    return OrdineService.aggiorna_ordine(
        db=db, ordine_id=ordine_id, dati=dati, modificato_da=utente_corrente.id
    )


@router.post("/{ordine_id}/voci", response_model=OrdineVoceResponse, status_code=status.HTTP_201_CREATED)
def aggiungi_voce_ordine(
    ordine_id: int,
    dati: AggiungiVoceRequest,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Aggiunge una voce all'ordine (da articolo del catalogo o libera). Solo in stato BOZZA."""
    return OrdineService.aggiungi_voce(
        db=db,
        ordine_id=ordine_id,
        articolo_id=dati.articolo_id,
        descrizione=dati.descrizione,
        quantita=dati.quantita,
        prezzo_unitario=dati.prezzo_unitario,
        aliquota_iva=dati.aliquota_iva,
        note=dati.note,
        modificato_da=utente_corrente.id
    )


@router.delete("/{ordine_id}/voci/{voce_id}", status_code=status.HTTP_204_NO_CONTENT)
def rimuovi_voce_ordine(
    ordine_id: int,
    voce_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Rimuove una voce dall'ordine. Solo in stato BOZZA."""
    OrdineService.rimuovi_voce(
        db=db,
        ordine_id=ordine_id,
        voce_id=voce_id,
        modificato_da=utente_corrente.id
    )
    return None


@router.post("/{ordine_id}/emetti-documento")
def emetti_documento_fiscale(
    ordine_id: int,
    dati: EmettiDocumentoRequest,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Emette un documento fiscale (fattura/ricevuta/documento_commerciale) per un ordine.
    Le voci sono copiate dall'input nel documento al momento dell'emissione (immutabile).
    Per le ricevute è possibile collegare un singolo pagamento (`pagamento_id`): in tal caso
    i totali sono derivati dall'importo del pagamento e le voci sono opzionali.
    Vincolo per le FATTURE: la somma cumulativa fatturata sull'ordine non può eccedere il totale ordine.
    """
    documento = OrdineService.emetti_documento_fiscale(
        db=db,
        ordine_id=ordine_id,
        tipo=dati.tipo,
        emesso_da=utente_corrente.id,
        pagamento_id=dati.pagamento_id,
        voci_input=dati.voci,
    )
    return {
        "message": "Documento fiscale emesso con successo",
        "id": documento.id,
        "numero": documento.numero,
        "tipo": documento.tipo.value,
        "pagamento_id": documento.pagamento_id,
        "totale": str(documento.totale)
    }