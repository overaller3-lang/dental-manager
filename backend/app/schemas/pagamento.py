from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal


class MetodoPagamento(str, Enum):
    CONTANTI = "contanti"
    CARTA_CREDITO = "carta_credito"
    CARTA_DEBITO = "carta_debito"
    BONIFICO = "bonifico"
    ASSEGNO = "assegno"


class StatoPagamento(str, Enum):
    IN_ATTESA = "in_attesa"
    COMPLETATO = "completato"
    FALLITO = "fallito"
    RIMBORSATO = "rimborsato"


class PagamentoBase(BaseModel):
    ordine_id: int
    paziente_id: int
    importo: Decimal
    metodo: MetodoPagamento
    note: Optional[str] = None
    riferimento_transazione: Optional[str] = None

    @field_validator("importo")
    @classmethod
    def importo_positivo(cls, v):
        if v <= 0:
            raise ValueError("L'importo deve essere maggiore di zero")
        return v


class PagamentoCreate(PagamentoBase):
    class Config:
        json_schema_extra = {
            "example": {
                "ordine_id": 1,
                "paziente_id": 1,
                "importo": 120.00,
                "metodo": "carta_credito",
                "riferimento_transazione": "TXN-20240601-001"
            }
        }


class PagamentoUpdate(BaseModel):
    stato: Optional[StatoPagamento] = None
    note: Optional[str] = None
    riferimento_transazione: Optional[str] = None
    data_pagamento: Optional[datetime] = None


class PagamentoResponse(PagamentoBase):
    id: int
    stato: StatoPagamento
    data_pagamento: Optional[datetime] = None
    registrato_da: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Dati denormalizzati per il frontend
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    ordine_numero: Optional[str] = None
    ricevuta_id: Optional[int] = None
    ricevuta_numero: Optional[str] = None

    class Config:
        from_attributes = True


class PagamentoPaginato(BaseModel):
    items: list[PagamentoResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int


class RiepilogoPagamenti(BaseModel):
    """Riepilogo finanziario per la dashboard."""
    totale_incassato: Decimal
    totale_in_attesa: Decimal
    totale_rimborsato: Decimal
    numero_pagamenti: int