from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class ImpostazioniStudio(Base):
    __tablename__ = "impostazioni_studio"

    id = Column(Integer, primary_key=True, index=True)

    # Orari lavorativi
    ora_apertura = Column(String(5), nullable=False, default="08:00")
    ora_chiusura = Column(String(5), nullable=False, default="20:00")

    # Giorni lavorativi: 0=Lun, 1=Mar, 2=Mer, 3=Gio, 4=Ven, 5=Sab, 6=Dom
    giorni_lavorativi = Column(JSON, nullable=True)

    # Festività italiane disabilitate (lista "MM-DD" es. "12-25")
    festivita_disabilitate = Column(JSON, nullable=True)

    # Giorni extra chiusi (date specifiche "YYYY-MM-DD")
    giorni_extra_chiusi = Column(JSON, nullable=True)

    # Giorni extra aperti (override su festività o weekend, "YYYY-MM-DD")
    giorni_extra_aperti = Column(JSON, nullable=True)

    # Dati studio
    nome_studio = Column(String(200), nullable=True)
    indirizzo = Column(String(300), nullable=True)
    telefono = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    sito_web = Column(String(200), nullable=True)
    partita_iva = Column(String(20), nullable=True)
    codice_fiscale = Column(String(20), nullable=True)

    # Santo patrono locale (MM-DD)
    patrono_data = Column(String(5), nullable=True)
    patrono_nome = Column(String(100), nullable=True)

    # Festività personalizzate: [{data: "MM-DD", nome: "..."}]
    festivita_personalizzate = Column(JSON, nullable=True)

    # Pausa pranzo
    pausa_attiva = Column(Boolean, nullable=False, default=False)
    ora_inizio_pausa = Column(String(5), nullable=True, default="13:00")
    ora_fine_pausa = Column(String(5), nullable=True, default="14:00")

    # Notifiche
    promemoria_abilitato = Column(Boolean, nullable=False, default=True)
    promemoria_ore_prima = Column(Integer, nullable=False, default=24)
    promemoria_email = Column(Boolean, nullable=False, default=True)
    promemoria_sms = Column(Boolean, nullable=False, default=False)

    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
