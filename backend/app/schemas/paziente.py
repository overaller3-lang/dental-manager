from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class PazienteBase(BaseModel):
    nome: str
    cognome: str
    codice_fiscale: Optional[str] = None
    data_nascita: Optional[date] = None
    sesso: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    anamnesi: Optional[str] = None
    allergie: Optional[str] = None
    note: Optional[str] = None


class PazienteCreate(PazienteBase):
    consenso_trattamento: bool
    consenso_privacy: bool
    consenso_marketing: bool = False


class PazienteUpdate(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    codice_fiscale: Optional[str] = None
    data_nascita: Optional[date] = None
    sesso: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    anamnesi: Optional[str] = None
    allergie: Optional[str] = None
    note: Optional[str] = None
    attivo: Optional[bool] = None


class PazienteResponse(PazienteBase):
    id: int
    utente_id: Optional[int] = None
    consenso_trattamento: bool
    consenso_privacy: bool
    consenso_marketing: bool
    data_consenso: Optional[datetime] = None
    anonimizzato: bool
    attivo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PazientePaginato(BaseModel):
    items: list[PazienteResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int