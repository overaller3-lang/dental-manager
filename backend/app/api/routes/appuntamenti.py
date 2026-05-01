from fastapi import APIRouter, Depends, Query, status, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, date
from app.api.deps import get_utente_corrente, get_utente_dentista, get_db_session
from app.schemas.appuntamento import (
    AppuntamentoCreate, AppuntamentoUpdate,
    AppuntamentoResponse, AppuntamentoPaginato, AgendaGiornaliera
)
from app.services.appuntamento_service import AppuntamentoService
from app.models.utente import Utente

router = APIRouter(prefix="/appuntamenti", tags=["Appuntamenti"])


@router.get("/ics")
def esporta_ics(
    ids: str = Query(..., description="ID appuntamenti separati da virgola"),
    db: Session = Depends(get_db_session)
):
    """Esporta appuntamenti in formato iCalendar (.ics). Endpoint pubblico per QR code."""
    from app.models.appuntamento import Appuntamento
    try:
        id_list = [int(i.strip()) for i in ids.split(',') if i.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="IDs non validi")
    if not id_list or len(id_list) > 50:
        raise HTTPException(status_code=400, detail="Fornire tra 1 e 50 ID")

    appuntamenti = db.query(Appuntamento).filter(Appuntamento.id.in_(id_list)).all()
    for a in appuntamenti:
        if a.paziente:
            a.paziente_nome = a.paziente.nome
            a.paziente_cognome = a.paziente.cognome
        if a.dentista:
            a.dentista_nome = a.dentista.nome
            a.dentista_cognome = a.dentista.cognome

    from app.models.impostazioni import ImpostazioniStudio
    imp = db.query(ImpostazioniStudio).first()
    nome_studio = (imp.nome_studio if imp and imp.nome_studio else 'Studio Dentistico')
    indirizzo_studio = (imp.indirizzo if imp and imp.indirizzo else '')

    def fmt_dt(dt):
        return dt.strftime('%Y%m%dT%H%M%SZ')

    import uuid as _uuid
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentalManager//IT', 'CALSCALE:GREGORIAN']
    for a in appuntamenti:
        paziente = ' '.join(filter(None, [getattr(a, 'paziente_cognome', ''), getattr(a, 'paziente_nome', '')]))
        dentista = ' '.join(filter(None, [getattr(a, 'dentista_cognome', ''), getattr(a, 'dentista_nome', '')]))
        tipo = a.tipo.value if hasattr(a.tipo, 'value') else str(a.tipo)
        desc_parts = []
        if paziente: desc_parts.append(f'Paziente: {paziente}')
        if dentista: desc_parts.append(f'Operatore: {dentista}')
        if tipo: desc_parts.append(f'Tipo: {tipo.replace("_", " ")}')
        if a.motivo: desc_parts.append(f'Motivo: {a.motivo}')
        location = indirizzo_studio or a.sala or ''
        lines += [
            'BEGIN:VEVENT',
            f'UID:{_uuid.uuid4()}@dental',
            f'DTSTAMP:{fmt_dt(datetime.utcnow())}',
            f'DTSTART:{fmt_dt(a.data_ora_inizio)}',
            f'DTEND:{fmt_dt(a.data_ora_fine)}',
            f'SUMMARY:{nome_studio}',
        ]
        if desc_parts: lines.append(f'DESCRIPTION:{chr(92).join(desc_parts)}')
        if location: lines.append(f'LOCATION:{location}')
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    ics = '\r\n'.join(lines)
    filename = f'appuntamenti-{id_list[0]}.ics' if len(id_list) == 1 else 'appuntamenti.ics'
    return Response(
        content=ics,
        media_type='text/calendar; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


@router.post("", response_model=AppuntamentoResponse, status_code=status.HTTP_201_CREATED)
def crea_appuntamento(
    dati: AppuntamentoCreate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Crea un nuovo appuntamento.
    Verifica automaticamente conflitti di orario per il dentista.
    """
    return AppuntamentoService.crea_appuntamento(
        db=db,
        dati=dati,
        creato_da=utente_corrente.id
    )


@router.post("/batch")
def crea_appuntamenti_batch(
    appuntamenti: List[AppuntamentoCreate],
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Crea più appuntamenti ricorrenti in un colpo solo. Restituisce esito per ognuno.

    Ogni appuntamento è isolato in una sub-transazione: un fallimento non
    invalida quelli già creati, ma errori non-HTTP fanno rollback solo della
    riga in errore.
    """
    if not appuntamenti:
        raise HTTPException(status_code=400, detail="Nessun appuntamento fornito")
    if len(appuntamenti) > 100:
        raise HTTPException(status_code=400, detail="Massimo 100 appuntamenti per batch")

    risultati = []
    for dati in appuntamenti:
        try:
            app = AppuntamentoService.crea_appuntamento(db=db, dati=dati, creato_da=utente_corrente.id)
            risultati.append({"ok": True, "data_ora_inizio": dati.data_ora_inizio.isoformat(), "id": app.id})
        except HTTPException as e:
            db.rollback()
            risultati.append({"ok": False, "data_ora_inizio": dati.data_ora_inizio.isoformat(), "errore": e.detail})
        except Exception as e:
            db.rollback()
            risultati.append({"ok": False, "data_ora_inizio": dati.data_ora_inizio.isoformat(), "errore": str(e)})
    return {"risultati": risultati, "creati": sum(1 for r in risultati if r["ok"]), "totale": len(risultati)}


@router.get("/conteggio-mensile")
def conteggio_mensile(
    anno: int = Query(..., ge=2000, le=2100),
    mese: int = Query(..., ge=1, le=12),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Numero appuntamenti per giorno nel mese richiesto. Ritorna {YYYY-MM-DD: n}."""
    from sqlalchemy import func, cast, Date
    from app.models.appuntamento import Appuntamento
    from calendar import monthrange
    inizio = datetime(anno, mese, 1)
    ultimo = monthrange(anno, mese)[1]
    fine = datetime(anno, mese, ultimo, 23, 59, 59)
    righe = (
        db.query(
            cast(Appuntamento.data_ora_inizio, Date).label("giorno"),
            func.count(Appuntamento.id).label("n"),
        )
        .filter(Appuntamento.data_ora_inizio >= inizio, Appuntamento.data_ora_inizio <= fine)
        .group_by("giorno")
        .all()
    )
    return {r.giorno.isoformat(): r.n for r in righe}


@router.get("/conteggio-giornaliero")
def conteggio_giornaliero(
    data_da: date = Query(...),
    data_a: date = Query(...),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """Numero appuntamenti per giorno nel range richiesto. Ritorna {YYYY-MM-DD: n}.
    Usato dal calendario settimanale (la settimana può attraversare due mesi)."""
    from sqlalchemy import func, cast, Date
    from app.models.appuntamento import Appuntamento
    inizio = datetime.combine(data_da, datetime.min.time())
    fine = datetime.combine(data_a, datetime.max.time())
    righe = (
        db.query(
            cast(Appuntamento.data_ora_inizio, Date).label("giorno"),
            func.count(Appuntamento.id).label("n"),
        )
        .filter(Appuntamento.data_ora_inizio >= inizio, Appuntamento.data_ora_inizio <= fine)
        .group_by("giorno")
        .all()
    )
    return {r.giorno.isoformat(): r.n for r in righe}


@router.get("", response_model=AppuntamentoPaginato)
def lista_appuntamenti(
    pagina: int = Query(1, ge=1),
    per_pagina: int = Query(20, ge=1, le=100),
    paziente_id: Optional[int] = Query(None),
    dentista_id: Optional[int] = Query(None),
    sala: Optional[str] = Query(None),
    stato: Optional[str] = Query(None),
    data_da: Optional[datetime] = Query(None),
    data_a: Optional[datetime] = Query(None),
    cerca: Optional[str] = Query(None),
    ordina_per: Optional[str] = Query(None),
    direzione: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Lista appuntamenti con filtri, paginazione e ordinamento server-side."""
    return AppuntamentoService.get_appuntamenti(
        db=db,
        pagina=pagina,
        per_pagina=per_pagina,
        paziente_id=paziente_id,
        dentista_id=dentista_id,
        sala=sala,
        stato=stato,
        data_da=data_da,
        data_a=data_a,
        cerca=cerca,
        ordina_per=ordina_per,
        direzione=direzione,
    )


@router.get("/verifica-sala")
def verifica_disponibilita_sala(
    sala: str = Query(...),
    data_ora_inizio: datetime = Query(...),
    data_ora_fine: datetime = Query(...),
    escludi_id: Optional[int] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Verifica se una sala è disponibile nella fascia oraria indicata."""
    occupata = AppuntamentoService.verifica_conflitti_sala(
        db=db, sala=sala,
        data_ora_inizio=data_ora_inizio, data_ora_fine=data_ora_fine,
        escludi_id=escludi_id
    )
    return {"disponibile": not occupata}


def _enum_value(v):
    return v.value if hasattr(v, "value") else str(v)


def _app_to_dict(a) -> dict:
    return {
        "id": a.id,
        "paziente_nome": getattr(a, "paziente_nome", None),
        "paziente_cognome": getattr(a, "paziente_cognome", None),
        "dentista_nome": getattr(a, "dentista_nome", None),
        "dentista_cognome": getattr(a, "dentista_cognome", None),
        "data_ora_inizio": a.data_ora_inizio.isoformat(),
        "data_ora_fine": a.data_ora_fine.isoformat(),
        "tipo": _enum_value(a.tipo),
        "sala": a.sala,
        "stato": _enum_value(a.stato),
    }


@router.get("/verifica-conflitti")
def verifica_conflitti_completa(
    data_ora_inizio: datetime = Query(...),
    data_ora_fine: datetime = Query(...),
    sala: Optional[str] = Query(None),
    dentista_id: Optional[int] = Query(None),
    paziente_id: Optional[int] = Query(None),
    escludi_id: Optional[int] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Verifica conflitti di sala, operatore e paziente nella fascia oraria."""
    result = {"sala_occupata": [], "operatore_occupato": [], "paziente_occupato": []}
    if sala:
        items = AppuntamentoService.lista_conflitti_sala(db, sala, data_ora_inizio, data_ora_fine, escludi_id)
        result["sala_occupata"] = [_app_to_dict(a) for a in items]
    if dentista_id:
        items = AppuntamentoService.lista_conflitti_dentista(db, dentista_id, data_ora_inizio, data_ora_fine, escludi_id)
        result["operatore_occupato"] = [_app_to_dict(a) for a in items]
    if paziente_id:
        items = AppuntamentoService.lista_conflitti_paziente(db, paziente_id, data_ora_inizio, data_ora_fine, escludi_id)
        result["paziente_occupato"] = [_app_to_dict(a) for a in items]
    return result


@router.get("/agenda/{dentista_id}", response_model=AgendaGiornaliera)
def get_agenda(
    dentista_id: int,
    data: date = Query(default=None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Agenda giornaliera di un dentista.
    Se non si specifica la data, usa oggi.
    """
    if data is None:
        data = date.today()

    return AppuntamentoService.get_agenda_giornaliera(
        db=db,
        dentista_id=dentista_id,
        data=data
    )


@router.delete("/{appuntamento_id}")
def elimina_appuntamento(
    appuntamento_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Elimina fisicamente un appuntamento.
    Bloccato se l'appuntamento è completato e il piano ha già un ordine non in bozza
    (la prestazione è già contabilizzata).
    """
    from app.models.appuntamento import Appuntamento, StatoAppuntamento
    from app.models.ordine import Ordine, StatoOrdine

    appuntamento = db.query(Appuntamento).filter(Appuntamento.id == appuntamento_id).first()
    if not appuntamento:
        raise HTTPException(status_code=404, detail="Appuntamento non trovato")

    if appuntamento.stato == StatoAppuntamento.COMPLETATO and appuntamento.piano_cura_id:
        ordine = db.query(Ordine).filter(
            Ordine.piano_cura_id == appuntamento.piano_cura_id,
            Ordine.stato != StatoOrdine.BOZZA,
        ).first()
        if ordine:
            raise HTTPException(
                status_code=409,
                detail={
                    "messaggio": f"Impossibile eliminare: la seduta è già contabilizzata nell'ordine {ordine.numero}.",
                    "referenze": {"ordini": 1},
                },
            )

    db.delete(appuntamento)
    db.commit()
    return {"message": f"Appuntamento {appuntamento_id} eliminato con successo"}


@router.get("/{appuntamento_id}", response_model=AppuntamentoResponse)
def get_appuntamento(
    appuntamento_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Recupera un appuntamento per id."""
    return AppuntamentoService.get_appuntamento(
        db=db,
        appuntamento_id=appuntamento_id
    )


@router.patch("/{appuntamento_id}", response_model=AppuntamentoResponse)
def aggiorna_appuntamento(
    appuntamento_id: int,
    dati: AppuntamentoUpdate,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """
    Aggiorna un appuntamento.
    Se cambiano gli orari verifica automaticamente i conflitti.
    """
    return AppuntamentoService.aggiorna_appuntamento(
        db=db,
        appuntamento_id=appuntamento_id,
        dati=dati,
        modificato_da=utente_corrente.id
    )


@router.post("/{appuntamento_id}/annulla")
def annulla_appuntamento(
    appuntamento_id: int,
    motivo: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    """Annulla un appuntamento."""
    AppuntamentoService.annulla_appuntamento(
        db=db,
        appuntamento_id=appuntamento_id,
        motivo=motivo,
        annullato_da=utente_corrente.id
    )
    return {"message": f"Appuntamento {appuntamento_id} annullato con successo"}


@router.post("/{appuntamento_id}/completa", response_model=AppuntamentoResponse)
def completa_appuntamento(
    appuntamento_id: int,
    note_cliniche: Optional[str] = Query(None),
    utente_corrente: Utente = Depends(get_utente_dentista),
    db: Session = Depends(get_db_session)
):
    """
    Segna un appuntamento come completato.
    Solo dentisti e admin.
    Dopo il completamento è possibile creare l'ordine.
    """
    from app.models.appuntamento import StatoAppuntamento

    update_dati: dict = {"stato": StatoAppuntamento.COMPLETATO}
    if note_cliniche is not None:
        update_dati["note_cliniche"] = note_cliniche

    return AppuntamentoService.aggiorna_appuntamento(
        db=db,
        appuntamento_id=appuntamento_id,
        dati=AppuntamentoUpdate(**update_dati),
        modificato_da=utente_corrente.id
    )