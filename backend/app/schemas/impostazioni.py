from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


class ImpostazioniUpdate(BaseModel):
    ora_apertura: Optional[str] = None
    ora_chiusura: Optional[str] = None
    giorni_lavorativi: Optional[List[int]] = None
    festivita_disabilitate: Optional[List[str]] = None
    giorni_extra_chiusi: Optional[List[str]] = None
    giorni_extra_aperti: Optional[List[str]] = None
    pausa_attiva: Optional[bool] = None
    ora_inizio_pausa: Optional[str] = None
    ora_fine_pausa: Optional[str] = None
    nome_studio: Optional[str] = None
    indirizzo: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sito_web: Optional[str] = None
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    promemoria_abilitato: Optional[bool] = None
    promemoria_ore_prima: Optional[int] = None
    promemoria_email: Optional[bool] = None
    promemoria_sms: Optional[bool] = None
    patrono_data: Optional[str] = None
    patrono_nome: Optional[str] = None
    festivita_personalizzate: Optional[List[dict]] = None


class ImpostazioniResponse(BaseModel):
    id: int
    ora_apertura: str
    ora_chiusura: str
    giorni_lavorativi: List[int]
    festivita_disabilitate: List[str]
    giorni_extra_chiusi: List[str]
    giorni_extra_aperti: List[str]
    pausa_attiva: bool = False
    ora_inizio_pausa: Optional[str] = "13:00"
    ora_fine_pausa: Optional[str] = "14:00"
    nome_studio: Optional[str] = None
    indirizzo: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sito_web: Optional[str] = None
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    promemoria_abilitato: bool
    promemoria_ore_prima: int
    promemoria_email: bool
    promemoria_sms: bool
    patrono_data: Optional[str] = None
    patrono_nome: Optional[str] = None
    festivita_personalizzate: Optional[List[dict]] = None
    updated_at: Optional[datetime] = None

    @field_validator('giorni_lavorativi', mode='before')
    @classmethod
    def default_giorni_lavorativi(cls, v):
        return v if v is not None else [0, 1, 2, 3, 4]

    @field_validator('festivita_disabilitate', 'giorni_extra_chiusi', 'giorni_extra_aperti', mode='before')
    @classmethod
    def default_lista(cls, v):
        return v if v is not None else []

    class Config:
        from_attributes = True
