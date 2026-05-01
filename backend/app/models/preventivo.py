from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoPreventivo(str, enum.Enum):
    BOZZA = "bozza"
    INVIATO = "inviato"
    ACCETTATO = "accettato"
    RIFIUTATO = "rifiutato"
    SCADUTO = "scaduto"


class Preventivo(Base):
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)

    # Riferimenti
    piano_cura_id = Column(Integer, ForeignKey("piani_cura.id", ondelete="RESTRICT"), nullable=False, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False, index=True)
    dentista_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    creato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    # Versioning all'interno del piano (1, 2, 3, ...). Solo uno con attivo=True per piano.
    versione = Column(Integer, nullable=False, default=1)
    attivo = Column(Boolean, nullable=False, default=True)

    # Dati preventivo
    numero = Column(String(20), unique=True, nullable=False)  # es. "PREV-2024-0001"
    stato = Column(Enum(StatoPreventivo), nullable=False, default=StatoPreventivo.BOZZA, index=True)
    descrizione = Column(Text, nullable=True)
    note = Column(Text, nullable=True)

    # Importi
    totale_imponibile = Column(Numeric(10, 2), nullable=False, default=0)
    totale_iva = Column(Numeric(10, 2), nullable=False, default=0)
    totale = Column(Numeric(10, 2), nullable=False, default=0)

    # Validità (obbligo di legge - D.Lgs. 206/2005)
    data_emissione = Column(DateTime(timezone=True), server_default=func.now())
    data_scadenza = Column(DateTime(timezone=True), nullable=True)  # di solito 30-90 giorni

    # Consenso informato (obbligo di legge - L. 219/2017)
    consenso_firmato = Column(Boolean, default=False, nullable=False)
    data_firma_consenso = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    piano_cura = relationship("PianoCura", back_populates="preventivi")
    paziente = relationship("Paziente", back_populates="preventivi")
    dentista = relationship("Utente", foreign_keys=[dentista_id])
    creatore = relationship("Utente", foreign_keys=[creato_da])
    voci = relationship("PreventivoVoce", back_populates="preventivo", cascade="all, delete-orphan")


class PreventivoVoce(Base):
    """Singola voce/trattamento all'interno di un preventivo."""
    __tablename__ = "preventivi_voci"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, index=True)
    articolo_id = Column(Integer, ForeignKey("articoli.id", ondelete="RESTRICT"), nullable=True)

    # Dati voce (copiati dall'articolo al momento della creazione
    # così il preventivo non cambia se l'articolo viene modificato)
    descrizione = Column(Text, nullable=False)
    quantita = Column(Numeric(10, 2), nullable=False, default=1)
    prezzo_unitario = Column(Numeric(10, 2), nullable=False)
    aliquota_iva = Column(Numeric(5, 2), nullable=False, default=22)
    sconto_percentuale = Column(Numeric(5, 2), nullable=False, default=0)  # 0-100
    totale_voce = Column(Numeric(10, 2), nullable=False)
    note = Column(Text, nullable=True)
    ordine = Column(Integer, nullable=False, default=0)  # ordine di visualizzazione

    # Relazioni
    preventivo = relationship("Preventivo", back_populates="voci")
    articolo = relationship("Articolo")