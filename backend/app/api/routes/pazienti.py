from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_utente_admin, get_db_session
from app.schemas.paziente import PazienteCreate, PazienteUpdate, PazienteResponse, PazientePaginato
from app.services.paziente_service import PazienteService
from app.models.utente import Utente

router = APIRouter(prefix="/pazienti", tags=["Pazienti"])


@router.post("", response_model=PazienteResponse, status_code=status.HTTP_201_CREATED)
def crea_paziente(
    dati: PazienteCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Registra un nuovo paziente.
    Richiede consenso al trattamento e privacy (L. 219/2017).
    """
    return PazienteService.crea_paziente(
        db=db,
        dati=dati,
        creato_da=utente_corrente.id
    )


@router.get("", response_model=PazientePaginato)
def lista_pazienti(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    cerca: Optional[str] = Query(None, description="Cerca per nome, cognome, CF, telefono, email"),
    attivo: Optional[bool] = Query(None),
    ordina_per: Optional[str] = Query(None, description="Campo per l'ordinamento (cognome, nome, codice_fiscale, data_nascita, telefono, email)"),
    direzione: Optional[str] = Query(None, description="Direzione ordinamento: asc o desc"),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista pazienti con ricerca, paginazione e ordinamento server-side."""
    return PazienteService.get_pazienti(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        cerca=cerca,
        attivo=attivo,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/{paziente_id}", response_model=PazienteResponse)
def get_paziente(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un paziente per id."""
    return PazienteService.get_paziente(db=db, paziente_id=paziente_id)


@router.get("/{paziente_id}/operatori")
def lista_operatori_paziente(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Conteggio appuntamenti per operatore con cui il paziente ha avuto storia.
    Ritorna [{dentista_id, n_appuntamenti}] ordinato per n decrescente."""
    from sqlalchemy import func
    from app.models.appuntamento import Appuntamento
    righe = (
        db.query(
            Appuntamento.dentista_id.label("dentista_id"),
            func.count(Appuntamento.id).label("n_appuntamenti"),
        )
        .filter(Appuntamento.paziente_id == paziente_id)
        .group_by(Appuntamento.dentista_id)
        .order_by(func.count(Appuntamento.id).desc())
        .all()
    )
    return [{"dentista_id": r.dentista_id, "n_appuntamenti": r.n_appuntamenti} for r in righe]


@router.patch("/{paziente_id}", response_model=PazienteResponse)
def aggiorna_paziente(
    paziente_id: int,
    dati: PazienteUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Aggiorna i dati di un paziente."""
    return PazienteService.aggiorna_paziente(
        db=db,
        paziente_id=paziente_id,
        dati=dati,
        modificato_da=utente_corrente.id
    )


@router.delete("/{paziente_id}/elimina")
def elimina_paziente(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Elimina fisicamente un paziente. Solo admin. Bloccato se esistono record collegati."""
    from app.models.paziente import Paziente
    from app.models.appuntamento import Appuntamento
    from app.models.ordine import Ordine, DocumentoFiscale
    from app.models.preventivo import Preventivo

    paziente = db.query(Paziente).filter(Paziente.id == paziente_id).first()
    if not paziente:
        raise HTTPException(status_code=404, detail="Paziente non trovato")

    referenze = {}
    n = db.query(Appuntamento).filter(Appuntamento.paziente_id == paziente_id).count()
    if n: referenze["appuntamenti"] = n
    n = db.query(Ordine).filter(Ordine.paziente_id == paziente_id).count()
    if n: referenze["ordini"] = n
    n = db.query(Preventivo).filter(Preventivo.paziente_id == paziente_id).count()
    if n: referenze["preventivi"] = n
    n = db.query(DocumentoFiscale).filter(DocumentoFiscale.paziente_id == paziente_id).count()
    if n: referenze["documenti_fiscali"] = n

    if referenze:
        raise HTTPException(
            status_code=409,
            detail={"messaggio": "Impossibile eliminare: il paziente ha record collegati.", "referenze": referenze}
        )

    db.delete(paziente)
    db.commit()
    return {"message": f"Paziente {paziente_id} eliminato con successo"}


@router.delete("/{paziente_id}")
def anonimizza_paziente(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """
    Anonimizza un paziente (diritto all'oblio - GDPR art. 17).
    I dati clinici vengono mantenuti per obbligo legale.
    Solo admin.
    """
    PazienteService.anonimizza_paziente(
        db=db,
        paziente_id=paziente_id,
        richiesto_da=utente_corrente.id
    )
    return {"message": f"Paziente {paziente_id} anonimizzato con successo"}


@router.get("/{paziente_id}/appuntamenti")
def get_appuntamenti_paziente(
    paziente_id: int,
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista appuntamenti di un paziente."""
    from app.services.appuntamento_service import AppuntamentoService
    return AppuntamentoService.get_appuntamenti(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id
    )


@router.get("/{paziente_id}/ordini")
def get_ordini_paziente(
    paziente_id: int,
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista ordini di un paziente."""
    from app.services.ordine_service import OrdineService
    return OrdineService.get_ordini(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id
    )


@router.get("/{paziente_id}/pagamenti")
def get_pagamenti_paziente(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista pagamenti e riepilogo finanziario di un paziente."""
    from app.services.pagamento_service import PagamentoService
    return {
        "pagamenti": PagamentoService.get_pagamenti(
            db=db,
            paziente_id=paziente_id
        ),
        "riepilogo": PagamentoService.get_riepilogo(
            db=db,
            paziente_id=paziente_id
        )
    }