from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.api.deps import get_utente_corrente, get_utente_admin, get_db_session
from app.models.ruolo import Ruolo
from app.models.privilegio import Funzione, Privilegio
from app.models.utente import Utente

router = APIRouter(prefix="/ruoli", tags=["Ruoli"])


class RuoloResponse(BaseModel):
    id: int
    nome: str
    descrizione: Optional[str] = None
    attivo: bool

    class Config:
        from_attributes = True


class FunzioneResponse(BaseModel):
    id: int
    nome: str
    modulo: str
    descrizione: Optional[str] = None

    class Config:
        from_attributes = True


class PrivilegioMatrice(BaseModel):
    funzione_id: int
    funzione_nome: str
    funzione_modulo: str
    funzione_descrizione: Optional[str] = None
    can_read: bool
    can_write: bool
    can_delete: bool


class RuoloConPrivilegi(RuoloResponse):
    privilegi: List[PrivilegioMatrice]


class AggiornamentoPrivilegio(BaseModel):
    funzione_id: int
    can_read: bool
    can_write: bool
    can_delete: bool


class AggiornamentoPrivilegi(BaseModel):
    privilegi: List[AggiornamentoPrivilegio]


@router.get("", response_model=List[RuoloResponse])
def lista_ruoli(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    return db.query(Ruolo).filter(Ruolo.attivo == True).order_by(Ruolo.nome).all()


@router.get("/funzioni", response_model=List[FunzioneResponse])
def lista_funzioni(
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    return db.query(Funzione).filter(Funzione.attivo == True).order_by(Funzione.modulo, Funzione.nome).all()


@router.get("/{ruolo_id}/privilegi", response_model=RuoloConPrivilegi)
def get_privilegi_ruolo(
    ruolo_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session)
):
    ruolo = db.query(Ruolo).filter(Ruolo.id == ruolo_id).first()
    if not ruolo:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")

    funzioni = db.query(Funzione).filter(Funzione.attivo == True).order_by(Funzione.modulo, Funzione.nome).all()
    privilegi_map = {
        p.funzione_id: p
        for p in db.query(Privilegio).filter(Privilegio.ruolo_id == ruolo_id).all()
    }

    matrice = [
        PrivilegioMatrice(
            funzione_id=f.id,
            funzione_nome=f.nome,
            funzione_modulo=f.modulo,
            funzione_descrizione=f.descrizione,
            can_read=privilegi_map[f.id].can_read if f.id in privilegi_map else False,
            can_write=privilegi_map[f.id].can_write if f.id in privilegi_map else False,
            can_delete=privilegi_map[f.id].can_delete if f.id in privilegi_map else False,
        )
        for f in funzioni
    ]

    return RuoloConPrivilegi(
        id=ruolo.id, nome=ruolo.nome, descrizione=ruolo.descrizione,
        attivo=ruolo.attivo, privilegi=matrice
    )


@router.put("/{ruolo_id}/privilegi")
def aggiorna_privilegi_ruolo(
    ruolo_id: int,
    dati: AggiornamentoPrivilegi,
    utente_corrente: Utente = Depends(get_utente_admin),
    db: Session = Depends(get_db_session)
):
    ruolo = db.query(Ruolo).filter(Ruolo.id == ruolo_id).first()
    if not ruolo:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")

    for p_data in dati.privilegi:
        privilegio = db.query(Privilegio).filter(
            Privilegio.ruolo_id == ruolo_id,
            Privilegio.funzione_id == p_data.funzione_id
        ).first()
        if privilegio:
            privilegio.can_read = p_data.can_read
            privilegio.can_write = p_data.can_write
            privilegio.can_delete = p_data.can_delete
        else:
            db.add(Privilegio(
                ruolo_id=ruolo_id,
                funzione_id=p_data.funzione_id,
                can_read=p_data.can_read,
                can_write=p_data.can_write,
                can_delete=p_data.can_delete
            ))

    db.commit()
    return {"message": f"Privilegi per '{ruolo.nome}' aggiornati"}
