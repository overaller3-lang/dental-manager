from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Stanza(Base):
    __tablename__ = "stanze"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    descrizione = Column(Text, nullable=True)
    # Colore di sfondo associato alla stanza (hex es. "#fef3c7"). Viene
    # propagato a tutte le tabelle che mostrano la sala come sfondo della
    # cella, in modo da rendere riconoscibili a colpo d'occhio gli
    # appuntamenti per stanza.
    colore = Column(String(7), nullable=True)
    attiva = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
