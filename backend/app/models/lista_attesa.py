from sqlalchemy import Column, Integer, String, ForeignKey, Text, Enum, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoAttesa(str, enum.Enum):
    IN_ATTESA = "in_attesa"
    CONTATTATO = "contattato"
    PRENOTATO = "prenotato"
    RIFIUTATO = "rifiutato"
    SCADUTO = "scaduto"


class PrioritaAttesa(str, enum.Enum):
    BASSA = "bassa"
    MEDIA = "media"
    ALTA = "alta"
    URGENTE = "urgente"


class ListaAttesa(Base):
    """Lista d'attesa per pazienti in cerca di slot.

    La segreteria aggiunge in coda i pazienti senza data certa; quando si
    libera uno slot li può richiamare e promuovere la richiesta in
    appuntamento vero e proprio (vedi route /promuovi).
    """
    __tablename__ = "lista_attesa"

    id = Column(Integer, primary_key=True, index=True)

    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="CASCADE"), nullable=False, index=True)
    dentista_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    tipo_appuntamento = Column(String(30), nullable=True)
    durata_stimata = Column(Integer, nullable=True)  # in minuti
    motivo = Column(Text, nullable=True)
    priorita = Column(Enum(PrioritaAttesa), nullable=False, default=PrioritaAttesa.MEDIA, index=True)

    stato = Column(Enum(StatoAttesa), nullable=False, default=StatoAttesa.IN_ATTESA, index=True)
    note = Column(Text, nullable=True)

    contattato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    data_contatto = Column(DateTime(timezone=True), nullable=True)

    appuntamento_id = Column(Integer, ForeignKey("appuntamenti.id", ondelete="SET NULL"), nullable=True)
    creato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    paziente = relationship("Paziente")
    dentista = relationship("Utente", foreign_keys=[dentista_id])
    appuntamento = relationship("Appuntamento", foreign_keys=[appuntamento_id])
