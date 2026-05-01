from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Paziente(Base):
    __tablename__ = "pazienti"

    id = Column(Integer, primary_key=True, index=True)

    # Un paziente può avere un account utente oppure no
    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    # Anagrafica (separata da utenti per pazienti senza account)
    nome = Column(String(100), nullable=False)
    cognome = Column(String(100), nullable=False)
    codice_fiscale = Column(String(16), unique=True, nullable=True, index=True)
    data_nascita = Column(Date, nullable=True)
    sesso = Column(String(50), nullable=True)
    indirizzo = Column(Text, nullable=True)
    citta = Column(String(100), nullable=True)
    cap = Column(String(10), nullable=True)
    provincia = Column(String(2), nullable=True)

    # Contatti diretti del paziente
    telefono = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)

    # Dati clinici generali
    anamnesi = Column(Text, nullable=True)  # storia medica generale
    allergie = Column(Text, nullable=True)
    note = Column(Text, nullable=True)

    # Consensi (obbligatori per legge - L. 219/2017)
    consenso_trattamento = Column(Boolean, default=False, nullable=False)
    consenso_privacy = Column(Boolean, default=False, nullable=False)
    consenso_marketing = Column(Boolean, default=False, nullable=False)
    data_consenso = Column(DateTime(timezone=True), nullable=True)

    # GDPR - diritto all'oblio
    # Se True, i dati anagrafici vengono anonimizzati ma i record clinici restano
    anonimizzato = Column(Boolean, default=False, nullable=False)
    data_anonimizzazione = Column(DateTime(timezone=True), nullable=True)

    # Stato
    attivo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    utente = relationship("Utente")
    piani_cura = relationship("PianoCura", back_populates="paziente")
    appuntamenti = relationship("Appuntamento", back_populates="paziente")
    preventivi = relationship("Preventivo", back_populates="paziente")
    ordini = relationship("Ordine", back_populates="paziente")