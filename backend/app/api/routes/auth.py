from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.auth import LoginRequest, TokenResponse, CambioPasswordRequest
from app.services.auth_service import AuthService
from app.models.utente import Utente

router = APIRouter(prefix="/auth", tags=["Autenticazione"])


@router.post("/login", response_model=TokenResponse)
def login(
    dati: LoginRequest,
    request: Request,
    db: Session = Depends(get_db_session)
):
    """
    Login utente. Restituisce JWT token valido per 8 ore.
    Il token va incluso in tutte le richieste successive
    nell'header: Authorization: Bearer <token>
    """
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    return AuthService.login(
        db=db,
        username=dati.username,
        password=dati.password,
        ip_address=ip_address,
        user_agent=user_agent
    )


@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
def login_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db_session)
):
    # Variante form-encoded usata solo dal pulsante Authorize di Swagger UI
    # (OAuth2 password flow). Il frontend continua a usare /login con JSON.
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    return AuthService.login(
        db=db,
        username=form.username,
        password=form.password,
        ip_address=ip_address,
        user_agent=user_agent
    )


@router.post("/logout")
def logout(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Logout utente. Registra l'evento nel log.
    Il token JWT viene invalidato lato client.
    """
    from app.services.log_service import LogService
    from app.models.log import TipoOperazione

    LogService.log_evento(
        db=db,
        operazione=TipoOperazione.LOGOUT,
        utente_id=utente_corrente.id,
        tabella="utenti",
        record_id=utente_corrente.id,
        modulo="auth",
        successo=True
    )
    db.commit()
    return {"message": "Logout effettuato con successo"}


@router.get("/me", response_model=dict)
def get_me(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Restituisce i dati dell'utente corrente dal token."""
    from app.models.ruolo import Ruolo, UtenteRuolo

    ruoli = db.query(Ruolo.nome).join(UtenteRuolo).filter(
        UtenteRuolo.utente_id == utente_corrente.id
    ).all()

    return {
        "id": utente_corrente.id,
        "username": utente_corrente.username,
        "email_login": utente_corrente.email_login,
        "nome": utente_corrente.nome,
        "cognome": utente_corrente.cognome,
        "ruoli": [r.nome for r in ruoli],
        "primo_accesso": utente_corrente.primo_accesso,
        "ultimo_accesso": utente_corrente.ultimo_accesso
    }


@router.post("/cambia-password")
def cambia_password(
    dati: CambioPasswordRequest,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Cambio password per l'utente corrente."""
    AuthService.cambia_password(
        db=db,
        utente_id=utente_corrente.id,
        password_attuale=dati.password_attuale,
        nuova_password=dati.nuova_password,
        conferma_password=dati.conferma_password
    )
    return {"message": "Password aggiornata con successo"}