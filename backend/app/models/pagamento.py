from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class MetodoPagamento(str, enum.Enum):
    CONTANTI = "contanti"
    CARTA_CREDITO = "carta_credito"
    CARTA_DEBITO = "carta_debito"
    BONIFICO = "bonifico"
    ASSEGNO = "assegno"


class StatoPagamento(str, enum.Enum):
    IN_ATTESA = "in_attesa"
    COMPLETATO = "completato"
    FALLITO = "fallito"
    RIMBORSATO = "rimborsato"


class Pagamento(Base):
    __tablename__ = "pagamenti"

    id = Column(Integer, primary_key=True, index=True)

    # Riferimenti
    ordine_id = Column(Integer, ForeignKey("ordini.id", ondelete="RESTRICT"), nullable=False, index=True)
    paziente_id = Column(Integer, ForeignKey("pazienti.id", ondelete="RESTRICT"), nullable=False, index=True)
    registrato_da = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)

    # Dati pagamento
    importo = Column(Numeric(10, 2), nullable=False)
    metodo = Column(Enum(MetodoPagamento), nullable=False)
    stato = Column(Enum(StatoPagamento), nullable=False, default=StatoPagamento.IN_ATTESA)
    note = Column(Text, nullable=True)

    # Riferimento transazione (per carta/bonifico)
    riferimento_transazione = Column(String(255), nullable=True)

    # Timestamps
    data_pagamento = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    ordine = relationship("Ordine", back_populates="pagamenti")
    paziente = relationship("Paziente")
    registrato_da_utente = relationship("Utente")
    # Ricevuta fiscale eventualmente emessa per questo pagamento
    ricevuta = relationship("DocumentoFiscale", back_populates="pagamento", uselist=False)