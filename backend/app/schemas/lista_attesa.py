from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.lista_attesa import StatoAttesa, PrioritaAttesa


class ListaAttesaBase(BaseModel):
    paziente_id: int
    dentista_id: Optional[int] = None
    tipo_appuntamento: Optional[str] = None
    durata_stimata: Optional[int] = Field(default=None, ge=10, le=480)
    motivo: Optional[str] = None
    priorita: PrioritaAttesa = PrioritaAttesa.MEDIA
    note: Optional[str] = None


class ListaAttesaCreate(ListaAttesaBase):
    pass


class ListaAttesaUpdate(BaseModel):
    dentista_id: Optional[int] = None
    tipo_appuntamento: Optional[str] = None
    durata_stimata: Optional[int] = Field(default=None, ge=10, le=480)
    motivo: Optional[str] = None
    priorita: Optional[PrioritaAttesa] = None
    stato: Optional[StatoAttesa] = None
    note: Optional[str] = None


class ListaAttesaResponse(ListaAttesaBase):
    id: int
    stato: StatoAttesa
    appuntamento_id: Optional[int] = None
    contattato_da: Optional[int] = None
    data_contatto: Optional[datetime] = None
    created_at: Optional[datetime] = None
    paziente_nome: Optional[str] = None
    paziente_cognome: Optional[str] = None
    paziente_telefono: Optional[str] = None
    dentista_nome: Optional[str] = None
    dentista_cognome: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ListaAttesaPromuovi(BaseModel):
    """Body della richiesta di promozione a appuntamento."""
    piano_cura_id: int
    data_ora_inizio: datetime
    data_ora_fine: datetime
    sala: str
    dentista_id: Optional[int] = None  # se diverso da quello in lista


class ListaAttesaPaginato(BaseModel):
    items: List[ListaAttesaResponse]
    totale: int
