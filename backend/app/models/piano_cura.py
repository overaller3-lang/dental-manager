from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoPianoCura(str, enum.Enum):
    PROPOSTO = "proposto"
    ACCETTATO = "accettato"
    IN_CORSO = "in_corso"
    COMPLETATO = "completato"
    SOSPESO = "sospeso"
    ABBANDONATO = "abbandonato"


class PianoCura(Base):
    """
    Piano di cura: hub del percorso terapeutico del paziente.
    Contiene 1..N preventivi (versioning), N appuntamenti (sedute) e 1 ordine cumulativo.
    """
    __tablename__ = "piani_cura"

    id = Column(Integer, primary_key=True, index=True)

    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False, index=True)
    dentista_referente_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    creato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    numero = Column(String(20), unique=True, nullable=False)  # es. "PC-2026-0001"
    titolo = Column(String(200), nullable=False)
    diagnosi = Column(Text, nullable=True)
    obiettivo = Column(Text, nullable=True)
    note = Column(Text, nullable=True)

    stato = Column(Enum(StatoPianoCura), nullable=False, default=StatoPianoCura.PROPOSTO, index=True)

    data_apertura = Column(DateTime(timezone=True), server_default=func.now())
    data_chiusura = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    paziente = relationship("Paziente", back_populates="piani_cura")
    dentista_referente = relationship("Utente", foreign_keys=[dentista_referente_id])
    creatore = relationship("Utente", foreign_keys=[creato_da])
    preventivi = relationship("Preventivo", back_populates="piano_cura", order_by="Preventivo.versione")
    appuntamenti = relationship("Appuntamento", back_populates="piano_cura")
    ordine = relationship("Ordine", back_populates="piano_cura", uselist=False)
