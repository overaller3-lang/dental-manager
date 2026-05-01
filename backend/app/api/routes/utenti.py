from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_utente_corrente, get_utente_admin, get_db_session
from app.schemas.utente import UtenteCreate, UtenteUpdate, UtenteResponse, UtentePaginato, ContattoCreate, ContattoResponse
from app.services.utente_service import UtenteService
from app.models.utente import Utente

router = APIRouter(prefix="/utenti", tags=["Utenti"])


@router.post("", response_model=UtenteResponse, status_code=status.HTTP_201_CREATED)
def crea_utente(
    dati: UtenteCreate,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Crea un nuovo utente. Solo admin."""
    return UtenteService.crea_utente(db=db, dati=dati, creato_da=utente_corrente.id)


@router.get("", response_model=UtentePaginato)
def lista_utenti(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    cerca: Optional[str] = Query(None),
    attivo: Optional[bool] = Query(None),
    ruolo: Optional[str] = Query(None),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Lista utenti con ricerca, paginazione e ordinamento server-side. Solo admin."""
    return UtenteService.get_utenti(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        cerca=cerca,
        attivo=attivo,
        ruolo=ruolo,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/dentisti", response_model=list[UtenteResponse])
def lista_dentisti(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista dentisti attivi. Accessibile a tutti gli utenti autenticati."""
    result = UtenteService.get_utenti(db=db, ruolo="dentista", attivo=True, per_pagina=100)
    return result["items"]


RUOLI_OPERATORI = [
    "dentista", "igienista", "ortodontista", "endodontista",
    "parodontologo", "medico_estetico", "aso", "titolare",
    "dir_sanitario", "protesista",
]


@router.get("/operatori", response_model=list[UtenteResponse])
def lista_operatori(
    solo_attivi: bool = False,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Lista operatori sanitari (default: include anche i disattivati, marcati con `attivo=false`).
    Il frontend può mostrarli in stile "disattivato" e bloccare il submit; usare
    solo_attivi=true per ottenere solo quelli realmente selezionabili.
    """
    from app.models.ruolo import Ruolo, UtenteRuolo
    ruolo_ids = [r[0] for r in db.query(Ruolo.id).filter(Ruolo.nome.in_(RUOLI_OPERATORI)).all()]
    if not ruolo_ids:
        return []
    utente_ids = list({u[0] for u in db.query(UtenteRuolo.utente_id).filter(UtenteRuolo.ruolo_id.in_(ruolo_ids)).all()})
    if not utente_ids:
        return []
    q = db.query(Utente).filter(Utente.id.in_(utente_ids))
    if solo_attivi:
        q = q.filter(Utente.attivo == True)
    return q.order_by(Utente.cognome, Utente.nome).all()


@router.get("/{utente_id}", response_model=UtenteResponse)
def get_utente(
    utente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Recupera un utente per id.
    Un utente può vedere solo se stesso, l'admin può vedere tutti.
    """
    from app.models.ruolo import Ruolo, UtenteRuolo
    ruoli = db.query(Ruolo.nome).join(UtenteRuolo).filter(
        UtenteRuolo.utente_id == utente_corrente.id
    ).all()
    ruoli_nomi = [r.nome for r in ruoli]

    if utente_corrente.id != utente_id and "admin" not in ruoli_nomi:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")

    return UtenteService.get_utente(db=db, utente_id=utente_id)


@router.get("/{utente_id}/pazienti")
def lista_pazienti_visitati(
    utente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Pazienti distinti che hanno avuto almeno un appuntamento con questo operatore.
    Ordinati per data ultimo appuntamento decrescente."""
    from sqlalchemy import func
    from app.models.appuntamento import Appuntamento
    from app.models.paziente import Paziente
    righe = (
        db.query(
            Paziente.id,
            Paziente.nome,
            Paziente.cognome,
            Paziente.telefono,
            Paziente.email,
            func.max(Appuntamento.data_ora_inizio).label("ultimo_appuntamento"),
            func.count(Appuntamento.id).label("totale_appuntamenti"),
        )
        .join(Appuntamento, Appuntamento.paziente_id == Paziente.id)
        .filter(Appuntamento.dentista_id == utente_id)
        .group_by(Paziente.id, Paziente.nome, Paziente.cognome, Paziente.telefono, Paziente.email)
        .order_by(func.max(Appuntamento.data_ora_inizio).desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "nome": r.nome,
            "cognome": r.cognome,
            "telefono": r.telefono,
            "email": r.email,
            "ultimo_appuntamento": r.ultimo_appuntamento.isoformat() if r.ultimo_appuntamento else None,
            "totale_appuntamenti": r.totale_appuntamenti,
        }
        for r in righe
    ]


@router.patch("/{utente_id}", response_model=UtenteResponse)
def aggiorna_utente(
    utente_id: int,
    dati: UtenteUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Aggiorna i dati di un utente."""
    return UtenteService.aggiorna_utente(
        db=db,
        utente_id=utente_id,
        dati=dati,
        modificato_da=utente_corrente.id
    )


@router.delete("/{utente_id}/elimina")
def elimina_utente(
    utente_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Elimina fisicamente un utente. Solo admin. Bloccato se esistono record collegati."""
    from app.models.appuntamento import Appuntamento
    from app.models.preventivo import Preventivo

    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    if utente.id == utente_corrente.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo stesso account")

    referenze = {}
    n = db.query(Appuntamento).filter(Appuntamento.dentista_id == utente_id).count()
    if n: referenze["appuntamenti"] = n
    n = db.query(Preventivo).filter(Preventivo.dentista_id == utente_id).count()
    if n: referenze["preventivi"] = n

    if referenze:
        raise HTTPException(
            status_code=409,
            detail={"messaggio": "Impossibile eliminare: l'utente ha record collegati.", "referenze": referenze}
        )

    db.delete(utente)
    db.commit()
    return {"message": f"Utente {utente_id} eliminato con successo"}


@router.delete("/{utente_id}")
def disattiva_utente(
    utente_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Disattiva un utente. Solo admin."""
    UtenteService.disattiva_utente(
        db=db,
        utente_id=utente_id,
        disattivato_da=utente_corrente.id
    )
    return {"message": f"Utente {utente_id} disattivato con successo"}


@router.post("/{utente_id}/ruoli/{ruolo_nome}")
def assegna_ruolo(
    utente_id: int,
    ruolo_nome: str,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Assegna un ruolo a un utente. Solo admin."""
    UtenteService.assegna_ruolo(
        db=db,
        utente_id=utente_id,
        ruolo_nome=ruolo_nome,
        assegnato_da=utente_corrente.id
    )
    return {"message": f"Ruolo '{ruolo_nome}' assegnato con successo"}


@router.post("/{utente_id}/riattiva", response_model=UtenteResponse)
def riattiva_utente(
    utente_id: int,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    """Riattiva un utente disattivato. Solo admin."""
    return UtenteService.aggiorna_utente(
        db=db,
        utente_id=utente_id,
        dati=UtenteUpdate(attivo=True),
        modificato_da=utente_corrente.id
    )


@router.post("/{utente_id}/contatti", response_model=ContattoResponse)
def aggiungi_contatto(
    utente_id: int,
    dati: ContattoCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Aggiunge un contatto a un utente."""
    return UtenteService.aggiungi_contatto(db=db, utente_id=utente_id, dati=dati)