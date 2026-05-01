from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Text, Enum, Numeric, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class StatoAppuntamento(str, enum.Enum):
    PRENOTATO = "prenotato"
    CONFERMATO = "confermato"
    IN_CORSO = "in_corso"
    COMPLETATO = "completato"
    ANNULLATO = "annullato"
    NON_PRESENTATO = "non_presentato"
    RINVIATO = "rinviato"


class TipoAppuntamento(str, enum.Enum):
    PRIMA_VISITA = "prima_visita"
    VISITA = "visita"
    IGIENE = "igiene"
    INTERVENTO = "intervento"
    URGENZA = "urgenza"
    CONTROLLO = "controllo"


class Appuntamento(Base):
    __tablename__ = "appuntamenti"
    __table_args__ = (
        Index('ix_appuntamenti_dentista_paziente', 'dentista_id', 'paziente_id'),
        Index('ix_appuntamenti_dentista_data', 'dentista_id', 'data_ora_inizio'),
        Index('ix_appuntamenti_paziente_data', 'paziente_id', 'data_ora_inizio'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Chi e con chi
    piano_cura_id = Column(Integer, ForeignKey("piani_cura.id", ondelete="RESTRICT"), nullable=False, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False, index=True)
    dentista_id = Column(Integer, ForeignKey("utenti.id", ondelete="RESTRICT"), nullable=False, index=True)
    creato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    # Quando e dove
    data_ora_inizio = Column(DateTime(timezone=True), nullable=False, index=True)
    data_ora_fine = Column(DateTime(timezone=True), nullable=False)
    sala = Column(String(50), nullable=True)  # es. "Studio 1", "Studio 2"

    # Tipo e stato
    tipo = Column(Enum(TipoAppuntamento), nullable=False, default=TipoAppuntamento.VISITA)
    stato = Column(Enum(StatoAppuntamento), nullable=False, default=StatoAppuntamento.PRENOTATO, index=True)

    # Dettagli
    motivo = Column(Text, nullable=True)         # motivo della visita (dichiarato dal paziente)
    note_cliniche = Column(Text, nullable=True)  # note del dentista dopo la visita
    note_segreteria = Column(Text, nullable=True)

    # Campi clinici della visita (compilati da IN_CORSO in poi)
    anamnesi_aggiornamento = Column(Text, nullable=True)
    esame_obiettivo = Column(Text, nullable=True)
    diagnosi = Column(Text, nullable=True)
    trattamenti_eseguiti = Column(Text, nullable=True)
    prossimo_controllo_data = Column(Date, nullable=True)
    prossimo_controllo_note = Column(Text, nullable=True)

    # Promemoria
    promemoria_inviato = Column(Boolean, default=False, nullable=False)
    data_promemoria = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    piano_cura = relationship("PianoCura", back_populates="appuntamenti")
    paziente = relationship("Paziente", back_populates="appuntamenti")
    dentista = relationship("Utente", foreign_keys=[dentista_id])
    creatore = relationship("Utente", foreign_keys=[creato_da])