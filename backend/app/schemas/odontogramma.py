from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from app.models.odontogramma import StatoDente


# Codici FDI ammessi: dentatura permanente 11-48, decidua 51-85
_FDI_PERMANENTI = {f"{q}{n}" for q in (1, 2, 3, 4) for n in range(1, 9)}
_FDI_DECIDUI = {f"{q}{n}" for q in (5, 6, 7, 8) for n in range(1, 6)}
FDI_VALIDI = _FDI_PERMANENTI | _FDI_DECIDUI


class DenteStatoBase(BaseModel):
    dente_codice: str = Field(..., min_length=2, max_length=2)
    stato: StatoDente = StatoDente.SANO
    note: Optional[str] = None


class DenteStatoUpsert(DenteStatoBase):
    """Body per POST /pazienti/{id}/odontogramma/{dente}."""
    pass


class DenteStatoResponse(DenteStatoBase):
    id: int
    paziente_id: int
    aggiornato_da: Optional[int] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class OdontogrammaResponse(BaseModel):
    paziente_id: int
    denti: List[DenteStatoResponse]
