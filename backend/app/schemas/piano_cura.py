from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class StatoPianoCura(str, Enum):
    PROPOSTO = "proposto"
    ACCETTATO = "accettato"
    IN_CORSO = "in_corso"
    COMPLETATO = "completato"
    SOSPESO = "sospeso"
    ABBANDONATO = "abbandonato"


class PianoCuraBase(BaseModel):
    paziente_id: int
    dentista_referente_id: Optional[int] = None
    titolo: str
    diagnosi: Optional[str] = None
    obiettivo: Optional[str] = None
    note: Optional[str] = None


class PianoCuraCreate(PianoCuraBase):
    class Config:
        json_schema_extra = {
            "example": {
                "paziente_id": 1,
                "dentista_referente_id": 2,
                "titolo": "Implantologia settore 4",
                "diagnosi": "Edentulia parziale 4.6 e 4.7",
                "obiettivo": "Riabilitazione protesica fissa con due impianti",
            }
        }


class PianoCuraUpdate(BaseModel):
    dentista_referente_id: Optional[int] = None
    titolo: Optional[str] = None
    diagnosi: Optional[str] = None
    obiettivo: Optional[str] = None
    note: Optional[str] = None
    stato: Optional[StatoPianoCura] = None
    data_chiusura: Optional[datetime] = None


class PianoCuraResponse(PianoCuraBase):
    id: int
    numero: str
    stato: StatoPianoCura
    data_apertura: datetime
    data_chiusura: Optional[datetime] = None
    creato_da: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Denormalizzati per UI
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    dentista_referente_nome: Optional[str] = None
    dentista_referente_cognome: Optional[str] = None

    # Conteggi/stato derivati
    n_preventivi: int = 0
    n_appuntamenti_totali: int = 0
    n_appuntamenti_completati: int = 0
    ordine_id: Optional[int] = None
    ordine_totale: Optional[float] = None

    class Config:
        from_attributes = True


class PianoCuraPaginato(BaseModel):
    items: list[PianoCuraResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int
