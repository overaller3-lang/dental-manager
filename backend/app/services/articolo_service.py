from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from typing import Optional
from app.models.articolo import Articolo, CategoriaArticolo
from app.schemas.articolo import ArticoloCreate, ArticoloUpdate, CategoriaArticoloCreate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class ArticoloService:

    @staticmethod
    def crea_categoria(
        db: Session,
        dati: CategoriaArticoloCreate,
        creato_da: Optional[int] = None
    ) -> CategoriaArticolo:
        esistente = db.query(CategoriaArticolo).filter(
            CategoriaArticolo.nome == dati.nome
        ).first()
        if esistente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Categoria '{dati.nome}' già esistente"
            )

        categoria = CategoriaArticolo(**dati.model_dump())
        db.add(categoria)
        db.commit()
        db.refresh(categoria)
        return categoria

    @staticmethod
    def get_categorie(db: Session) -> list:
        return db.query(CategoriaArticolo).order_by(CategoriaArticolo.nome).all()

    @staticmethod
    def crea_articolo(
        db: Session,
        dati: ArticoloCreate,
        creato_da: Optional[int] = None
    ) -> Articolo:
        esistente = db.query(Articolo).filter(
            Articolo.codice == dati.codice
        ).first()
        if esistente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Articolo con codice '{dati.codice}' già esistente"
            )

        articolo = Articolo(**dati.model_dump())
        db.add(articolo)
        db.flush()

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="articoli",
            record_id=articolo.id,
            modulo="articoli",
            dati_dopo={"codice": articolo.codice, "nome": articolo.nome},
            successo=True
        )
        db.commit()
        db.refresh(articolo)
        return articolo

    @staticmethod
    def get_articolo(db: Session, articolo_id: int) -> Articolo:
        articolo = db.query(Articolo).filter(Articolo.id == articolo_id).first()
        if not articolo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Articolo {articolo_id} non trovato"
            )
        return articolo

    @staticmethod
    def get_articoli(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        cerca: Optional[str] = None,
        tipo: Optional[str] = None,
        categoria_id: Optional[int] = None,
        attivo: Optional[bool] = True
    ) -> dict:
        query = db.query(Articolo)

        if cerca:
            query = query.filter(
                or_(
                    Articolo.nome.ilike(f"%{cerca}%"),
                    Articolo.codice.ilike(f"%{cerca}%"),
                    Articolo.descrizione.ilike(f"%{cerca}%")
                )
            )
        if tipo:
            query = query.filter(Articolo.tipo == tipo)
        if categoria_id:
            query = query.filter(Articolo.categoria_id == categoria_id)
        if attivo is not None:
            query = query.filter(Articolo.attivo == attivo)

        totale = query.count()
        items = query.order_by(Articolo.nome)\
                     .offset((pagina - 1) * per_pagina)\
                     .limit(per_pagina)\
                     .all()

        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina
        }

    @staticmethod
    def aggiorna_articolo(
        db: Session,
        articolo_id: int,
        dati: ArticoloUpdate,
        modificato_da: Optional[int] = None
    ) -> Articolo:
        articolo = ArticoloService.get_articolo(db, articolo_id)

        dati_prima = {
            "nome": articolo.nome,
            "prezzo_base": str(articolo.prezzo_base),
            "attivo": articolo.attivo
        }

        for campo, valore in dati.model_dump(exclude_unset=True).items():
            setattr(articolo, campo, valore)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="articoli",
            record_id=articolo_id,
            modulo="articoli",
            dati_prima=dati_prima,
            dati_dopo=dati.model_dump(exclude_unset=True),
            successo=True
        )
        db.commit()
        db.refresh(articolo)
        return articolo