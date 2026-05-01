from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from typing import Optional
from app.models.utente import Utente, Contatto
from app.models.ruolo import Ruolo, UtenteRuolo
from app.schemas.utente import UtenteCreate, UtenteUpdate, ContattoCreate
from app.core.security import get_password_hash
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class UtenteService:

    @staticmethod
    def crea_utente(
        db: Session,
        dati: UtenteCreate,
        creato_da: Optional[int] = None
    ) -> Utente:
        esistente = db.query(Utente).filter(
            or_(
                Utente.username == dati.username,
                Utente.email_login == dati.email_login
            )
        ).first()

        if esistente:
            if esistente.username == dati.username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username già in uso"
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email già in uso"
            )

        utente = Utente(
            username=dati.username,
            email_login=dati.email_login,
            hashed_password=get_password_hash(dati.password),
            nome=dati.nome,
            cognome=dati.cognome,
            codice_fiscale=dati.codice_fiscale,
            data_nascita=dati.data_nascita,
            sesso=dati.sesso,
            indirizzo=dati.indirizzo,
            citta=dati.citta,
            cap=dati.cap,
            provincia=dati.provincia
        )
        db.add(utente)
        db.flush()

        nomi_ruoli = list({r for r in ([dati.ruolo_nome] if dati.ruolo_nome else []) + dati.ruoli_nomi if r})
        for nome in nomi_ruoli:
            ruolo = db.query(Ruolo).filter(Ruolo.nome == nome).first()
            if ruolo:
                db.add(UtenteRuolo(utente_id=utente.id, ruolo_id=ruolo.id, assegnato_da=creato_da))

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="utenti",
            record_id=utente.id,
            modulo="utenti",
            dati_dopo={"username": utente.username, "email": utente.email_login, "ruoli": nomi_ruoli},
            successo=True
        )
        db.commit()
        db.refresh(utente)
        return utente

    @staticmethod
    def get_utente(db: Session, utente_id: int) -> Utente:
        utente = db.query(Utente).filter(Utente.id == utente_id).first()
        if not utente:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Utente {utente_id} non trovato"
            )
        return utente

    @staticmethod
    def get_utenti(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        cerca: Optional[str] = None,
        attivo: Optional[bool] = None,
        ruolo: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        query = db.query(Utente)

        if cerca:
            query = query.filter(
                or_(
                    Utente.nome.ilike(f"%{cerca}%"),
                    Utente.cognome.ilike(f"%{cerca}%"),
                    Utente.username.ilike(f"%{cerca}%"),
                    Utente.email_login.ilike(f"%{cerca}%"),
                    Utente.codice_fiscale.ilike(f"%{cerca}%")
                )
            )

        if attivo is not None:
            query = query.filter(Utente.attivo == attivo)

        if ruolo:
            query = query.join(UtenteRuolo, UtenteRuolo.utente_id == Utente.id)\
                         .join(Ruolo, Ruolo.id == UtenteRuolo.ruolo_id)\
                         .filter(Ruolo.nome == ruolo)

        SORT_MAP = {
            'id': Utente.id,
            'cognome': Utente.cognome,
            'nome': Utente.nome,
            'username': Utente.username,
            'email_login': Utente.email_login,
            'email': Utente.email_login,
            'codice_fiscale': Utente.codice_fiscale,
            'attivo': Utente.attivo,
            'ultimo_accesso': Utente.ultimo_accesso,
            'created_at': Utente.created_at,
        }
        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Utente.cognome, Utente.nome)
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def aggiorna_utente(
        db: Session,
        utente_id: int,
        dati: UtenteUpdate,
        modificato_da: Optional[int] = None
    ) -> Utente:
        utente = UtenteService.get_utente(db, utente_id)

        dati_prima = {
            "nome": utente.nome,
            "cognome": utente.cognome,
            "attivo": utente.attivo
        }

        if dati.email_login is not None and dati.email_login != utente.email_login:
            dup = db.query(Utente).filter(Utente.email_login == dati.email_login, Utente.id != utente_id).first()
            if dup:
                raise HTTPException(status_code=400, detail="Email già in uso da un altro utente")

        for campo, valore in dati.model_dump(exclude_unset=True).items():
            setattr(utente, campo, valore)

        LogService.log_versione(
            db=db,
            tabella="utenti",
            record_id=utente_id,
            dati=dati_prima,
            modificato_da=modificato_da
        )

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="utenti",
            record_id=utente_id,
            modulo="utenti",
            dati_prima=dati_prima,
            dati_dopo=dati.model_dump(exclude_unset=True),
            successo=True
        )
        db.commit()
        db.refresh(utente)
        return utente

    @staticmethod
    def disattiva_utente(
        db: Session,
        utente_id: int,
        disattivato_da: Optional[int] = None
    ) -> Utente:
        # niente delete fisica: serve a tenere intatti log e storia clinica
        utente = UtenteService.get_utente(db, utente_id)
        utente.attivo = False

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.DELETE,
            utente_id=disattivato_da,
            tabella="utenti",
            record_id=utente_id,
            modulo="utenti",
            dettagli={"azione": "disattivazione"},
            successo=True
        )
        db.commit()
        db.refresh(utente)
        return utente

    @staticmethod
    def assegna_ruolo(
        db: Session,
        utente_id: int,
        ruolo_nome: str,
        assegnato_da: Optional[int] = None
    ) -> bool:
        utente = UtenteService.get_utente(db, utente_id)

        ruolo = db.query(Ruolo).filter(Ruolo.nome == ruolo_nome).first()
        if not ruolo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ruolo '{ruolo_nome}' non trovato"
            )

        esistente = db.query(UtenteRuolo).filter(
            UtenteRuolo.utente_id == utente_id,
            UtenteRuolo.ruolo_id == ruolo.id
        ).first()

        if esistente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ruolo '{ruolo_nome}' già assegnato a questo utente"
            )

        utente_ruolo = UtenteRuolo(
            utente_id=utente_id,
            ruolo_id=ruolo.id,
            assegnato_da=assegnato_da
        )
        db.add(utente_ruolo)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=assegnato_da,
            tabella="utenti_ruoli",
            record_id=utente_id,
            modulo="utenti",
            dettagli={"ruolo_assegnato": ruolo_nome},
            successo=True
        )
        db.commit()
        return True

    @staticmethod
    def aggiungi_contatto(
        db: Session,
        utente_id: int,
        dati: ContattoCreate
    ) -> Contatto:
        UtenteService.get_utente(db, utente_id)

        # un solo contatto principale per tipo
        if dati.principale:
            db.query(Contatto).filter(
                Contatto.utente_id == utente_id,
                Contatto.tipo == dati.tipo
            ).update({"principale": False})

        contatto = Contatto(
            utente_id=utente_id,
            tipo=dati.tipo,
            valore=dati.valore,
            etichetta=dati.etichetta,
            principale=dati.principale
        )
        db.add(contatto)
        db.commit()
        db.refresh(contatto)
        return contatto