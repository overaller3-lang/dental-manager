from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class SessoEnum(str, enum.Enum):
    M = "M"
    F = "F"
    ND = "ND"  # Non Dichiarato


class Utente(Base):
    __tablename__ = "utenti"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email_login = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

    # Anagrafica
    nome = Column(String(100), nullable=False)
    cognome = Column(String(100), nullable=False)
    codice_fiscale = Column(String(16), unique=True, nullable=True, index=True)
    data_nascita = Column(Date, nullable=True)
    sesso = Column(Enum(SessoEnum), nullable=True)
    indirizzo = Column(Text, nullable=True)
    citta = Column(String(100), nullable=True)
    cap = Column(String(10), nullable=True)
    provincia = Column(String(2), nullable=True)

    # Stato account
    attivo = Column(Boolean, default=True, nullable=False)
    email_verificata = Column(Boolean, default=False, nullable=False)
    primo_accesso = Column(Boolean, default=True, nullable=False)

    # Aspetto: colore di sfondo dell'avatar (hex es. "#2563eb")
    colore_avatar = Column(String(7), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    ultimo_accesso = Column(DateTime(timezone=True), nullable=True)

    # Relazioni
    ruoli = relationship("UtenteRuolo", foreign_keys="UtenteRuolo.utente_id", back_populates="utente", passive_deletes=True)
    contatti = relationship("Contatto", back_populates="utente", cascade="all, delete-orphan")
    log_eventi = relationship("LogEvento", back_populates="utente")


class Contatto(Base):
    """Tabella unificata per telefoni ed email secondarie degli utenti."""
    __tablename__ = "contatti"

    id = Column(Integer, primary_key=True, index=True)
    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False)
    tipo = Column(Enum("telefono", "email", "pec", name="tipo_contatto"), nullable=False)
    valore = Column(String(255), nullable=False)
    etichetta = Column(String(50), nullable=True)  # es. "cellulare", "lavoro", "casa"
    principale = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relazioni
    utente = relationship("Utente", back_populates="contatti")