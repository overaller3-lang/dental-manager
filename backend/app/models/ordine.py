from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoOrdine(str, enum.Enum):
    BOZZA = "bozza"
    CONFERMATO = "confermato"
    FATTURATO = "fatturato"
    ANNULLATO = "annullato"


class TipoDocumentoFiscale(str, enum.Enum):
    FATTURA = "fattura"
    RICEVUTA = "ricevuta"
    DOCUMENTO_COMMERCIALE = "documento_commerciale"


class Ordine(Base):
    """
    Ordine cumulativo del piano di cura (1:1 con PianoCura).
    Nasce lazy alla prima seduta completata; le voci si aggiungono man mano.
    Flusso: PianoCura → Preventivo → Appuntamento (completato) → Ordine → Pagamento → Documento Fiscale
    """
    __tablename__ = "ordini"

    id = Column(Integer, primary_key=True, index=True)

    # Riferimenti — l'ordine appartiene a un piano di cura (1:1).
    # Per tracciabilità diretta manteniamo anche paziente_id (= piano_cura.paziente_id).
    piano_cura_id = Column(Integer, ForeignKey("piani_cura.id", ondelete="RESTRICT"), nullable=False, unique=True, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False, index=True)
    creato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    # Identificazione
    numero = Column(String(20), unique=True, nullable=False)  # es. "ORD-2024-0001"
    stato = Column(Enum(StatoOrdine), nullable=False, default=StatoOrdine.BOZZA, index=True)
    note = Column(Text, nullable=True)

    # Importi
    totale_imponibile = Column(Numeric(10, 2), nullable=False, default=0)
    totale_iva = Column(Numeric(10, 2), nullable=False, default=0)
    totale = Column(Numeric(10, 2), nullable=False, default=0)
    totale_pagato = Column(Numeric(10, 2), nullable=False, default=0)
    totale_residuo = Column(Numeric(10, 2), nullable=False, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    piano_cura = relationship("PianoCura", back_populates="ordine")
    paziente = relationship("Paziente", back_populates="ordini")
    creatore = relationship("Utente")
    voci = relationship("OrdineVoce", back_populates="ordine", cascade="all, delete-orphan")
    pagamenti = relationship("Pagamento", back_populates="ordine")
    documenti_fiscali = relationship("DocumentoFiscale", back_populates="ordine", cascade="all, delete-orphan")


class OrdineVoce(Base):
    """Singola voce/trattamento erogato nell'ordine."""
    __tablename__ = "ordini_voci"

    id = Column(Integer, primary_key=True, index=True)
    ordine_id = Column(Integer, ForeignKey("ordini.id", ondelete="CASCADE"), nullable=False, index=True)
    articolo_id = Column(Integer, ForeignKey("articoli.id", ondelete="RESTRICT"), nullable=True)

    # Dati voce (copiati al momento della creazione, come nel preventivo)
    descrizione = Column(Text, nullable=False)
    quantita = Column(Numeric(10, 2), nullable=False, default=1)
    prezzo_unitario = Column(Numeric(10, 2), nullable=False)
    aliquota_iva = Column(Numeric(5, 2), nullable=False, default=22)
    totale_voce = Column(Numeric(10, 2), nullable=False)
    note = Column(Text, nullable=True)
    ordine_visualizzazione = Column(Integer, nullable=False, default=0)

    # Relazioni
    ordine = relationship("Ordine", back_populates="voci")
    articolo = relationship("Articolo")


class DocumentoFiscale(Base):
    """
    Documento fiscale emesso a seguito di un ordine pagato.
    In produzione richiederebbe integrazione con SDI (Agenzia delle Entrate).
    Per il PW viene generato come PDF simulato.
    """
    __tablename__ = "documenti_fiscali"

    id = Column(Integer, primary_key=True, index=True)
    ordine_id = Column(Integer, ForeignKey("ordini.id", ondelete="RESTRICT"), nullable=False, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False)
    # Solo per RICEVUTA: il pagamento specifico cui si riferisce
    pagamento_id = Column(Integer, ForeignKey("pagamenti.id", ondelete="SET NULL"), nullable=True, index=True)

    # Identificazione
    tipo = Column(Enum(TipoDocumentoFiscale), nullable=False)
    numero = Column(String(20), unique=True, nullable=False)  # es. "FAT-2024-0001"
    data_emissione = Column(DateTime(timezone=True), server_default=func.now())

    # Importi
    totale_imponibile = Column(Numeric(10, 2), nullable=False)
    totale_iva = Column(Numeric(10, 2), nullable=False)
    totale = Column(Numeric(10, 2), nullable=False)

    # File PDF generato
    pdf_path = Column(String(500), nullable=True)

    # Note SDI (per report - integrazione futura)
    sdi_inviato = Column(Boolean, default=False, nullable=False)
    sdi_data_invio = Column(DateTime(timezone=True), nullable=True)
    sdi_codice_esito = Column(String(10), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relazioni
    ordine = relationship("Ordine", back_populates="documenti_fiscali")
    paziente = relationship("Paziente")
    pagamento = relationship("Pagamento", back_populates="ricevuta")
    voci = relationship("DocumentoFiscaleVoce", back_populates="documento", cascade="all, delete-orphan", order_by="DocumentoFiscaleVoce.ordine_visualizzazione")


class DocumentoFiscaleVoce(Base):
    """
    Singola voce di un documento fiscale.
    Le voci sono copiate (non riferite) dall'ordine al momento dell'emissione,
    così il documento resta immutabile anche se l'ordine viene modificato.
    `ordine_voce_id` è opzionale: null per voci libere (es. "Acconto 50% su PC-XXX").
    """
    __tablename__ = "documenti_fiscali_voci"

    id = Column(Integer, primary_key=True, index=True)
    documento_fiscale_id = Column(Integer, ForeignKey("documenti_fiscali.id", ondelete="CASCADE"), nullable=False, index=True)
    ordine_voce_id = Column(Integer, ForeignKey("ordini_voci.id", ondelete="SET NULL"), nullable=True)

    descrizione = Column(Text, nullable=False)
    quantita = Column(Numeric(10, 2), nullable=False, default=1)
    prezzo_unitario = Column(Numeric(10, 2), nullable=False)
    aliquota_iva = Column(Numeric(5, 2), nullable=False, default=22)
    totale_voce = Column(Numeric(10, 2), nullable=False)
    ordine_visualizzazione = Column(Integer, nullable=False, default=0)

    documento = relationship("DocumentoFiscale", back_populates="voci")