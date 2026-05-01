from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Ruolo(Base):
    __tablename__ = "ruoli"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(50), unique=True, nullable=False)  # es. "admin", "dentista", "segreteria"
    descrizione = Column(Text, nullable=True)
    attivo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    utenti = relationship("UtenteRuolo", back_populates="ruolo")
    privilegi = relationship("Privilegio", back_populates="ruolo")


class UtenteRuolo(Base):
    """Tabella di associazione many-to-many tra utenti e ruoli."""
    __tablename__ = "utenti_ruoli"

    id = Column(Integer, primary_key=True, index=True)
    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False, index=True)
    ruolo_id = Column(Integer, ForeignKey("ruoli.id", ondelete="CASCADE"), nullable=False, index=True)
    assegnato_il = Column(DateTime(timezone=True), server_default=func.now())
    assegnato_da = Column(Integer, ForeignKey("utenti.id"), nullable=True)

    # Relazioni
    ruolo = relationship("Ruolo", back_populates="utenti")
    utente = relationship("Utente", foreign_keys=[utente_id], back_populates="ruoli")