from datetime import date, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from app.models.paziente import Paziente
from app.models.appuntamento import Appuntamento, StatoAppuntamento
from app.models.preventivo import Preventivo, StatoPreventivo
from app.models.odontogramma import DenteStato
from app.models.utente import Utente


class CartellaClinicaService:
    """
    Service di sola lettura: aggrega in un'unica vista i dati clinici di un
    paziente che oggi vivono in tabelle distinte (Paziente, Appuntamento,
    Preventivo, DenteStato). Non introduce nuove tabelle: la "cartella clinica"
    è una proiezione in tempo reale del database.
    """

    @staticmethod
    def _calcola_eta(data_nascita: Optional[date]) -> Optional[int]:
        if not data_nascita:
            return None
        oggi = date.today()
        eta = oggi.year - data_nascita.year
        if (oggi.month, oggi.day) < (data_nascita.month, data_nascita.day):
            eta -= 1
        return eta

    @staticmethod
    def _nome_dentista(app: Appuntamento) -> Optional[str]:
        if app.dentista:
            return f"{app.dentista.nome} {app.dentista.cognome}".strip()
        return None

    @staticmethod
    def _appuntamento_ha_dati_clinici(app: Appuntamento) -> bool:
        return any([
            app.anamnesi_aggiornamento,
            app.esame_obiettivo,
            app.diagnosi,
            app.trattamenti_eseguiti,
            app.note_cliniche,
            app.prossimo_controllo_data,
            app.prossimo_controllo_note,
        ])

    @staticmethod
    def get_cartella_clinica(db: Session, paziente_id: int) -> dict:
        paziente = db.query(Paziente).filter(Paziente.id == paziente_id).first()
        if not paziente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Paziente {paziente_id} non trovato"
            )

        # Header anagrafica con dati clinici di base sempre visibili
        header = {
            "id": paziente.id,
            "nome": paziente.nome,
            "cognome": paziente.cognome,
            "codice_fiscale": paziente.codice_fiscale,
            "data_nascita": paziente.data_nascita.isoformat() if paziente.data_nascita else None,
            "eta": CartellaClinicaService._calcola_eta(paziente.data_nascita),
            "sesso": paziente.sesso,
            "anamnesi_storica": paziente.anamnesi,
            "allergie": paziente.allergie,
            "note_generali": paziente.note,
            "anonimizzato": paziente.anonimizzato,
        }

        # Numero di denti con stato registrato (per indicare se l'odontogramma e' compilato)
        n_denti_registrati = db.query(DenteStato).filter(
            DenteStato.paziente_id == paziente_id
        ).count()

        timeline = []

        # Diari di visita: appuntamenti completati con almeno un campo clinico compilato
        appuntamenti = db.query(Appuntamento).options(
            joinedload(Appuntamento.dentista)
        ).filter(
            Appuntamento.paziente_id == paziente_id,
            Appuntamento.stato == StatoAppuntamento.COMPLETATO,
        ).order_by(Appuntamento.data_ora_inizio.desc()).all()

        for app in appuntamenti:
            if not CartellaClinicaService._appuntamento_ha_dati_clinici(app):
                continue
            timeline.append({
                "tipo": "diario_visita",
                "data": app.data_ora_inizio.isoformat(),
                "titolo": f"Visita {app.tipo.value if hasattr(app.tipo, 'value') else str(app.tipo)}",
                "operatore": CartellaClinicaService._nome_dentista(app),
                "appuntamento_id": app.id,
                "piano_cura_id": app.piano_cura_id,
                "dati": {
                    "anamnesi_aggiornamento": app.anamnesi_aggiornamento,
                    "esame_obiettivo": app.esame_obiettivo,
                    "diagnosi": app.diagnosi,
                    "trattamenti_eseguiti": app.trattamenti_eseguiti,
                    "note_cliniche": app.note_cliniche,
                    "prossimo_controllo_data": (
                        app.prossimo_controllo_data.isoformat()
                        if app.prossimo_controllo_data else None
                    ),
                    "prossimo_controllo_note": app.prossimo_controllo_note,
                },
            })

        # Consensi informati firmati (uno per ogni preventivo accettato e firmato)
        preventivi_consenso = db.query(Preventivo).filter(
            Preventivo.paziente_id == paziente_id,
            Preventivo.consenso_firmato == True,
            Preventivo.data_firma_consenso.isnot(None),
        ).order_by(Preventivo.data_firma_consenso.desc()).all()

        for prev in preventivi_consenso:
            timeline.append({
                "tipo": "consenso_firmato",
                "data": prev.data_firma_consenso.isoformat(),
                "titolo": f"Consenso informato firmato - Preventivo {prev.numero}",
                "operatore": None,
                "appuntamento_id": None,
                "piano_cura_id": prev.piano_cura_id,
                "preventivo_id": prev.id,
                "dati": {
                    "preventivo_numero": prev.numero,
                    "preventivo_descrizione": prev.descrizione,
                    "preventivo_totale": str(prev.totale),
                    "stato_preventivo": prev.stato.value if hasattr(prev.stato, "value") else str(prev.stato),
                },
            })

        # Ordinamento finale: timeline cronologica decrescente (la voce piu' recente in cima)
        timeline.sort(key=lambda x: x["data"], reverse=True)

        return {
            "paziente": header,
            "odontogramma": {
                "presente": n_denti_registrati > 0,
                "denti_registrati": n_denti_registrati,
            },
            "timeline": timeline,
            "totale_voci": len(timeline),
        }
