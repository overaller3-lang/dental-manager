from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, timezone
from app.models.paziente import Paziente
from app.schemas.paziente import PazienteCreate, PazienteUpdate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class PazienteService:

    @staticmethod
    def crea_paziente(
        db: Session,
        dati: PazienteCreate,
        creato_da: Optional[int] = None
    ) -> Paziente:
        # data_consenso registrata in linea con la L. 219/2017
        if dati.codice_fiscale:
            esistente = db.query(Paziente).filter(
                Paziente.codice_fiscale == dati.codice_fiscale
            ).first()
            if esistente:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Paziente con questo codice fiscale già registrato"
                )

        paziente = Paziente(
            **dati.model_dump(),
            data_consenso=datetime.now(timezone.utc) if dati.consenso_trattamento else None
        )
        db.add(paziente)
        db.flush()

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="pazienti",
            record_id=paziente.id,
            modulo="pazienti",
            dati_dopo={
                "nome": paziente.nome,
                "cognome": paziente.cognome,
                "codice_fiscale": paziente.codice_fiscale
            },
            successo=True
        )
        db.commit()
        db.refresh(paziente)
        return paziente

    @staticmethod
    def get_paziente(db: Session, paziente_id: int) -> Paziente:
        paziente = db.query(Paziente).filter(Paziente.id == paziente_id).first()
        if not paziente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Paziente {paziente_id} non trovato"
            )
        return paziente

    @staticmethod
    def get_pazienti(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        cerca: Optional[str] = None,
        attivo: Optional[bool] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        query = db.query(Paziente).filter(Paziente.anonimizzato == False)

        if cerca:
            query = query.filter(
                or_(
                    Paziente.nome.ilike(f"%{cerca}%"),
                    Paziente.cognome.ilike(f"%{cerca}%"),
                    Paziente.codice_fiscale.ilike(f"%{cerca}%"),
                    Paziente.telefono.ilike(f"%{cerca}%"),
                    Paziente.email.ilike(f"%{cerca}%")
                )
            )

        if attivo is not None:
            query = query.filter(Paziente.attivo == attivo)

        # whitelist dei campi ammessi per l'ordinamento server-side
        SORT_MAP = {
            'cognome': Paziente.cognome,
            'nome': Paziente.nome,
            'codice_fiscale': Paziente.codice_fiscale,
            'data_nascita': Paziente.data_nascita,
            'telefono': Paziente.telefono,
            'email': Paziente.email,
        }
        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Paziente.cognome, Paziente.nome)
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def aggiorna_paziente(
        db: Session,
        paziente_id: int,
        dati: PazienteUpdate,
        modificato_da: Optional[int] = None
    ) -> Paziente:
        paziente = PazienteService.get_paziente(db, paziente_id)

        if dati.codice_fiscale:
            conflitto = db.query(Paziente).filter(
                Paziente.codice_fiscale == dati.codice_fiscale,
                Paziente.id != paziente_id
            ).first()
            if conflitto:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Codice fiscale già registrato per un altro paziente"
                )

        dati_prima = {
            "nome": paziente.nome,
            "cognome": paziente.cognome,
            "telefono": paziente.telefono,
            "email": paziente.email
        }

        for campo, valore in dati.model_dump(exclude_unset=True).items():
            setattr(paziente, campo, valore)

        LogService.log_versione(
            db=db,
            tabella="pazienti",
            record_id=paziente_id,
            dati=dati_prima,
            modificato_da=modificato_da
        )

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="pazienti",
            record_id=paziente_id,
            modulo="pazienti",
            dati_prima=dati_prima,
            dati_dopo=dati.model_dump(exclude_unset=True),
            successo=True
        )
        db.commit()
        db.refresh(paziente)
        return paziente

    @staticmethod
    def anonimizza_paziente(
        db: Session,
        paziente_id: int,
        richiesto_da: Optional[int] = None
    ) -> Paziente:
        # diritto all'oblio (GDPR art. 17): pulizia dati anagrafici
        # ma cartelle cliniche restano per obbligo di conservazione
        paziente = PazienteService.get_paziente(db, paziente_id)

        dati_prima = {
            "nome": paziente.nome,
            "cognome": paziente.cognome,
            "codice_fiscale": paziente.codice_fiscale,
            "email": paziente.email,
            "telefono": paziente.telefono
        }

        paziente.nome = "ANONIMO"
        paziente.cognome = "ANONIMO"
        paziente.codice_fiscale = None
        paziente.indirizzo = None
        paziente.citta = None
        paziente.cap = None
        paziente.provincia = None
        paziente.telefono = None
        paziente.email = None
        paziente.anamnesi = None
        paziente.allergie = None
        paziente.note = None
        paziente.anonimizzato = True
        paziente.data_anonimizzazione = datetime.now(timezone.utc)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.DELETE,
            utente_id=richiesto_da,
            tabella="pazienti",
            record_id=paziente_id,
            modulo="pazienti",
            dettagli={"azione": "anonimizzazione_gdpr"},
            dati_prima=dati_prima,
            successo=True
        )
        db.commit()
        db.refresh(paziente)
        return paziente