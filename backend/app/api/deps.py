from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.utente import Utente
from app.models.ruolo import Ruolo, UtenteRuolo
from typing import Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login/form")


def get_utente_corrente(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Utente:
    credenziali_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token non valido o scaduto",
        headers={"WWW-Authenticate": "Bearer"}
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credenziali_exception

    utente_id = payload.get("sub")
    if utente_id is None:
        raise credenziali_exception

    utente = db.query(Utente).filter(
        Utente.id == int(utente_id),
        Utente.attivo == True
    ).first()

    if utente is None:
        raise credenziali_exception

    return utente


def get_utente_admin(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db)
) -> Utente:
    ruoli = db.query(Ruolo.nome).join(UtenteRuolo).filter(
        UtenteRuolo.utente_id == utente_corrente.id
    ).all()
    ruoli_nomi = [r.nome for r in ruoli]

    if "admin" not in ruoli_nomi:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato agli amministratori"
        )
    return utente_corrente


def get_utente_dentista(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db)
) -> Utente:
    ruoli = db.query(Ruolo.nome).join(UtenteRuolo).filter(
        UtenteRuolo.utente_id == utente_corrente.id
    ).all()
    ruoli_nomi = [r.nome for r in ruoli]

    if not any(r in ruoli_nomi for r in ["admin", "dentista"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato ai dentisti"
        )
    return utente_corrente


def get_db_session(db: Session = Depends(get_db)) -> Session:
    return db


def applica_ordinamento(query, mappa_campi: dict, ordina_per: Optional[str], direzione: Optional[str]):
    """
    Applica order_by a una query SQLAlchemy usando una whitelist di campi.

    Args:
        query: la query SQLAlchemy a cui applicare l'ordinamento.
        mappa_campi: dizionario che mappa il nome del campo lato API
                     (es. "cognome") sulla colonna o l'espressione SQLAlchemy
                     corrispondente. Funge da whitelist: campi non in mappa
                     vengono ignorati senza errore (protezione contro
                     manipolazione del query string).
        ordina_per: nome del campo richiesto dal client. Se None o non in
                    whitelist, la query non viene modificata.
        direzione: "asc" (default) oppure "desc".

    Returns:
        La query con eventuale order_by applicato.
    """
    from sqlalchemy import asc, desc
    if not ordina_per or ordina_per not in mappa_campi:
        return query
    column = mappa_campi[ordina_per]
    if direzione == "desc":
        return query.order_by(desc(column))
    return query.order_by(asc(column))