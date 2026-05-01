from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CategoriaArticolo(Base):
    __tablename__ = "categorie_articoli"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), unique=True, nullable=False)
    descrizione = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relazioni
    articoli = relationship("Articolo", back_populates="categoria")


class Articolo(Base):
    """
    Catalogo di trattamenti e prodotti dello studio.
    Usato in preventivi, ordini e (in futuro) magazzino.
    """
    __tablename__ = "articoli"

    id = Column(Integer, primary_key=True, index=True)
    categoria_id = Column(Integer, ForeignKey("categorie_articoli.id", ondelete="SET NULL"), nullable=True)

    # Identificazione
    codice = Column(String(50), unique=True, nullable=False)  # es. "TRAT-001"
    nome = Column(String(255), nullable=False)
    descrizione = Column(Text, nullable=True)

    # Tipo
    tipo = Column(Enum("trattamento", "prodotto", "materiale", name="tipo_articolo"), nullable=False)

    # Prezzi
    prezzo_base = Column(Numeric(10, 2), nullable=False, default=0)
    aliquota_iva = Column(Numeric(5, 2), nullable=False, default=22)

    # Magazzino (predisposizione futura)
    gestione_magazzino = Column(Boolean, default=False, nullable=False)
    giacenza = Column(Numeric(10, 2), nullable=True, default=0)
    unita_misura = Column(String(20), nullable=True)  # es. "pz", "conf", "ml"
    scorta_minima = Column(Numeric(10, 2), nullable=True)

    # Stato
    attivo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relazioni
    categoria = relationship("CategoriaArticolo", back_populates="articoli")