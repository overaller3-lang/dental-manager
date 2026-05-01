from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal


class StatoPreventivo(str, Enum):
    BOZZA = "bozza"
    INVIATO = "inviato"
    ACCETTATO = "accettato"
    RIFIUTATO = "rifiutato"
    SCADUTO = "scaduto"


class PreventivoVoceBase(BaseModel):
    articolo_id: Optional[int] = None
    descrizione: str
    quantita: Decimal = Decimal("1")
    prezzo_unitario: Decimal
    aliquota_iva: Decimal = Decimal("22")
    sconto_percentuale: Decimal = Decimal("0")
    note: Optional[str] = None
    ordine: int = 0


class PreventivoVoceCreate(PreventivoVoceBase):
    pass


class PreventivoVoceResponse(PreventivoVoceBase):
    id: int
    preventivo_id: int
    totale_voce: Decimal

    class Config:
        from_attributes = True


class PreventivoBase(BaseModel):
    piano_cura_id: int
    paziente_id: int
    dentista_id: Optional[int] = None
    descrizione: Optional[str] = None
    note: Optional[str] = None
    data_scadenza: Optional[datetime] = None


class PreventivoCreate(PreventivoBase):
    voci: list[PreventivoVoceCreate]
    # Se True, il nuovo preventivo è una nuova versione che sostituisce quella attiva
    # del piano (la precedente diventa rifiutata e attivo=False).
    nuova_versione: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "piano_cura_id": 1,
                "paziente_id": 1,
                "dentista_id": 2,
                "descrizione": "Piano di cura per carie multipla",
                "voci": [
                    {
                        "descrizione": "Otturazione composita",
                        "quantita": 2,
                        "prezzo_unitario": 120.00,
                        "aliquota_iva": 22
                    },
                    {
                        "descrizione": "Visita di controllo",
                        "quantita": 1,
                        "prezzo_unitario": 50.00,
                        "aliquota_iva": 22
                    }
                ]
            }
        }


class PreventivoUpdate(BaseModel):
    dentista_id: Optional[int] = None
    descrizione: Optional[str] = None
    note: Optional[str] = None
    stato: Optional[StatoPreventivo] = None
    data_scadenza: Optional[datetime] = None
    consenso_firmato: Optional[bool] = None
    data_firma_consenso: Optional[datetime] = None
    voci: Optional[list[PreventivoVoceCreate]] = None


class PreventivoResponse(PreventivoBase):
    id: int
    numero: str
    versione: int
    attivo: bool
    stato: StatoPreventivo
    totale_imponibile: Decimal
    totale_iva: Decimal
    totale: Decimal
    consenso_firmato: bool
    data_firma_consenso: Optional[datetime] = None
    data_emissione: datetime
    data_scadenza: Optional[datetime] = None
    creato_da: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    voci: list[PreventivoVoceResponse] = []

    # Dati denormalizzati per il frontend
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    dentista_nome: Optional[str] = None
    dentista_cognome: Optional[str] = None

    class Config:
        from_attributes = True


class PreventivoPaginato(BaseModel):
    items: list[PreventivoResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int