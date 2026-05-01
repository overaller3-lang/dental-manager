from sqlalchemy import Column, Integer, String, ForeignKey, Text, Enum, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoDente(str, enum.Enum):
    """Stato clinico del singolo dente.

    Codifica semplificata: una sola "diagnosi" predominante per dente.
    Per il dettaglio per faccia o per più trattamenti concomitanti
    si usa il campo `note` libero.
    """
    SANO = "sano"
    CARIE = "carie"
    OTTURATO = "otturato"
    DEVITALIZZATO = "devitalizzato"
    PROTESI = "protesi"
    IMPIANTO = "impianto"
    ESTRATTO = "estratto"
    DA_ESTRARRE = "da_estrarre"
    FRATTURATO = "fratturato"
    MOBILE = "mobile"


class DenteStato(Base):
    """Stato corrente di un dente per un paziente (notazione FDI).

    Un'unica riga per (paziente_id, dente_codice). Le modifiche storiche
    sono tracciate dal LogService (log_versione) come per le altre tabelle.
    """
    __tablename__ = "denti_stato"
    __table_args__ = (
        UniqueConstraint("paziente_id", "dente_codice", name="uq_paziente_dente"),
    )

    id = Column(Integer, primary_key=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="CASCADE"), nullable=False, index=True)
    dente_codice = Column(String(2), nullable=False)  # FDI: 11-48 + 51-85 (decidui)
    stato = Column(Enum(StatoDente), nullable=False, default=StatoDente.SANO)
    note = Column(Text, nullable=True)

    aggiornato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    paziente = relationship("Paziente")
