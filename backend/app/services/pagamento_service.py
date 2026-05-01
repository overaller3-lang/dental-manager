from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal
from app.models.pagamento import Pagamento, StatoPagamento, MetodoPagamento
from app.models.ordine import Ordine, StatoOrdine
from app.schemas.pagamento import PagamentoCreate, PagamentoUpdate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class PagamentoService:

    @staticmethod
    def registra_pagamento(
        db: Session,
        dati: PagamentoCreate,
        registrato_da: Optional[int] = None
    ) -> Pagamento:
        ordine = db.query(Ordine).filter(
            Ordine.id == dati.ordine_id
        ).first()
        if not ordine:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ordine non trovato"
            )

        if ordine.stato == StatoOrdine.ANNULLATO:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossibile registrare un pagamento per un ordine annullato"
            )

        importo = Decimal(str(dati.importo))
        if importo > ordine.totale_residuo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"L'importo ({importo}€) supera il residuo da pagare ({ordine.totale_residuo}€)"
            )

        pagamento = Pagamento(
            ordine_id=dati.ordine_id,
            paziente_id=dati.paziente_id,
            registrato_da=registrato_da,
            importo=importo,
            metodo=dati.metodo,
            stato=StatoPagamento.COMPLETATO,
            note=dati.note,
            riferimento_transazione=dati.riferimento_transazione,
            data_pagamento=datetime.now(timezone.utc)
        )
        db.add(pagamento)
        db.flush()

        ordine.totale_pagato = Decimal(str(ordine.totale_pagato)) + importo
        ordine.totale_residuo = Decimal(str(ordine.totale)) - ordine.totale_pagato

        if ordine.totale_residuo <= Decimal("0"):
            ordine.totale_residuo = Decimal("0")
            if ordine.stato == StatoOrdine.BOZZA:
                ordine.stato = StatoOrdine.CONFERMATO

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=registrato_da,
            tabella="pagamenti",
            record_id=pagamento.id,
            modulo="pagamenti",
            dati_dopo={
                "ordine_id": dati.ordine_id,
                "importo": str(importo),
                "metodo": dati.metodo,
                "residuo_dopo": str(ordine.totale_residuo)
            },
            successo=True
        )
        db.commit()
        db.refresh(pagamento)
        return pagamento

    @staticmethod
    def get_pagamento(db: Session, pagamento_id: int) -> Pagamento:
        pagamento = db.query(Pagamento).filter(
            Pagamento.id == pagamento_id
        ).first()
        if not pagamento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pagamento {pagamento_id} non trovato"
            )
        return pagamento

    @staticmethod
    def get_pagamenti(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        paziente_id: Optional[int] = None,
        ordine_id: Optional[int] = None,
        stato: Optional[str] = None,
        metodo: Optional[str] = None,
        cerca: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        from app.models.paziente import Paziente
        from app.models.ordine import Ordine
        from sqlalchemy import or_
        query = db.query(Pagamento)

        if paziente_id:
            query = query.filter(Pagamento.paziente_id == paziente_id)
        if ordine_id:
            query = query.filter(Pagamento.ordine_id == ordine_id)
        if stato:
            query = query.filter(Pagamento.stato == stato)
        if metodo:
            query = query.filter(Pagamento.metodo == metodo)

        # Ricerca testuale: numero ordine, nome/cognome paziente
        if cerca:
            like = f"%{cerca}%"
            query = query.outerjoin(Paziente, Paziente.id == Pagamento.paziente_id) \
                         .outerjoin(Ordine, Ordine.id == Pagamento.ordine_id) \
                         .filter(or_(
                             Ordine.numero.ilike(like),
                             Paziente.cognome.ilike(like),
                             Paziente.nome.ilike(like),
                         ))

        SORT_MAP = {
            'data_pagamento': Pagamento.data_pagamento,
            'paziente_cognome': Paziente.cognome,
            'paziente_nome': Paziente.nome,
            'ordine_numero': Ordine.numero,
            'importo': Pagamento.importo,
            'metodo': Pagamento.metodo,
            'stato': Pagamento.stato,
            'created_at': Pagamento.created_at,
        }
        if ordina_per in ('paziente_cognome', 'paziente_nome'):
            query = query.join(Paziente, Paziente.id == Pagamento.paziente_id)
        elif ordina_per == 'ordine_numero':
            query = query.join(Ordine, Ordine.id == Pagamento.ordine_id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Pagamento.created_at.desc())
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()

        for pag in items:
            if pag.paziente:
                pag.paziente_nome = pag.paziente.nome
                pag.paziente_cognome = pag.paziente.cognome
            if pag.ordine:
                pag.ordine_numero = pag.ordine.numero
            if pag.ricevuta:
                pag.ricevuta_id = pag.ricevuta.id
                pag.ricevuta_numero = pag.ricevuta.numero

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def rimborsa_pagamento(
        db: Session,
        pagamento_id: int,
        rimborsato_da: Optional[int] = None
    ) -> Pagamento:
        pagamento = PagamentoService.get_pagamento(db, pagamento_id)

        if pagamento.stato != StatoPagamento.COMPLETATO:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo i pagamenti completati possono essere rimborsati"
            )

        pagamento.stato = StatoPagamento.RIMBORSATO

        ordine = pagamento.ordine
        ordine.totale_pagato = Decimal(str(ordine.totale_pagato)) - Decimal(str(pagamento.importo))
        ordine.totale_residuo = Decimal(str(ordine.totale)) - Decimal(str(ordine.totale_pagato))

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=rimborsato_da,
            tabella="pagamenti",
            record_id=pagamento_id,
            modulo="pagamenti",
            dettagli={
                "azione": "rimborso",
                "importo_rimborsato": str(pagamento.importo)
            },
            successo=True
        )
        db.commit()
        db.refresh(pagamento)
        return pagamento

    @staticmethod
    def get_riepilogo(
        db: Session,
        paziente_id: Optional[int] = None
    ) -> dict:
        from sqlalchemy import func, case

        query = db.query(
            func.coalesce(
                func.sum(
                    case((Pagamento.stato == StatoPagamento.COMPLETATO, Pagamento.importo), else_=0)
                ), 0
            ).label("totale_incassato"),
            func.coalesce(
                func.sum(
                    case((Pagamento.stato == StatoPagamento.IN_ATTESA, Pagamento.importo), else_=0)
                ), 0
            ).label("totale_in_attesa"),
            func.coalesce(
                func.sum(
                    case((Pagamento.stato == StatoPagamento.RIMBORSATO, Pagamento.importo), else_=0)
                ), 0
            ).label("totale_rimborsato"),
            func.count(Pagamento.id).label("numero_pagamenti")
        )

        if paziente_id:
            query = query.filter(Pagamento.paziente_id == paziente_id)

        risultato = query.first()

        return {
            "totale_incassato": risultato.totale_incassato,
            "totale_in_attesa": risultato.totale_in_attesa,
            "totale_rimborsato": risultato.totale_rimborsato,
            "numero_pagamenti": risultato.numero_pagamenti
        }