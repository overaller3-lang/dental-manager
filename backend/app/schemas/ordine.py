from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal


class StatoOrdine(str, Enum):
    BOZZA = "bozza"
    CONFERMATO = "confermato"
    FATTURATO = "fatturato"
    ANNULLATO = "annullato"


class TipoDocumentoFiscale(str, Enum):
    FATTURA = "fattura"
    RICEVUTA = "ricevuta"
    DOCUMENTO_COMMERCIALE = "documento_commerciale"


class OrdineVoceBase(BaseModel):
    articolo_id: Optional[int] = None
    descrizione: str
    quantita: Decimal = Decimal("1")
    prezzo_unitario: Decimal
    aliquota_iva: Decimal = Decimal("22")
    note: Optional[str] = None
    ordine_visualizzazione: int = 0


class OrdineVoceCreate(OrdineVoceBase):
    pass


class OrdineVoceResponse(OrdineVoceBase):
    id: int
    ordine_id: int
    totale_voce: Decimal

    class Config:
        from_attributes = True


class DocumentoFiscaleVoceCreate(BaseModel):
    """Voce in input alla creazione di un documento fiscale."""
    ordine_voce_id: Optional[int] = None  # se valorizzato, è copia da una voce ordine
    descrizione: str
    quantita: Decimal = Decimal("1")
    prezzo_unitario: Decimal
    aliquota_iva: Decimal = Decimal("22")


class DocumentoFiscaleVoceResponse(BaseModel):
    id: int
    documento_fiscale_id: int
    ordine_voce_id: Optional[int] = None
    descrizione: str
    quantita: Decimal
    prezzo_unitario: Decimal
    aliquota_iva: Decimal
    totale_voce: Decimal
    ordine_visualizzazione: int

    class Config:
        from_attributes = True


class EmettiDocumentoRequest(BaseModel):
    """Body per l'emissione di un documento fiscale (fattura, ricevuta, documento commerciale)."""
    tipo: TipoDocumentoFiscale
    voci: list[DocumentoFiscaleVoceCreate] = []
    # Solo per RICEVUTA collegata a un singolo pagamento; se valorizzato, le voci possono essere ignorate
    # e i totali vengono calcolati dal pagamento (retro-compatibile con il flusso esistente).
    pagamento_id: Optional[int] = None


class DocumentoFiscaleResponse(BaseModel):
    id: int
    ordine_id: int
    paziente_id: int
    tipo: TipoDocumentoFiscale
    numero: str
    data_emissione: datetime
    totale_imponibile: Decimal
    totale_iva: Decimal
    totale: Decimal
    pdf_path: Optional[str] = None
    sdi_inviato: bool
    pagamento_id: Optional[int] = None  # popolato solo per RICEVUTA
    voci: list[DocumentoFiscaleVoceResponse] = []

    # Dati denormalizzati per il frontend (popolati nelle liste)
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    ordine_numero: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentiFiscaliPaginato(BaseModel):
    items: list[DocumentoFiscaleResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int


class TotaliDocumentiFiscali(BaseModel):
    totale_imponibile: Decimal
    totale_iva: Decimal
    totale: Decimal
    conteggio: int


class OrdineBase(BaseModel):
    piano_cura_id: int
    paziente_id: int
    note: Optional[str] = None


class OrdineUpdate(BaseModel):
    stato: Optional[StatoOrdine] = None
    note: Optional[str] = None
    voci: Optional[list[OrdineVoceCreate]] = None


class OrdineResponse(OrdineBase):
    id: int
    numero: str
    stato: StatoOrdine
    totale_imponibile: Decimal
    totale_iva: Decimal
    totale: Decimal
    totale_pagato: Decimal
    totale_residuo: Decimal
    creato_da: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    voci: list[OrdineVoceResponse] = []
    documenti_fiscali: list[DocumentoFiscaleResponse] = []

    # Dati denormalizzati per il frontend
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    piano_cura_numero: Optional[str] = None
    piano_cura_titolo: Optional[str] = None

    class Config:
        from_attributes = True


class OrdinePaginato(BaseModel):
    items: list[OrdineResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int