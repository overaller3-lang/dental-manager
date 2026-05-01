from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class TipoOperazione(str, enum.Enum):
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    ACCESS_DENIED = "ACCESS_DENIED"


class LogEvento(Base):
    """
    Log principale di tutte le operazioni significative nel sistema.
    Implementato come da requisiti GDPR per tracciabilità degli accessi
    e delle modifiche ai dati sanitari (categoria speciale ex art. 9 GDPR).
    """
    __tablename__ = "log_eventi"

    id = Column(Integer, primary_key=True, index=True)

    # Chi
    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)   # IPv4 o IPv6
    user_agent = Column(String(500), nullable=True)

    # Cosa
    operazione = Column(Enum(TipoOperazione), nullable=False, index=True)
    tabella = Column(String(100), nullable=True)     # tabella coinvolta
    record_id = Column(Integer, nullable=True)       # id del record coinvolto
    modulo = Column(String(100), nullable=True)      # es. "appuntamenti", "pazienti"
    endpoint = Column(String(255), nullable=True)    # es. "/api/appuntamenti/1"

    # Dettagli (JSON flessibile)
    dati_prima = Column(JSON, nullable=True)         # stato prima della modifica
    dati_dopo = Column(JSON, nullable=True)          # stato dopo la modifica
    dettagli = Column(JSON, nullable=True)           # informazioni aggiuntive

    # Esito
    successo = Column(Boolean, nullable=False, default=True)
    messaggio_errore = Column(Text, nullable=True)

    # Timestamp (non aggiornabile — i log sono immutabili)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relazioni
    utente = relationship("Utente", back_populates="log_eventi")


class LogVersione(Base):
    """
    Storico delle versioni di ogni record nel sistema.
    Permette di ricostruire lo stato di qualsiasi record in qualsiasi momento.
    Particolarmente importante per documenti clinici e dati sanitari.
    """
    __tablename__ = "log_versioni"

    id = Column(Integer, primary_key=True, index=True)

    # Quale record
    tabella = Column(String(100), nullable=False, index=True)
    record_id = Column(Integer, nullable=False, index=True)
    versione = Column(Integer, nullable=False, default=1)

    # Snapshot completo del record in quel momento
    dati = Column(JSON, nullable=False)

    # Chi e quando
    modificato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relazioni
    modificato_da_utente = relationship("Utente")