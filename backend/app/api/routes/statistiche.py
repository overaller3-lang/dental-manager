from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta, date
from typing import Optional
from app.api.deps import get_utente_corrente, get_db_session
from app.models.utente import Utente
from app.models.pagamento import Pagamento, StatoPagamento
from app.models.appuntamento import Appuntamento, StatoAppuntamento
from app.services.statistiche_service import StatisticheService, Granularita

router = APIRouter(prefix="/statistiche", tags=["Statistiche"])


@router.get("/operatori/{utente_id}")
def statistiche_operatore(
    utente_id: int,
    data_inizio: Optional[date] = Query(None),
    data_fine: Optional[date] = Query(None),
    granularita: Granularita = Query(Granularita.MESE),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Statistiche aggregate di un operatore (dentista) su un range di date.

    Granularità: totale | anno | mese | settimana | giorno.
    Restituisce ore lavorate, appuntamenti, pazienti unici, fatturato generato
    e una serie temporale per i grafici.
    """
    return StatisticheService.statistiche_operatore(
        db=db,
        utente_id=utente_id,
        data_inizio=data_inizio,
        data_fine=data_fine,
        granularita=granularita,
    )


@router.get("")
def get_statistiche(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    oggi = datetime.utcnow()
    dodici_mesi_fa = oggi.replace(day=1) - timedelta(days=365)

    righe_incassi = (
        db.query(
            extract("year", Pagamento.data_pagamento).label("anno"),
            extract("month", Pagamento.data_pagamento).label("mese"),
            func.sum(Pagamento.importo).label("totale"),
        )
        .filter(
            Pagamento.stato == StatoPagamento.COMPLETATO,
            Pagamento.data_pagamento >= dodici_mesi_fa,
        )
        .group_by("anno", "mese")
        .order_by("anno", "mese")
        .all()
    )

    mesi_label = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
                  "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    incassi_map = {(int(r.anno), int(r.mese)): float(r.totale) for r in righe_incassi}

    incassi_mensili = []
    base = oggi.year * 12 + (oggi.month - 1)
    for i in range(11, -1, -1):
        m = base - i
        anno, mese = divmod(m, 12)
        mese += 1
        incassi_mensili.append({
            "mese": f"{mesi_label[mese - 1]} {str(anno)[2:]}",
            "incassato": incassi_map.get((anno, mese), 0.0),
        })

    otto_settimane_fa = oggi - timedelta(weeks=8)
    righe_appuntamenti = (
        db.query(
            extract("year", Appuntamento.data_ora_inizio).label("anno"),
            extract("week", Appuntamento.data_ora_inizio).label("settimana"),
            func.count(Appuntamento.id).label("totale"),
        )
        .filter(
            Appuntamento.stato.in_([
                StatoAppuntamento.CONFERMATO,
                StatoAppuntamento.COMPLETATO,
                StatoAppuntamento.IN_CORSO,
            ]),
            Appuntamento.data_ora_inizio >= otto_settimane_fa,
        )
        .group_by("anno", "settimana")
        .order_by("anno", "settimana")
        .all()
    )

    app_map = {(int(r.anno), int(r.settimana)): int(r.totale) for r in righe_appuntamenti}

    appuntamenti_settimanali = []
    for i in range(7, -1, -1):
        dt = oggi - timedelta(weeks=i)
        iso = dt.isocalendar()
        label = f"Sett {iso[1]}"
        appuntamenti_settimanali.append({
            "settimana": label,
            "appuntamenti": app_map.get((iso[0], iso[1]), 0),
        })

    return {
        "incassi_mensili": incassi_mensili,
        "appuntamenti_settimanali": appuntamenti_settimanali,
    }
