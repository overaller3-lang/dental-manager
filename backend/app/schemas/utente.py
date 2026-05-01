from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime, date
from enum import Enum


class SessoEnum(str, Enum):
    M = "M"
    F = "F"
    ND = "ND"


class ContattoBase(BaseModel):
    tipo: str
    valore: str
    etichetta: Optional[str] = None
    principale: bool = False


class ContattoCreate(ContattoBase):
    pass


class ContattoResponse(ContattoBase):
    id: int
    utente_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class UtenteBase(BaseModel):
    username: str
    email_login: str
    nome: str
    cognome: str
    codice_fiscale: Optional[str] = None
    data_nascita: Optional[date] = None
    sesso: Optional[SessoEnum] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    colore_avatar: Optional[str] = None


class UtenteCreate(UtenteBase):
    """Schema per la creazione di un nuovo utente — include la password."""
    password: str
    ruolo_nome: Optional[str] = None
    ruoli_nomi: list[str] = []

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        if not any(c.isupper() for c in v):
            raise ValueError("La password deve contenere almeno una maiuscola")
        if not any(c.isdigit() for c in v):
            raise ValueError("La password deve contenere almeno un numero")
        return v


class UtenteUpdate(BaseModel):
    """Schema per la modifica — tutti i campi opzionali."""
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email_login: Optional[str] = None
    codice_fiscale: Optional[str] = None
    data_nascita: Optional[date] = None
    sesso: Optional[SessoEnum] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    attivo: Optional[bool] = None
    colore_avatar: Optional[str] = None


class UtenteResponse(UtenteBase):
    """
    Schema di risposta — NON include hashed_password.
    Il frontend non deve mai ricevere l'hash della password.
    """
    id: int
    attivo: bool
    email_verificata: bool
    primo_accesso: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    ultimo_accesso: Optional[datetime] = None
    contatti: list[ContattoResponse] = []
    ruoli: list[str] = []

    @field_validator('ruoli', mode='before')
    @classmethod
    def estrai_ruoli(cls, v):
        """Converte UtenteRuolo ORM → str. Accetta anche già-stringhe."""
        if not v:
            return []
        result = []
        for item in v:
            if isinstance(item, str):
                result.append(item)
            elif hasattr(item, 'ruolo') and item.ruolo is not None:
                result.append(item.ruolo.nome)
        return result

    class Config:
        from_attributes = True


class UtentePaginato(BaseModel):
    """Risposta paginata per la lista utenti."""
    items: list[UtenteResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int