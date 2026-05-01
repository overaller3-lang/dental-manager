from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    """Dati inviati dal frontend per il login."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """Risposta del server dopo un login riuscito."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    utente_id: int
    username: str
    nome: str
    cognome: str
    ruoli: list[str]


class TokenData(BaseModel):
    """Dati estratti dal JWT token."""
    utente_id: Optional[int] = None
    username: Optional[str] = None
    ruoli: list[str] = []


class CambioPasswordRequest(BaseModel):
    """Richiesta di cambio password."""
    password_attuale: str
    nuova_password: str
    conferma_password: str