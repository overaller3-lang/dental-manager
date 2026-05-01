from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_utente_corrente, get_db_session
from app.schemas.impostazioni import ImpostazioniUpdate, ImpostazioniResponse
from app.models.impostazioni import ImpostazioniStudio
from app.models.utente import Utente

router = APIRouter(prefix="/impostazioni", tags=["Impostazioni"])


def _get_or_create(db: Session) -> ImpostazioniStudio:
    imp = db.query(ImpostazioniStudio).first()
    if imp:
        return imp
    imp = ImpostazioniStudio(
        ora_apertura="08:00",
        ora_chiusura="20:00",
        giorni_lavorativi=[0, 1, 2, 3, 4],
        festivita_disabilitate=[],
        giorni_extra_chiusi=[],
        giorni_extra_aperti=[],
        pausa_attiva=False,
        ora_inizio_pausa="13:00",
        ora_fine_pausa="14:00"
    )
    db.add(imp)
    try:
        db.commit()
        db.refresh(imp)
        return imp
    except IntegrityError:
        # Race: un'altra richiesta ha già creato il singleton
        db.rollback()
        return db.query(ImpostazioniStudio).first()


@router.get("", response_model=ImpostazioniResponse)
def get_impostazioni(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    return _get_or_create(db)


@router.put("", response_model=ImpostazioniResponse)
def aggiorna_impostazioni(
    dati: ImpostazioniUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    imp = _get_or_create(db)
    for campo, valore in dati.model_dump(exclude_unset=True).items():
        setattr(imp, campo, valore)
    db.commit()
    db.refresh(imp)
    return imp
