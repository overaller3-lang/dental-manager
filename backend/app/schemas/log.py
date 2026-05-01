from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class TipoOperazione(str, Enum):
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    ACCESS_DENIED = "ACCESS_DENIED"


class LogEventoResponse(BaseModel):
    id: int
    utente_id: Optional[int] = None
    ip_address: Optional[str] = None
    operazione: TipoOperazione
    tabella: Optional[str] = None
    record_id: Optional[int] = None
    modulo: Optional[str] = None
    endpoint: Optional[str] = None
    dati_prima: Optional[Any] = None
    dati_dopo: Optional[Any] = None
    dettagli: Optional[Any] = None
    successo: bool
    messaggio_errore: Optional[str] = None
    created_at: datetime

    # Dati denormalizzati
    utente_username: Optional[str] = None
    utente_nome: Optional[str] = None
    utente_cognome: Optional[str] = None

    class Config:
        from_attributes = True


class LogVersioneResponse(BaseModel):
    id: int
    tabella: str
    record_id: int
    versione: int
    dati: Any
    modificato_da: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LogPaginato(BaseModel):
    items: list[LogEventoResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int


class FiltriLog(BaseModel):
    """Filtri per la ricerca nei log — usati nella dashboard admin."""
    utente_id: Optional[int] = None
    operazione: Optional[TipoOperazione] = None
    tabella: Optional[str] = None
    modulo: Optional[str] = None
    successo: Optional[bool] = None
    data_da: Optional[datetime] = None
    data_a: Optional[datetime] = None