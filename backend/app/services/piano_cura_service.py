from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sa_func
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, timezone
from app.models.piano_cura import PianoCura, StatoPianoCura
from app.models.preventivo import Preventivo
from app.models.appuntamento import Appuntamento, StatoAppuntamento
from app.models.ordine import Ordine
from app.models.paziente import Paziente
from app.models.utente import Utente
from app.schemas.piano_cura import PianoCuraCreate, PianoCuraUpdate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class PianoCuraService:

    @staticmethod
    def _genera_numero(db: Session) -> str:
        anno = datetime.now().year
        ultimo = db.query(PianoCura).filter(
            PianoCura.numero.like(f"PC-{anno}-%")
        ).count()
        return f"PC-{anno}-{str(ultimo + 1).zfill(4)}"

    @staticmethod
    def _denormalizza(piano: PianoCura) -> PianoCura:
        if piano.paziente:
            piano.paziente_nome = piano.paziente.nome
            piano.paziente_cognome = piano.paziente.cognome
        if piano.dentista_referente:
            piano.dentista_referente_nome = piano.dentista_referente.nome
            piano.dentista_referente_cognome = piano.dentista_referente.cognome

        piano.n_preventivi = len(piano.preventivi or [])
        appuntamenti = piano.appuntamenti or []
        piano.n_appuntamenti_totali = len(appuntamenti)
        piano.n_appuntamenti_completati = sum(
            1 for a in appuntamenti if a.stato == StatoAppuntamento.COMPLETATO
        )
        if piano.ordine:
            piano.ordine_id = piano.ordine.id
            piano.ordine_totale = float(piano.ordine.totale or 0)
        return piano

    @staticmethod
    def crea_piano(db: Session, dati: PianoCuraCreate, creato_da: Optional[int] = None) -> PianoCura:
        paziente = db.query(Paziente).filter(
            Paziente.id == dati.paziente_id, Paziente.attivo == True
        ).first()
        if not paziente:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paziente non trovato o non attivo")

        if dati.dentista_referente_id is not None:
            dentista = db.query(Utente).filter(
                Utente.id == dati.dentista_referente_id, Utente.attivo == True
            ).first()
            if not dentista:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Dentista referente non trovato o non attivo"
                )

        piano = PianoCura(
            paziente_id=dati.paziente_id,
            dentista_referente_id=dati.dentista_referente_id,
            creato_da=creato_da,
            numero=PianoCuraService._genera_numero(db),
            titolo=dati.titolo,
            diagnosi=dati.diagnosi,
            obiettivo=dati.obiettivo,
            note=dati.note,
            stato=StatoPianoCura.PROPOSTO,
        )
        db.add(piano)
        db.flush()

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="piani_cura",
            record_id=piano.id,
            modulo="piani_cura",
            dati_dopo={"numero": piano.numero, "paziente_id": piano.paziente_id, "titolo": piano.titolo},
            successo=True
        )
        db.commit()
        db.refresh(piano)
        return PianoCuraService._denormalizza(piano)

    @staticmethod
    def get_piano(db: Session, piano_id: int) -> PianoCura:
        piano = db.query(PianoCura).options(
            joinedload(PianoCura.paziente),
            joinedload(PianoCura.dentista_referente),
            joinedload(PianoCura.preventivi),
            joinedload(PianoCura.appuntamenti),
            joinedload(PianoCura.ordine),
        ).filter(PianoCura.id == piano_id).first()
        if not piano:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Piano di cura {piano_id} non trovato")
        return PianoCuraService._denormalizza(piano)

    @staticmethod
    def get_piani(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        paziente_id: Optional[int] = None,
        stato: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        from app.models.paziente import Paziente
        from app.models.utente import Utente
        from sqlalchemy.orm import aliased
        Dentista = aliased(Utente)
        query = db.query(PianoCura).options(
            joinedload(PianoCura.paziente),
            joinedload(PianoCura.dentista_referente),
            joinedload(PianoCura.preventivi),
            joinedload(PianoCura.appuntamenti),
            joinedload(PianoCura.ordine),
        )
        if paziente_id:
            query = query.filter(PianoCura.paziente_id == paziente_id)
        if stato:
            query = query.filter(PianoCura.stato == stato)

        SORT_MAP = {
            'numero': PianoCura.numero,
            'titolo': PianoCura.titolo,
            'paziente_cognome': Paziente.cognome,
            'paziente_nome': Paziente.nome,
            'dentista_referente_cognome': Dentista.cognome,
            'dentista_referente_nome': Dentista.nome,
            'stato': PianoCura.stato,
            'data_apertura': PianoCura.data_apertura,
            'data_chiusura': PianoCura.data_chiusura,
            'created_at': PianoCura.created_at,
        }
        if ordina_per in ('paziente_cognome', 'paziente_nome'):
            query = query.join(Paziente, Paziente.id == PianoCura.paziente_id)
        elif ordina_per in ('dentista_referente_cognome', 'dentista_referente_nome'):
            query = query.outerjoin(Dentista, Dentista.id == PianoCura.dentista_referente_id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(PianoCura.created_at.desc())
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()
        for p in items:
            PianoCuraService._denormalizza(p)
        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina,
        }

    @staticmethod
    def aggiorna_piano(
        db: Session,
        piano_id: int,
        dati: PianoCuraUpdate,
        modificato_da: Optional[int] = None,
    ) -> PianoCura:
        piano = PianoCuraService.get_piano(db, piano_id)
        dati_prima = {"stato": piano.stato.value, "titolo": piano.titolo}

        for campo, valore in dati.model_dump(exclude_unset=True).items():
            setattr(piano, campo, valore)

        # Se transita a stati terminali, registra data di chiusura
        if piano.stato in (StatoPianoCura.COMPLETATO, StatoPianoCura.ABBANDONATO) and not piano.data_chiusura:
            piano.data_chiusura = datetime.now(timezone.utc)

        LogService.log_versione(
            db=db, tabella="piani_cura", record_id=piano_id,
            dati=dati_prima, modificato_da=modificato_da,
        )
        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="piani_cura",
            record_id=piano_id,
            modulo="piani_cura",
            dati_prima=dati_prima,
            successo=True,
        )
        db.commit()
        db.refresh(piano)
        return PianoCuraService._denormalizza(piano)

    @staticmethod
    def transita_stato(
        db: Session,
        piano_id: int,
        nuovo_stato: StatoPianoCura,
        commit: bool = True,
    ) -> PianoCura:
        # commit=False quando viene chiamata da un altro service che gestira' il commit
        piano = db.query(PianoCura).filter(PianoCura.id == piano_id).first()
        if not piano:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Piano di cura {piano_id} non trovato")

        if piano.stato == nuovo_stato:
            return piano

        piano.stato = nuovo_stato
        if nuovo_stato in (StatoPianoCura.COMPLETATO, StatoPianoCura.ABBANDONATO) and not piano.data_chiusura:
            piano.data_chiusura = datetime.now(timezone.utc)

        if commit:
            db.commit()
            db.refresh(piano)
        else:
            db.flush()
        return piano
