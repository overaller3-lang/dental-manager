from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime, date
from enum import Enum


class StatoAppuntamento(str, Enum):
    PRENOTATO = "prenotato"
    CONFERMATO = "confermato"
    IN_CORSO = "in_corso"
    COMPLETATO = "completato"
    ANNULLATO = "annullato"
    NON_PRESENTATO = "non_presentato"
    RINVIATO = "rinviato"


class TipoAppuntamento(str, Enum):
    PRIMA_VISITA = "prima_visita"
    VISITA = "visita"
    IGIENE = "igiene"
    INTERVENTO = "intervento"
    URGENZA = "urgenza"
    CONTROLLO = "controllo"


class AppuntamentoBase(BaseModel):
    piano_cura_id: int
    paziente_id: int
    dentista_id: int
    data_ora_inizio: datetime
    data_ora_fine: datetime
    sala: Optional[str] = None
    tipo: TipoAppuntamento = TipoAppuntamento.VISITA
    motivo: Optional[str] = None
    note_segreteria: Optional[str] = None

    @field_validator("data_ora_fine")
    @classmethod
    def fine_dopo_inizio(cls, v, info):
        if "data_ora_inizio" in info.data and v <= info.data["data_ora_inizio"]:
            raise ValueError("La data di fine deve essere successiva alla data di inizio")
        return v


class AppuntamentoCreate(AppuntamentoBase):
    # In creazione la stanza è obbligatoria (override del default Optional in Base,
    # che resta None per supportare eventuali record storici nella Response).
    sala: str

    class Config:
        json_schema_extra = {
            "example": {
                "piano_cura_id": 1,
                "paziente_id": 1,
                "dentista_id": 2,
                "data_ora_inizio": "2024-06-01T09:00:00",
                "data_ora_fine": "2024-06-01T10:00:00",
                "sala": "Studio 1",
                "tipo": "visita",
                "motivo": "Dolore al molare sinistro"
            }
        }


class AppuntamentoUpdate(BaseModel):
    piano_cura_id: Optional[int] = None
    paziente_id: Optional[int] = None
    dentista_id: Optional[int] = None
    data_ora_inizio: Optional[datetime] = None
    data_ora_fine: Optional[datetime] = None
    sala: Optional[str] = None
    tipo: Optional[TipoAppuntamento] = None
    stato: Optional[StatoAppuntamento] = None
    motivo: Optional[str] = None
    note_cliniche: Optional[str] = None
    note_segreteria: Optional[str] = None
    # Campi clinici della visita
    anamnesi_aggiornamento: Optional[str] = None
    esame_obiettivo: Optional[str] = None
    diagnosi: Optional[str] = None
    trattamenti_eseguiti: Optional[str] = None
    prossimo_controllo_data: Optional[date] = None
    prossimo_controllo_note: Optional[str] = None


class AppuntamentoResponse(AppuntamentoBase):
    id: int
    stato: StatoAppuntamento
    creato_da: Optional[int] = None
    note_cliniche: Optional[str] = None
    promemoria_inviato: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Campi clinici della visita
    anamnesi_aggiornamento: Optional[str] = None
    esame_obiettivo: Optional[str] = None
    diagnosi: Optional[str] = None
    trattamenti_eseguiti: Optional[str] = None
    prossimo_controllo_data: Optional[date] = None
    prossimo_controllo_note: Optional[str] = None

    # Dati denormalizzati per comodità del frontend
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    dentista_nome: Optional[str] = None
    dentista_cognome: Optional[str] = None
    ordine_id: Optional[int] = None
    ordine_numero: Optional[str] = None

    class Config:
        from_attributes = True


class AppuntamentoPaginato(BaseModel):
    items: list[AppuntamentoResponse]
    totale: int
    pagina: int
    per_pagina: int
    pagine_totali: int


class AgendaGiornaliera(BaseModel):
    """Vista agenda per il dentista — usata nella dashboard."""
    data: str
    appuntamenti: list[AppuntamentoResponse]
    totale: int