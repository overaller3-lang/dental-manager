from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from app.models.preventivo import Preventivo, PreventivoVoce, StatoPreventivo
from app.models.paziente import Paziente
from app.models.utente import Utente
from app.models.piano_cura import PianoCura, StatoPianoCura
from app.schemas.preventivo import PreventivoCreate, PreventivoUpdate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class PreventivoService:

    @staticmethod
    def _genera_numero(db: Session) -> str:
        anno = datetime.now().year
        ultimo = db.query(Preventivo).filter(
            Preventivo.numero.like(f"PREV-{anno}-%")
        ).count()
        return f"PREV-{anno}-{str(ultimo + 1).zfill(4)}"

    @staticmethod
    def _imponibile_voce(voce) -> Decimal:
        sub = Decimal(str(voce.prezzo_unitario)) * Decimal(str(voce.quantita))
        sconto_pct = Decimal(str(getattr(voce, "sconto_percentuale", 0) or 0))
        return sub - (sub * sconto_pct / Decimal("100"))

    @staticmethod
    def _calcola_totali(voci: list) -> dict:
        totale_imponibile = Decimal("0")
        totale_iva = Decimal("0")
        for voce in voci:
            imponibile_voce = PreventivoService._imponibile_voce(voce)
            iva_voce = imponibile_voce * Decimal(str(voce.aliquota_iva)) / Decimal("100")
            totale_imponibile += imponibile_voce
            totale_iva += iva_voce
        return {
            "totale_imponibile": totale_imponibile,
            "totale_iva": totale_iva,
            "totale": totale_imponibile + totale_iva,
        }

    @staticmethod
    def _denormalizza(prev: Preventivo) -> Preventivo:
        if prev.paziente:
            prev.paziente_nome = prev.paziente.nome
            prev.paziente_cognome = prev.paziente.cognome
        if prev.dentista:
            prev.dentista_nome = prev.dentista.nome
            prev.dentista_cognome = prev.dentista.cognome
        return prev

    @staticmethod
    def crea_preventivo(
        db: Session,
        dati: PreventivoCreate,
        creato_da: Optional[int] = None,
    ) -> Preventivo:
        """
        Crea un preventivo dentro un piano di cura.
        Se `nuova_versione=True`, il preventivo attivo del piano (se esiste)
        viene marcato come `rifiutato` e `attivo=False`, e il nuovo nasce
        con versione = max(versione_esistente) + 1.
        """
        # Piano di cura: deve esistere e corrispondere al paziente
        piano = db.query(PianoCura).filter(PianoCura.id == dati.piano_cura_id).first()
        if not piano:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Piano di cura {dati.piano_cura_id} non trovato"
            )
        if piano.paziente_id != dati.paziente_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Il paziente del preventivo non corrisponde a quello del piano di cura"
            )

        paziente = db.query(Paziente).filter(
            Paziente.id == dati.paziente_id, Paziente.attivo == True
        ).first()
        if not paziente:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paziente non trovato o non attivo")

        if dati.dentista_id is not None:
            dentista = db.query(Utente).filter(
                Utente.id == dati.dentista_id, Utente.attivo == True
            ).first()
            if not dentista:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dentista non trovato o non attivo")

        # Versioning
        preventivi_piano = db.query(Preventivo).filter(Preventivo.piano_cura_id == piano.id).all()
        if dati.nuova_versione and preventivi_piano:
            attivo = next((p for p in preventivi_piano if p.attivo), None)
            if attivo:
                attivo.attivo = False
                if attivo.stato in (StatoPreventivo.BOZZA, StatoPreventivo.INVIATO):
                    attivo.stato = StatoPreventivo.RIFIUTATO
        elif preventivi_piano and any(p.attivo for p in preventivi_piano):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Esiste già un preventivo attivo per questo piano. Per crearne uno nuovo usa nuova_versione=True."
            )

        prossima_versione = (max((p.versione for p in preventivi_piano), default=0) + 1)

        totali = PreventivoService._calcola_totali(dati.voci)

        preventivo = Preventivo(
            piano_cura_id=piano.id,
            paziente_id=dati.paziente_id,
            dentista_id=dati.dentista_id,
            creato_da=creato_da,
            numero=PreventivoService._genera_numero(db),
            versione=prossima_versione,
            attivo=True,
            descrizione=dati.descrizione,
            note=dati.note,
            data_scadenza=dati.data_scadenza or (datetime.now(timezone.utc) + timedelta(days=30)),
            **totali,
        )
        db.add(preventivo)
        db.flush()

        for i, voce_dati in enumerate(dati.voci):
            imponibile_voce = PreventivoService._imponibile_voce(voce_dati)
            iva_voce = imponibile_voce * Decimal(str(voce_dati.aliquota_iva)) / Decimal("100")
            voce = PreventivoVoce(
                preventivo_id=preventivo.id,
                articolo_id=voce_dati.articolo_id,
                descrizione=voce_dati.descrizione,
                quantita=voce_dati.quantita,
                prezzo_unitario=voce_dati.prezzo_unitario,
                aliquota_iva=voce_dati.aliquota_iva,
                sconto_percentuale=voce_dati.sconto_percentuale or Decimal("0"),
                totale_voce=imponibile_voce + iva_voce,
                note=voce_dati.note,
                ordine=voce_dati.ordine or i,
            )
            db.add(voce)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="preventivi",
            record_id=preventivo.id,
            modulo="preventivi",
            dati_dopo={
                "numero": preventivo.numero,
                "piano_cura_id": piano.id,
                "versione": prossima_versione,
                "totale": str(preventivo.totale),
            },
            successo=True,
        )
        db.commit()
        db.refresh(preventivo)
        return PreventivoService._denormalizza(preventivo)

    @staticmethod
    def get_preventivo(db: Session, preventivo_id: int) -> Preventivo:
        preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
        if not preventivo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Preventivo {preventivo_id} non trovato")
        return PreventivoService._denormalizza(preventivo)

    @staticmethod
    def get_preventivi(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        paziente_id: Optional[int] = None,
        dentista_id: Optional[int] = None,
        stato: Optional[str] = None,
        piano_cura_id: Optional[int] = None,
        cerca: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        from app.models.utente import Utente
        from sqlalchemy import or_
        from sqlalchemy.orm import aliased
        Dentista = aliased(Utente)
        query = db.query(Preventivo)
        if paziente_id:
            query = query.filter(Preventivo.paziente_id == paziente_id)
        if dentista_id:
            query = query.filter(Preventivo.dentista_id == dentista_id)
        if stato:
            query = query.filter(Preventivo.stato == stato)
        if piano_cura_id:
            query = query.filter(Preventivo.piano_cura_id == piano_cura_id)

        # Ricerca testuale: numero preventivo, descrizione, nome/cognome paziente
        if cerca:
            like = f"%{cerca}%"
            query = query.outerjoin(Paziente, Paziente.id == Preventivo.paziente_id).filter(
                or_(
                    Preventivo.numero.ilike(like),
                    Preventivo.descrizione.ilike(like),
                    Paziente.cognome.ilike(like),
                    Paziente.nome.ilike(like),
                )
            )

        SORT_MAP = {
            'id': Preventivo.id,
            'numero': Preventivo.numero,
            'paziente_cognome': Paziente.cognome,
            'paziente_nome': Paziente.nome,
            'dentista_cognome': Dentista.cognome,
            'dentista_nome': Dentista.nome,
            'totale': Preventivo.totale,
            'data_emissione': Preventivo.data_emissione,
            'data_scadenza': Preventivo.data_scadenza,
            'stato': Preventivo.stato,
            'consenso_firmato': Preventivo.consenso_firmato,
            'created_at': Preventivo.created_at,
        }
        if ordina_per in ('paziente_cognome', 'paziente_nome'):
            query = query.join(Paziente, Paziente.id == Preventivo.paziente_id)
        elif ordina_per in ('dentista_cognome', 'dentista_nome'):
            query = query.outerjoin(Dentista, Dentista.id == Preventivo.dentista_id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Preventivo.created_at.desc())
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()
        for p in items:
            PreventivoService._denormalizza(p)
        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina,
        }

    @staticmethod
    def aggiorna_preventivo(
        db: Session,
        preventivo_id: int,
        dati: PreventivoUpdate,
        modificato_da: Optional[int] = None,
    ) -> Preventivo:
        """
        Aggiorna un preventivo. Se passa a ACCETTATO, transita anche il piano
        da PROPOSTO a ACCETTATO (idempotente per stati successivi).
        """
        preventivo = PreventivoService.get_preventivo(db, preventivo_id)

        if preventivo.stato not in [StatoPreventivo.BOZZA, StatoPreventivo.INVIATO]:
            # Permettiamo solo cambio stato per portare a ACCETTATO/RIFIUTATO/SCADUTO
            campi_modificabili_post = {"stato", "consenso_firmato", "data_firma_consenso"}
            campi_richiesti = set(dati.model_fields_set) - campi_modificabili_post
            if campi_richiesti:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Impossibile modificare campi {campi_richiesti} di un preventivo in stato '{preventivo.stato.value}'"
                )

        dati_prima = {"stato": preventivo.stato.value, "totale": str(preventivo.totale)}

        if dati.voci is not None:
            db.query(PreventivoVoce).filter(
                PreventivoVoce.preventivo_id == preventivo_id
            ).delete()
            totali = PreventivoService._calcola_totali(dati.voci)
            for i, voce_dati in enumerate(dati.voci):
                imponibile_voce = PreventivoService._imponibile_voce(voce_dati)
                iva_voce = imponibile_voce * Decimal(str(voce_dati.aliquota_iva)) / Decimal("100")
                voce = PreventivoVoce(
                    preventivo_id=preventivo_id,
                    articolo_id=voce_dati.articolo_id,
                    descrizione=voce_dati.descrizione,
                    quantita=voce_dati.quantita,
                    prezzo_unitario=voce_dati.prezzo_unitario,
                    aliquota_iva=voce_dati.aliquota_iva,
                    sconto_percentuale=voce_dati.sconto_percentuale or Decimal("0"),
                    totale_voce=imponibile_voce + iva_voce,
                    note=voce_dati.note,
                    ordine=voce_dati.ordine or i,
                )
                db.add(voce)
            preventivo.totale_imponibile = totali["totale_imponibile"]
            preventivo.totale_iva = totali["totale_iva"]
            preventivo.totale = totali["totale"]

        if "dentista_id" in dati.model_fields_set:
            if dati.dentista_id is not None:
                dentista = db.query(Utente).filter(
                    Utente.id == dati.dentista_id, Utente.attivo == True
                ).first()
                if not dentista:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dentista non trovato o non attivo")
            preventivo.dentista_id = dati.dentista_id

        for campo in ("descrizione", "note", "stato", "data_scadenza", "consenso_firmato", "data_firma_consenso"):
            valore = getattr(dati, campo, None)
            if valore is not None:
                setattr(preventivo, campo, valore)

        # Transizione piano se preventivo passa a ACCETTATO o RIFIUTATO
        if dati.stato is not None and preventivo.attivo:
            piano = db.query(PianoCura).filter(PianoCura.id == preventivo.piano_cura_id).first()
            if piano:
                if dati.stato == StatoPreventivo.ACCETTATO and piano.stato == StatoPianoCura.PROPOSTO:
                    piano.stato = StatoPianoCura.ACCETTATO
                elif dati.stato == StatoPreventivo.RIFIUTATO and piano.stato == StatoPianoCura.PROPOSTO:
                    # Se il preventivo attivo è rifiutato e il piano è ancora proposto,
                    # marca il piano come abbandonato (l'utente potrà sospenderlo se vuole conservare)
                    piano.stato = StatoPianoCura.ABBANDONATO
                    if not piano.data_chiusura:
                        piano.data_chiusura = datetime.now(timezone.utc)

        LogService.log_versione(
            db=db, tabella="preventivi", record_id=preventivo_id,
            dati=dati_prima, modificato_da=modificato_da,
        )
        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.UPDATE,
            utente_id=modificato_da,
            tabella="preventivi",
            record_id=preventivo_id,
            modulo="preventivi",
            dati_prima=dati_prima,
            successo=True,
        )
        db.commit()
        db.refresh(preventivo)
        return PreventivoService._denormalizza(preventivo)
