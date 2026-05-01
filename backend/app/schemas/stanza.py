from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class StanzaBase(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    colore: Optional[str] = None  # hex es. "#fef3c7"
    attiva: bool = True


class StanzaCreate(StanzaBase):
    pass


class StanzaUpdate(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    colore: Optional[str] = None
    attiva: Optional[bool] = None


class StanzaResponse(StanzaBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
