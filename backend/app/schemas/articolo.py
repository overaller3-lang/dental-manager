from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal


class TipoArticolo(str, Enum):
    TRATTAMENTO = "trattamento"
    PRODOTTO = "prodotto"
    MATERIALE = "materiale"


class CategoriaArticoloBase(BaseModel):
    nome: str
    descrizione: Optional[str] = None


class CategoriaArticoloCreate(CategoriaArticoloBase):
    pass


class CategoriaArticoloResponse(CategoriaArticoloBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ArticoloBase(BaseModel):
    categoria_id: Optional[int] = None
    codice: str
    nome: str
    descrizione: Optional[str] = None
    tipo: TipoArticolo
    prezzo_base: Decimal = Decimal("0")
    aliquota_iva: Decimal = Decimal("22")
    gestione_magazzino: bool = False
    giacenza: Optional[Decimal] = None
    unita_misura: Optional[str] = None
    scorta_minima: Optional[Decimal] = None


class ArticoloCreate(ArticoloBase):
    class Config:
        json_schema_extra = {
            "example": {
                "codice": "TRAT-001",
                "nome": "Otturazione composita",
                "tipo": "trattamento",
                "prezzo_base": 120.00,
                "aliquota_iva": 22
            }
        }


class ArticoloUpdate(BaseModel):
    categoria_id: Optional[int] = None
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    prezzo_base: Optional[Decimal] = None
    aliquota_iva: Optional[Decimal] = None
    gestione_magazzino: Optional[bool] = None
    giacenza: Optional[Decimal] = None
    unita_misura: Optional[str] = None
    scorta_minima: Optional[Decimal] = None
    attivo: Optional[bool] = None


class ArticoloResponse(ArticoloBase):
    id: int
    attivo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    categoria: Optional[CategoriaArticoloResponse] = None

    class Config:
        from_attributes = True


class ArticoloPaginato(BaseModel):
    items: list[ArticoloResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int