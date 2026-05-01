from sqlalchemy.orm import Session, aliased, joinedload
from sqlalchemy import and_, or_
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, timezone, date
from app.models.appuntamento import Appuntamento, StatoAppuntamento, TipoAppuntamento
from app.models.paziente import Paziente
from app.models.utente import Utente
from app.models.piano_cura import PianoCura, StatoPianoCura
from app.schemas.appuntamento import AppuntamentoCreate, AppuntamentoUpdate
from app.models.log import TipoOperazione
from app.services.log_service import LogService

# Stati che NON occupano la fascia oraria (non bloccano nuovi appuntamenti)
_STATI_NON_BLOCCANTI = (
    StatoAppuntamento.ANNULLATO,
    StatoAppuntamento.NON_PRESENTATO,
    StatoAppuntamento.RINVIATO,
)


def _is_giorno_lavorativo(db: Session, data_ora: datetime) -> bool:
    from app.models.impostazioni import ImpostazioniStudio
    imp = db.query(ImpostazioniStudio).first()
    if not imp:
        return True
    data = data_ora.date()
    data_str = data.strftime('%Y-%m-%d')
    mese_giorno = data.strftime('%m-%d')
    if imp.giorni_extra_aperti and data_str in imp.giorni_extra_aperti:
        return True
    if imp.giorni_extra_chiusi and data_str in imp.giorni_extra_chiusi:
        return False
    if imp.festivita_disabilitate and mese_giorno in imp.festivita_disabilitate:
        return False
    # weekday: 0=lunedi, 6=domenica
    giorni = imp.giorni_lavorativi or [0, 1, 2, 3, 4]
    return data.weekday() in giorni


