from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Funzione(Base):
    """Rappresenta una funzione/azione del sistema (es. 'crea_appuntamento')."""
    __tablename__ = "funzioni"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), unique=True, nullable=False)  # es. "crea_appuntamento"
    descrizione = Column(Text, nullable=True)
    modulo = Column(String(50), nullable=False)  # es. "appuntamenti", "pazienti", "pagamenti"
    attivo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relazioni
    privilegi = relationship("Privilegio", back_populates="funzione")


class Privilegio(Base):
    """Associa un ruolo a una funzione (matrice ruolo → permesso)."""
    __tablename__ = "privilegi"

    id = Column(Integer, primary_key=True, index=True)
    ruolo_id = Column(Integer, ForeignKey("ruoli.id", ondelete="CASCADE"), nullable=False)
    funzione_id = Column(Integer, ForeignKey("funzioni.id", ondelete="CASCADE"), nullable=False)
    can_read = Column(Boolean, default=True, nullable=False)
    can_write = Column(Boolean, default=False, nullable=False)
    can_delete = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relazioni
    ruolo = relationship("Ruolo", back_populates="privilegi")
    funzione = relationship("Funzione", back_populates="privilegi")