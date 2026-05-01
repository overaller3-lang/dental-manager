from sqlalchemy.orm import Session
from datetime import timedelta
from typing import Optional
from fastapi import HTTPException, status
from app.models.utente import Utente
from app.models.ruolo import UtenteRuolo, Ruolo
from app.core.security import verify_password, create_access_token, get_password_hash
from app.core.config import settings
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class AuthService:

    @staticmethod
    def login(
        db: Session,
        username: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> dict:
        utente = db.query(Utente).filter(
            (Utente.username == username) | (Utente.email_login == username)
        ).first()

        if not utente or not verify_password(password, utente.hashed_password):
            LogService.log_evento(
                db=db,
                operazione=TipoOperazione.LOGIN,
                tabella="utenti",
                modulo="auth",
                dettagli={"username_tentato": username},
                successo=False,
                messaggio_errore="Credenziali non valide",
                ip_address=ip_address,
                user_agent=user_agent
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenziali non valide",
                headers={"WWW-Authenticate": "Bearer"}
            )

        if not utente.attivo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account disattivato. Contattare l'amministratore."
            )

        ruoli = db.query(Ruolo.nome).join(UtenteRuolo).filter(
            UtenteRuolo.utente_id == utente.id
        ).all()
        ruoli_nomi = [r.nome for r in ruoli]

        token_data = {
            "sub": str(utente.id),
            "username": utente.username,
            "ruoli": ruoli_nomi
        }
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        from datetime import datetime, timezone
        utente.ultimo_accesso = datetime.now(timezone.utc)
        utente.primo_accesso = False

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.LOGIN,
            utente_id=utente.id,
            tabella="utenti",
            record_id=utente.id,
            modulo="auth",
            successo=True,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.commit()

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "utente_id": utente.id,
            "username": utente.username,
            "nome": utente.nome,
            "cognome": utente.cognome,
            "ruoli": ruoli_nomi
        }

    @staticmethod
    def get_utente_corrente(db: Session, utente_id: int) -> Utente:
        utente = db.query(Utente).filter(
            Utente.id == utente_id,
            Utente.attivo == True
        ).first()

        if not utente:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Utente non trovato o disattivato"
            )
        return utente

    @staticmethod
    def cambia_password(
        db: Session,
        utente_id: int,
        password_attuale: str,
        nuova_password: str,
        conferma_password: str
    ) -> bool:
        if nuova_password != conferma_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La nuova password e la conferma non coincidono"
            )

        utente = db.query(Utente).filter(Utente.id == utente_id).first()

        if not verify_password(password_attuale, utente.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password attuale non corretta"
            )

        utente.hashed_password = get_password_hash(nuova_password)
        utente.primo_accesso = False

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=utente_id,
            tabella="utenti",
            record_id=utente_id,
            modulo="auth",
            dettagli={"azione": "cambio_password"},
            successo=True
        )
        db.commit()
        return True