class AppuntamentoService:

    @staticmethod
    def _overlap_filter(data_ora_inizio, data_ora_fine):
        return or_(
            and_(Appuntamento.data_ora_inizio >= data_ora_inizio, Appuntamento.data_ora_inizio < data_ora_fine),
            and_(Appuntamento.data_ora_fine > data_ora_inizio, Appuntamento.data_ora_fine <= data_ora_fine),
            and_(Appuntamento.data_ora_inizio <= data_ora_inizio, Appuntamento.data_ora_fine >= data_ora_fine),
        )

    @staticmethod
    def _query_conflitti(db: Session, data_ora_inizio, data_ora_fine, escludi_id=None, *, eager=False):
        q = db.query(Appuntamento)
        if eager:
            q = q.options(joinedload(Appuntamento.paziente), joinedload(Appuntamento.dentista))
        q = q.filter(
            Appuntamento.stato.not_in(_STATI_NON_BLOCCANTI),
            AppuntamentoService._overlap_filter(data_ora_inizio, data_ora_fine),
        )
        if escludi_id:
            q = q.filter(Appuntamento.id != escludi_id)
        return q

    @staticmethod
    def verifica_conflitti(db, dentista_id, data_ora_inizio, data_ora_fine, escludi_id=None):
        return AppuntamentoService._query_conflitti(db, data_ora_inizio, data_ora_fine, escludi_id) \
            .filter(Appuntamento.dentista_id == dentista_id).first() is not None

    @staticmethod
    def verifica_conflitti_sala(db, sala, data_ora_inizio, data_ora_fine, escludi_id=None):
        return AppuntamentoService._query_conflitti(db, data_ora_inizio, data_ora_fine, escludi_id) \
            .filter(Appuntamento.sala == sala).first() is not None

    @staticmethod
    def lista_conflitti_sala(db, sala, data_ora_inizio, data_ora_fine, escludi_id=None):
        items = AppuntamentoService._query_conflitti(db, data_ora_inizio, data_ora_fine, escludi_id, eager=True) \
            .filter(Appuntamento.sala == sala).all()
        return [AppuntamentoService._denormalizza(a) for a in items]

    @staticmethod
    def lista_conflitti_dentista(db, dentista_id, data_ora_inizio, data_ora_fine, escludi_id=None):
        items = AppuntamentoService._query_conflitti(db, data_ora_inizio, data_ora_fine, escludi_id, eager=True) \
            .filter(Appuntamento.dentista_id == dentista_id).all()
        return [AppuntamentoService._denormalizza(a) for a in items]

    @staticmethod
    def lista_conflitti_paziente(db, paziente_id, data_ora_inizio, data_ora_fine, escludi_id=None):
        items = AppuntamentoService._query_conflitti(db, data_ora_inizio, data_ora_fine, escludi_id, eager=True) \
            .filter(Appuntamento.paziente_id == paziente_id).all()
        return [AppuntamentoService._denormalizza(a) for a in items]

    @staticmethod
    def crea_appuntamento(
        db: Session,
        dati: AppuntamentoCreate,
        creato_da: Optional[int] = None
    ) -> Appuntamento:
        piano = db.query(PianoCura).filter(PianoCura.id == dati.piano_cura_id).first()
        if not piano:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Piano di cura {dati.piano_cura_id} non trovato"
            )
        if piano.paziente_id != dati.paziente_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il paziente dell'appuntamento non corrisponde a quello del piano di cura"
            )
        if piano.stato in (StatoPianoCura.COMPLETATO, StatoPianoCura.ABBANDONATO):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Impossibile pianificare appuntamenti su un piano in stato '{piano.stato.value}'"
            )

        paziente = db.query(Paziente).filter(
            Paziente.id == dati.paziente_id,
            Paziente.attivo == True
        ).first()
        if not paziente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Paziente non trovato o non attivo"
            )

        dentista = db.query(Utente).filter(
            Utente.id == dati.dentista_id,
            Utente.attivo == True
        ).first()
        if not dentista:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Dentista non trovato o non attivo"
            )

        # il giorno non lavorativo non blocca: e' solo un avviso a frontend
        if AppuntamentoService.verifica_conflitti(
            db=db,
            dentista_id=dati.dentista_id,
            data_ora_inizio=dati.data_ora_inizio,
            data_ora_fine=dati.data_ora_fine
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Il dentista ha già un appuntamento in questa fascia oraria"
            )

        appuntamento = Appuntamento(
            **dati.model_dump(),
            creato_da=creato_da
        )
        db.add(appuntamento)
        db.flush()

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="appuntamenti",
            record_id=appuntamento.id,
            modulo="appuntamenti",
            dati_dopo={
                "paziente_id": appuntamento.paziente_id,
                "dentista_id": appuntamento.dentista_id,
                "data_ora_inizio": str(appuntamento.data_ora_inizio),
                "tipo": appuntamento.tipo.value
            },
            successo=True
        )
        db.commit()
        db.refresh(appuntamento)
        return AppuntamentoService._denormalizza(appuntamento)

    @staticmethod
    def _denormalizza(appuntamento: Appuntamento) -> Appuntamento:
        if appuntamento.paziente:
            appuntamento.paziente_nome = appuntamento.paziente.nome
            appuntamento.paziente_cognome = appuntamento.paziente.cognome
        if appuntamento.dentista:
            appuntamento.dentista_nome = appuntamento.dentista.nome
            appuntamento.dentista_cognome = appuntamento.dentista.cognome
        # ordine 1:1 col piano di cura, non con il singolo appuntamento
        if appuntamento.piano_cura and appuntamento.piano_cura.ordine:
            appuntamento.ordine_id = appuntamento.piano_cura.ordine.id
            appuntamento.ordine_numero = appuntamento.piano_cura.ordine.numero
        return appuntamento

    @staticmethod
    def get_appuntamento(db: Session, appuntamento_id: int) -> Appuntamento:
        appuntamento = db.query(Appuntamento).options(
            joinedload(Appuntamento.paziente),
            joinedload(Appuntamento.dentista),
            joinedload(Appuntamento.piano_cura).joinedload(PianoCura.ordine),
        ).filter(Appuntamento.id == appuntamento_id).first()
        if not appuntamento:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Appuntamento {appuntamento_id} non trovato"
            )
        return AppuntamentoService._denormalizza(appuntamento)

    @staticmethod
    def get_appuntamenti(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        paziente_id: Optional[int] = None,
        dentista_id: Optional[int] = None,
        sala: Optional[str] = None,
        stato: Optional[str] = None,
        data_da: Optional[datetime] = None,
        data_a: Optional[datetime] = None,
        cerca: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        Dentista = aliased(Utente)
        query = db.query(Appuntamento).options(
            joinedload(Appuntamento.paziente),
            joinedload(Appuntamento.dentista),
            joinedload(Appuntamento.piano_cura).joinedload(PianoCura.ordine),
        )

        if paziente_id:
            query = query.filter(Appuntamento.paziente_id == paziente_id)
        if dentista_id:
            query = query.filter(Appuntamento.dentista_id == dentista_id)
        if sala:
            query = query.filter(Appuntamento.sala == sala)
        if stato:
            query = query.filter(Appuntamento.stato == stato)
        if data_da:
            query = query.filter(Appuntamento.data_ora_inizio >= data_da)
        if data_a:
            query = query.filter(Appuntamento.data_ora_inizio <= data_a)

        # Le join esplicite (necessarie per sort/cerca su campi denormalizzati)
        # vanno aggiunte una sola volta. cerca le forza sempre.
        joined = False
        like = f"%{cerca}%" if cerca else None
        if cerca:
            query = query.join(Paziente, Appuntamento.paziente_id == Paziente.id) \
                         .join(Dentista, Appuntamento.dentista_id == Dentista.id) \
                         .filter(or_(
                             Paziente.nome.ilike(like),
                             Paziente.cognome.ilike(like),
                             Dentista.nome.ilike(like),
                             Dentista.cognome.ilike(like),
                             Appuntamento.sala.ilike(like),
                         ))
            joined = True

        SORT_MAP = {
            'id': Appuntamento.id,
            'data_ora_inizio': Appuntamento.data_ora_inizio,
            'data_ora_fine': Appuntamento.data_ora_fine,
            'paziente_cognome': Paziente.cognome,
            'paziente_nome': Paziente.nome,
            'dentista_cognome': Dentista.cognome,
            'dentista_nome': Dentista.nome,
            'sala': Appuntamento.sala,
            'tipo': Appuntamento.tipo,
            'stato': Appuntamento.stato,
            'created_at': Appuntamento.created_at,
        }
        if ordina_per in ('paziente_cognome', 'paziente_nome', 'dentista_cognome', 'dentista_nome') and not joined:
            query = query.join(Paziente, Appuntamento.paziente_id == Paziente.id) \
                         .join(Dentista, Appuntamento.dentista_id == Dentista.id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Appuntamento.data_ora_inizio)
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()

        for app in items:
            AppuntamentoService._denormalizza(app)

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def get_agenda_giornaliera(
        db: Session,
        dentista_id: int,
        data: date
    ) -> dict:
        inizio_giorno = datetime.combine(data, datetime.min.time())
        fine_giorno = datetime.combine(data, datetime.max.time())

        appuntamenti = db.query(Appuntamento).options(
            joinedload(Appuntamento.paziente),
            joinedload(Appuntamento.dentista),
        ).filter(
            Appuntamento.dentista_id == dentista_id,
            Appuntamento.data_ora_inizio >= inizio_giorno,
            Appuntamento.data_ora_inizio <= fine_giorno,
            Appuntamento.stato != StatoAppuntamento.ANNULLATO
        ).order_by(Appuntamento.data_ora_inizio).all()

        for app in appuntamenti:
            AppuntamentoService._denormalizza(app)

        return {
            "data": str(data),
            "appuntamenti": appuntamenti,
            "totale": len(appuntamenti)
        }

    @staticmethod
    def aggiorna_appuntamento(
        db: Session,
        appuntamento_id: int,
        dati: AppuntamentoUpdate,
        modificato_da: Optional[int] = None
    ) -> Appuntamento:
        appuntamento = AppuntamentoService.get_appuntamento(db, appuntamento_id)

        dati_prima = {
            "stato": appuntamento.stato.value,
            "data_ora_inizio": str(appuntamento.data_ora_inizio),
            "data_ora_fine": str(appuntamento.data_ora_fine)
        }

        dentista_check = dati.dentista_id if dati.dentista_id else appuntamento.dentista_id
        nuova_inizio = dati.data_ora_inizio or appuntamento.data_ora_inizio
        nuova_fine = dati.data_ora_fine or appuntamento.data_ora_fine

        if dati.data_ora_inizio or dati.data_ora_fine or dati.dentista_id:
            if AppuntamentoService.verifica_conflitti(
                db=db,
                dentista_id=dentista_check,
                data_ora_inizio=nuova_inizio,
                data_ora_fine=nuova_fine,
                escludi_id=appuntamento_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Il dentista ha già un appuntamento in questa fascia oraria"
                )

        nuovo_stato = dati.stato

        for campo, valore in dati.model_dump(exclude_unset=True).items():
            setattr(appuntamento, campo, valore)

        # quando un appuntamento e' completato, trasferisco i trattamenti sull'ordine
        # e faccio avanzare il piano da accettato a in_corso
        if nuovo_stato == StatoAppuntamento.COMPLETATO and appuntamento.piano_cura_id:
            from app.services.ordine_service import OrdineService
            piano = db.query(PianoCura).filter(PianoCura.id == appuntamento.piano_cura_id).first()
            if piano and piano.stato == StatoPianoCura.ACCETTATO:
                piano.stato = StatoPianoCura.IN_CORSO
            db.flush()
            OrdineService.aggiungi_voci_da_appuntamento(
                db=db, appuntamento=appuntamento, creato_da=modificato_da
            )

        LogService.log_versione(
            db=db,
            tabella="appuntamenti",
            record_id=appuntamento_id,
            dati=dati_prima,
            modificato_da=modificato_da
        )

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="appuntamenti",
            record_id=appuntamento_id,
            modulo="appuntamenti",
            dati_prima=dati_prima,
            dati_dopo=dati.model_dump(exclude_unset=True),
            successo=True
        )
        db.commit()
        db.refresh(appuntamento)
        return AppuntamentoService._denormalizza(appuntamento)

    @staticmethod
    def annulla_appuntamento(
        db: Session,
        appuntamento_id: int,
        motivo: Optional[str] = None,
        annullato_da: Optional[int] = None
    ) -> Appuntamento:
        appuntamento = AppuntamentoService.get_appuntamento(db, appuntamento_id)

        if appuntamento.stato in [
            StatoAppuntamento.COMPLETATO,
            StatoAppuntamento.ANNULLATO
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Impossibile annullare un appuntamento in stato '{appuntamento.stato.value}'"
            )

        appuntamento.stato = StatoAppuntamento.ANNULLATO

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=annullato_da,
            tabella="appuntamenti",
            record_id=appuntamento_id,
            modulo="appuntamenti",
            dettagli={"azione": "annullamento", "motivo": motivo},
            successo=True
        )
        db.commit()
        db.refresh(appuntamento)
        return appuntamento