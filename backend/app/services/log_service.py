from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.log import LogEvento, LogVersione, TipoOperazione
from typing import Optional, Any
import json


class LogService:

    @staticmethod
    def log_evento(
        db: Session,
        operazione: TipoOperazione,
        utente_id: Optional[int] = None,
        tabella: Optional[str] = None,
        record_id: Optional[int] = None,
        modulo: Optional[str] = None,
        endpoint: Optional[str] = None,
        dati_prima: Optional[dict] = None,
        dati_dopo: Optional[dict] = None,
        dettagli: Optional[dict] = None,
        successo: bool = True,
        messaggio_errore: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> LogEvento:
        evento = LogEvento(
            utente_id=utente_id,
            ip_address=ip_address,
            user_agent=user_agent,
            operazione=operazione,
            tabella=tabella,
            record_id=record_id,
            modulo=modulo,
            endpoint=endpoint,
            dati_prima=dati_prima,
            dati_dopo=dati_dopo,
            dettagli=dettagli,
            successo=successo,
            messaggio_errore=messaggio_errore
        )
        db.add(evento)
        db.flush()  # commit lo fa il chiamante
        return evento

    @staticmethod
    def log_versione(
        db: Session,
        tabella: str,
        record_id: int,
        dati: dict,
        modificato_da: Optional[int] = None
    ) -> LogVersione:
        ultima_versione = db.query(LogVersione).filter(
            LogVersione.tabella == tabella,
            LogVersione.record_id == record_id
        ).order_by(desc(LogVersione.versione)).first()

        nuova_versione = (ultima_versione.versione + 1) if ultima_versione else 1

        versione = LogVersione(
            tabella=tabella,
            record_id=record_id,
            versione=nuova_versione,
            dati=dati,
            modificato_da=modificato_da
        )
        db.add(versione)
        db.flush()
        return versione

    @staticmethod
    def get_log_eventi(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 50,
        utente_id: Optional[int] = None,
        operazione: Optional[str] = None,
        tabella: Optional[str] = None,
        modulo: Optional[str] = None,
        successo: Optional[bool] = None,
        cerca: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        from app.models.utente import Utente
        from sqlalchemy import or_, cast, String
        query = db.query(LogEvento)

        if utente_id:
            query = query.filter(LogEvento.utente_id == utente_id)
        if operazione:
            query = query.filter(LogEvento.operazione == operazione)
        if tabella:
            query = query.filter(LogEvento.tabella == tabella)
        if modulo:
            query = query.filter(LogEvento.modulo == modulo)
        if successo is not None:
            query = query.filter(LogEvento.successo == successo)

        # Ricerca testuale: username utente, tabella, modulo, endpoint, ID record
        if cerca:
            like = f"%{cerca}%"
            query = query.outerjoin(Utente, Utente.id == LogEvento.utente_id).filter(
                or_(
                    Utente.username.ilike(like),
                    LogEvento.tabella.ilike(like),
                    LogEvento.modulo.ilike(like),
                    LogEvento.endpoint.ilike(like),
                    cast(LogEvento.record_id, String).ilike(like),
                )
            )

        SORT_MAP = {
            'created_at': LogEvento.created_at,
            'operazione': LogEvento.operazione,
            'modulo': LogEvento.modulo,
            'tabella': LogEvento.tabella,
            'utente_username': Utente.username,
        }
        if ordina_per == 'utente_username':
            query = query.outerjoin(Utente, Utente.id == LogEvento.utente_id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(desc(LogEvento.created_at))
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def get_versioni_record(
        db: Session,
        tabella: str,
        record_id: int
    ) -> list:
        return db.query(LogVersione).filter(
            LogVersione.tabella == tabella,
            LogVersione.record_id == record_id
        ).order_by(desc(LogVersione.versione)).all()