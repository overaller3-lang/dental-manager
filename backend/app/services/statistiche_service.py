from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from enum import Enum

from app.models.appuntamento import Appuntamento, StatoAppuntamento
from app.models.ordine import Ordine, StatoOrdine
from app.models.utente import Utente


class Granularita(str, Enum):
    TOTALE = "totale"
    ANNO = "anno"
    MESE = "mese"
    SETTIMANA = "settimana"
    GIORNO = "giorno"


def _bucket_label(d: date, gran: Granularita) -> str:
    if gran == Granularita.GIORNO:
        return d.strftime("%Y-%m-%d")
    if gran == Granularita.SETTIMANA:
        iso = d.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if gran == Granularita.MESE:
        return d.strftime("%Y-%m")
    if gran == Granularita.ANNO:
        return d.strftime("%Y")
    return "totale"


class StatisticheService:

    @staticmethod
    def statistiche_operatore(
        db: Session,
        utente_id: int,
        data_inizio: Optional[date] = None,
        data_fine: Optional[date] = None,
        granularita: Granularita = Granularita.MESE,
    ) -> dict:
        """Statistiche di un operatore (dentista) su un range di date.

        Aggrega: ore lavorate, n° appuntamenti totali e completati,
        pazienti unici, fatturato generato (dagli ordini collegati).
        Restituisce anche una serie temporale per la granularità richiesta.
        """
        utente = db.query(Utente).filter(Utente.id == utente_id).first()
        if not utente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Utente {utente_id} non trovato"
            )

        # Default range: ultimi 30 giorni
        if data_fine is None:
            data_fine = date.today()
        if data_inizio is None:
            data_inizio = data_fine - timedelta(days=30)

        inizio_dt = datetime.combine(data_inizio, datetime.min.time(), tzinfo=timezone.utc)
        fine_dt = datetime.combine(data_fine, datetime.max.time(), tzinfo=timezone.utc)

        # Tutti gli appuntamenti dell'operatore nel range
        appuntamenti = db.query(Appuntamento).filter(
            Appuntamento.dentista_id == utente_id,
            Appuntamento.data_ora_inizio >= inizio_dt,
            Appuntamento.data_ora_inizio <= fine_dt,
        ).all()

        # Ordini collegati ai piani di cura di quegli appuntamenti.
        # Il fatturato di ogni ordine viene distribuito equamente sugli appuntamenti
        # COMPLETATI di quel piano nel periodo (per evitare di sovrastimare).
        ordini_per_appuntamento: dict[int, Decimal] = {}
        if appuntamenti:
            piani_ids = list({a.piano_cura_id for a in appuntamenti if a.piano_cura_id})
            if piani_ids:
                ordini = db.query(Ordine).filter(
                    Ordine.piano_cura_id.in_(piani_ids),
                    Ordine.stato.in_([StatoOrdine.CONFERMATO, StatoOrdine.FATTURATO]),
                ).all()
                for o in ordini:
                    appuntamenti_piano = [
                        a for a in appuntamenti
                        if a.piano_cura_id == o.piano_cura_id
                        and a.stato == StatoAppuntamento.COMPLETATO
                    ]
                    if not appuntamenti_piano:
                        continue
                    quota = Decimal(str(o.totale)) / Decimal(len(appuntamenti_piano))
                    for a in appuntamenti_piano:
                        ordini_per_appuntamento[a.id] = quota

        # Aggregati globali
        ore_totali = Decimal("0")
        completati = 0
        pazienti_unici: set[int] = set()
        fatturato_totale = Decimal("0")

        # Bucket temporale: chiave = label periodo
        buckets: dict[str, dict] = {}

        for a in appuntamenti:
            durata_ore = Decimal("0")
            if a.data_ora_fine and a.data_ora_inizio:
                delta = a.data_ora_fine - a.data_ora_inizio
                durata_ore = Decimal(str(delta.total_seconds())) / Decimal("3600")
            ore_totali += durata_ore

            if a.stato == StatoAppuntamento.COMPLETATO:
                completati += 1
            pazienti_unici.add(a.paziente_id)

            fatt = ordini_per_appuntamento.get(a.id, Decimal("0"))
            fatturato_totale += fatt

            label = _bucket_label(a.data_ora_inizio.date(), granularita)
            b = buckets.setdefault(label, {
                "periodo": label,
                "ore": Decimal("0"),
                "appuntamenti": 0,
                "pazienti": set(),
                "fatturato": Decimal("0"),
            })
            b["ore"] += durata_ore
            b["appuntamenti"] += 1
            b["pazienti"].add(a.paziente_id)
            b["fatturato"] += fatt

        serie_temporale = [
            {
                "periodo": b["periodo"],
                "ore": float(b["ore"]),
                "appuntamenti": b["appuntamenti"],
                "pazienti_unici": len(b["pazienti"]),
                "fatturato": float(b["fatturato"]),
            }
            for b in sorted(buckets.values(), key=lambda x: x["periodo"])
        ]

        return {
            "utente_id": utente_id,
            "utente_nome": utente.nome,
            "utente_cognome": utente.cognome,
            "data_inizio": data_inizio.isoformat(),
            "data_fine": data_fine.isoformat(),
            "granularita": granularita.value,
            "ore_lavorate": float(ore_totali),
            "appuntamenti_totali": len(appuntamenti),
            "appuntamenti_completati": completati,
            "pazienti_unici": len(pazienti_unici),
            "fatturato_generato": float(fatturato_totale),
            "serie_temporale": serie_temporale,
        }
