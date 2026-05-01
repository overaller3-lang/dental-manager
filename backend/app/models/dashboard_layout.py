from sqlalchemy import Column, Integer, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class DashboardLayout(Base):
    __tablename__ = "dashboard_layout_utente"

    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), primary_key=True)
    layout = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
