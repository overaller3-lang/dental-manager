from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from typing import Optional
from datetime import datetime
from decimal import Decimal
from app.models.ordine import Ordine, OrdineVoce, DocumentoFiscale, DocumentoFiscaleVoce, StatoOrdine, TipoDocumentoFiscale
from app.models.appuntamento import Appuntamento, StatoAppuntamento
from app.models.piano_cura import PianoCura, StatoPianoCura
from app.models.articolo import Articolo
from app.schemas.ordine import OrdineUpdate, DocumentoFiscaleVoceCreate
from app.models.log import TipoOperazione
from app.services.log_service import LogService


class OrdineService:

    @staticmethod
    def _genera_numero_ordine(db: Session) -> str:
        anno = datetime.now().year
        ultimo = db.query(Ordine).filter(
            Ordine.numero.like(f"ORD-{anno}-%")
        ).count()
        return f"ORD-{anno}-{str(ultimo + 1).zfill(4)}"

    @staticmethod
    def _genera_numero_documento(db: Session, tipo: TipoDocumentoFiscale) -> str:
        anno = datetime.now().year
        prefisso = {
            TipoDocumentoFiscale.FATTURA: "FAT",
            TipoDocumentoFiscale.RICEVUTA: "RIC",
            TipoDocumentoFiscale.DOCUMENTO_COMMERCIALE: "DOC",
        }[tipo]
        ultimo = db.query(DocumentoFiscale).filter(
            DocumentoFiscale.numero.like(f"{prefisso}-{anno}-%")
        ).count()
        return f"{prefisso}-{anno}-{str(ultimo + 1).zfill(4)}"

    @staticmethod
    def _denormalizza(ordine: Ordine) -> Ordine:
        if ordine.paziente:
            ordine.paziente_nome = ordine.paziente.nome
            ordine.paziente_cognome = ordine.paziente.cognome
        if ordine.piano_cura:
            ordine.piano_cura_numero = ordine.piano_cura.numero
            ordine.piano_cura_titolo = ordine.piano_cura.titolo
        return ordine

    @staticmethod
    def get_or_create_per_piano(
        db: Session,
        piano_id: int,
        creato_da: Optional[int] = None,
    ) -> Ordine:
        """
        Recupera l'ordine del piano oppure ne crea uno nuovo (lazy).
        Usato dal trigger di completamento appuntamento.
        """
        piano = db.query(PianoCura).filter(PianoCura.id == piano_id).first()
        if not piano:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Piano di cura {piano_id} non trovato")

        ordine = db.query(Ordine).filter(Ordine.piano_cura_id == piano_id).first()
        if ordine:
            return ordine

        ordine = Ordine(
            piano_cura_id=piano_id,
            paziente_id=piano.paziente_id,
            creato_da=creato_da,
            numero=OrdineService._genera_numero_ordine(db),
            stato=StatoOrdine.BOZZA,
            totale_imponibile=Decimal("0"),
            totale_iva=Decimal("0"),
            totale=Decimal("0"),
            totale_pagato=Decimal("0"),
            totale_residuo=Decimal("0"),
        )
        db.add(ordine)
        db.flush()

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=creato_da,
            tabella="ordini",
            record_id=ordine.id,
            modulo="ordini",
            dati_dopo={"numero": ordine.numero, "piano_cura_id": piano_id, "origine": "lazy"},
            successo=True,
        )
        return ordine

    @staticmethod
    def aggiungi_voci_da_appuntamento(
        db: Session,
        appuntamento: Appuntamento,
        creato_da: Optional[int] = None,
    ) -> Optional[Ordine]:
        """
        Trigger: chiamato quando un appuntamento è stato segnato come COMPLETATO.
        Crea (se non esiste) l'ordine del piano e aggiunge le voci dei trattamenti
        eseguiti nella seduta.

        Strategia voci:
        - Se l'appuntamento ha `trattamenti_eseguiti` valorizzato, lo si tratta come
          una voce libera con prezzo 0 (la segreteria poi modifica/aggiunge voci).
        - Altrimenti, non si aggiungono voci automatiche; l'utente le inserirà a mano.

        Per casi più sofisticati (copia da preventivo) si può estendere qui in futuro.
        """
        if appuntamento.stato != StatoAppuntamento.COMPLETATO:
            return None
        if not appuntamento.piano_cura_id:
            return None

        ordine = OrdineService.get_or_create_per_piano(
            db, appuntamento.piano_cura_id, creato_da=creato_da
        )

        if appuntamento.trattamenti_eseguiti and appuntamento.trattamenti_eseguiti.strip():
            esiste_voce_seduta = any(
                v.note and f"appuntamento#{appuntamento.id}" in v.note
                for v in ordine.voci
            )
            if not esiste_voce_seduta:
                ordine_visualizzazione = (
                    max((v.ordine_visualizzazione or 0) for v in ordine.voci) + 1
                ) if ordine.voci else 0
                voce = OrdineVoce(
                    ordine_id=ordine.id,
                    descrizione=appuntamento.trattamenti_eseguiti.strip()[:500],
                    quantita=Decimal("1"),
                    prezzo_unitario=Decimal("0"),
                    aliquota_iva=Decimal("22"),
                    totale_voce=Decimal("0"),
                    note=f"appuntamento#{appuntamento.id} ({appuntamento.data_ora_inizio.date()})",
                    ordine_visualizzazione=ordine_visualizzazione,
                )
                db.add(voce)
                db.flush()
                db.refresh(ordine)
                OrdineService._ricalcola_totali_ordine(db, ordine)

        return ordine

    @staticmethod
    def get_ordine(db: Session, ordine_id: int) -> Ordine:
        ordine = db.query(Ordine).options(
            joinedload(Ordine.paziente),
            joinedload(Ordine.piano_cura),
        ).filter(Ordine.id == ordine_id).first()
        if not ordine:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ordine {ordine_id} non trovato")
        return OrdineService._denormalizza(ordine)

    @staticmethod
    def get_ordini(
        db: Session,
        pagina: int = 1,
        per_pagina: int = 20,
        paziente_id: Optional[int] = None,
        stato: Optional[str] = None,
        cerca: Optional[str] = None,
        ordina_per: Optional[str] = None,
        direzione: Optional[str] = None,
    ) -> dict:
        from app.api.deps import applica_ordinamento
        from app.models.paziente import Paziente
        from sqlalchemy import or_
        query = db.query(Ordine).options(
            joinedload(Ordine.paziente),
            joinedload(Ordine.piano_cura),
        )
        if paziente_id:
            query = query.filter(Ordine.paziente_id == paziente_id)
        if stato:
            query = query.filter(Ordine.stato == stato)

        # Ricerca testuale: numero ordine, nome/cognome paziente
        if cerca:
            like = f"%{cerca}%"
            query = query.outerjoin(Paziente, Paziente.id == Ordine.paziente_id).filter(
                or_(
                    Ordine.numero.ilike(like),
                    Paziente.cognome.ilike(like),
                    Paziente.nome.ilike(like),
                )
            )

        SORT_MAP = {
            'numero': Ordine.numero,
            'paziente_cognome': Paziente.cognome,
            'paziente_nome': Paziente.nome,
            'totale': Ordine.totale,
            'totale_pagato': Ordine.totale_pagato,
            'totale_residuo': Ordine.totale_residuo,
            'stato': Ordine.stato,
            'created_at': Ordine.created_at,
        }
        if ordina_per in ('paziente_cognome', 'paziente_nome'):
            query = query.join(Paziente, Paziente.id == Ordine.paziente_id)

        totale = query.count()
        if ordina_per:
            query = applica_ordinamento(query, SORT_MAP, ordina_per, direzione)
        else:
            query = query.order_by(Ordine.created_at.desc())
        items = query.offset((pagina - 1) * per_pagina).limit(per_pagina).all()
        for o in items:
            OrdineService._denormalizza(o)
        return {
            "items": items,
            "totale": totale,
            "pagina": pagina,
            "per_pagina": per_pagina,
            "pagine_totali": (totale + per_pagina - 1) // per_pagina,
        }

    @staticmethod
    def _ricalcola_totali_ordine(db: Session, ordine: Ordine) -> None:
        totale_imponibile = Decimal("0")
        totale_iva = Decimal("0")
        for voce in ordine.voci:
            imponibile = Decimal(str(voce.prezzo_unitario)) * Decimal(str(voce.quantita))
            iva = imponibile * Decimal(str(voce.aliquota_iva)) / Decimal("100")
            totale_imponibile += imponibile
            totale_iva += iva
        totale = totale_imponibile + totale_iva
        ordine.totale_imponibile = totale_imponibile
        ordine.totale_iva = totale_iva
        ordine.totale = totale
        ordine.totale_residuo = totale - Decimal(str(ordine.totale_pagato or 0))

    @staticmethod
    def aggiungi_voce(
        db: Session,
        ordine_id: int,
        articolo_id: Optional[int],
        descrizione: Optional[str],
        quantita: Decimal,
        prezzo_unitario: Optional[Decimal] = None,
        aliquota_iva: Optional[Decimal] = None,
        note: Optional[str] = None,
        modificato_da: Optional[int] = None,
    ) -> OrdineVoce:
        # solo se ordine in stato BOZZA
        ordine = OrdineService.get_ordine(db, ordine_id)
        if ordine.stato != StatoOrdine.BOZZA:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="È possibile modificare le voci solo per ordini in stato BOZZA"
            )

        if articolo_id is not None:
            articolo = db.query(Articolo).filter(
                Articolo.id == articolo_id, Articolo.attivo == True
            ).first()
            if not articolo:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Articolo non trovato o non attivo")
            descr = descrizione or articolo.nome
            prezzo = prezzo_unitario if prezzo_unitario is not None else articolo.prezzo_base
            iva = aliquota_iva if aliquota_iva is not None else articolo.aliquota_iva
        else:
            if not descrizione or prezzo_unitario is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Per voci libere servono descrizione e prezzo_unitario"
                )
            descr = descrizione
            prezzo = prezzo_unitario
            iva = aliquota_iva if aliquota_iva is not None else Decimal("22")

        q = Decimal(str(quantita))
        imponibile = Decimal(str(prezzo)) * q
        totale_voce = imponibile + (imponibile * Decimal(str(iva)) / Decimal("100"))

        ordine_visualizzazione = (max((v.ordine_visualizzazione or 0) for v in ordine.voci) + 1) if ordine.voci else 0

        voce = OrdineVoce(
            ordine_id=ordine.id,
            articolo_id=articolo_id,
            descrizione=descr,
            quantita=q,
            prezzo_unitario=prezzo,
            aliquota_iva=iva,
            totale_voce=totale_voce,
            note=note,
            ordine_visualizzazione=ordine_visualizzazione,
        )
        db.add(voce)
        db.flush()
        db.refresh(ordine)
        OrdineService._ricalcola_totali_ordine(db, ordine)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=modificato_da,
            tabella="ordini_voci",
            record_id=voce.id,
            modulo="ordini",
            dati_dopo={"ordine_id": ordine.id, "descrizione": descr, "totale_voce": str(totale_voce)},
            successo=True,
        )
        db.commit()
        db.refresh(voce)
        return voce

    @staticmethod
    def rimuovi_voce(
        db: Session,
        ordine_id: int,
        voce_id: int,
        modificato_da: Optional[int] = None,
    ) -> None:
        ordine = OrdineService.get_ordine(db, ordine_id)
        if ordine.stato != StatoOrdine.BOZZA:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="È possibile modificare le voci solo per ordini in stato BOZZA"
            )

        voce = db.query(OrdineVoce).filter(
            OrdineVoce.id == voce_id, OrdineVoce.ordine_id == ordine_id
        ).first()
        if not voce:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voce non trovata su questo ordine")

        descr = voce.descrizione
        db.delete(voce)
        db.flush()
        db.refresh(ordine)
        OrdineService._ricalcola_totali_ordine(db, ordine)

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.DELETE,
            utente_id=modificato_da,
            tabella="ordini_voci",
            record_id=voce_id,
            modulo="ordini",
            dati_prima={"descrizione": descr, "ordine_id": ordine_id},
            successo=True,
        )
        db.commit()

    @staticmethod
    def aggiorna_ordine(
        db: Session,
        ordine_id: int,
        dati: OrdineUpdate,
        modificato_da: Optional[int] = None,
    ) -> Ordine:
        ordine = OrdineService.get_ordine(db, ordine_id)
        if dati.stato is not None:
            ordine.stato = dati.stato
        if dati.note is not None:
            ordine.note = dati.note
        db.commit()
        db.refresh(ordine)
        return OrdineService._denormalizza(ordine)

    @staticmethod
    def _totale_fatturato(ordine: Ordine) -> Decimal:
        # solo fatture, le ricevute non concorrono al fatturato
        return sum(
            (Decimal(str(d.totale)) for d in ordine.documenti_fiscali if d.tipo == TipoDocumentoFiscale.FATTURA),
            Decimal("0"),
        )

    @staticmethod
    def emetti_documento_fiscale(
        db: Session,
        ordine_id: int,
        tipo: TipoDocumentoFiscale,
        emesso_da: Optional[int] = None,
        pagamento_id: Optional[int] = None,
        voci_input: Optional[list[DocumentoFiscaleVoceCreate]] = None,
    ) -> DocumentoFiscale:
        from app.models.pagamento import Pagamento, StatoPagamento

        ordine = OrdineService.get_ordine(db, ordine_id)

        if ordine.stato == StatoOrdine.ANNULLATO:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Impossibile emettere documento fiscale per un ordine annullato"
            )

        pagamento = None
        if pagamento_id is not None:
            pagamento = db.query(Pagamento).filter(Pagamento.id == pagamento_id).first()
            if not pagamento or pagamento.ordine_id != ordine_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Pagamento non valido per questo ordine"
                )
            if pagamento.stato != StatoPagamento.COMPLETATO:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="È possibile emettere ricevuta solo per pagamenti completati"
                )
            if pagamento.ricevuta:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Ricevuta {pagamento.ricevuta.numero} già emessa per questo pagamento"
                )

        # Modalità "ricevuta su singolo pagamento" → totali derivati dal pagamento, niente voci esplicite
        ricevuta_su_pagamento = (tipo == TipoDocumentoFiscale.RICEVUTA and pagamento is not None)

        if ricevuta_su_pagamento:
            if ordine.totale_imponibile and ordine.totale_imponibile > 0:
                aliquota_media = (Decimal(str(ordine.totale_iva)) / Decimal(str(ordine.totale_imponibile))) * Decimal("100")
            else:
                aliquota_media = Decimal("0")
            totale = Decimal(str(pagamento.importo))
            imponibile = totale / (Decimal("1") + aliquota_media / Decimal("100")) if aliquota_media > 0 else totale
            iva = totale - imponibile
            voci_calcolate = []  # niente voci esplicite per questa modalità
        else:
            # Modalità a voci esplicite: serve almeno una voce
            if not voci_input:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="È richiesta almeno una voce per emettere il documento"
                )
            imponibile = Decimal("0")
            iva = Decimal("0")
            voci_calcolate = []
            for v in voci_input:
                q = Decimal(str(v.quantita))
                p = Decimal(str(v.prezzo_unitario))
                a = Decimal(str(v.aliquota_iva))
                imp = p * q
                iva_voce = imp * a / Decimal("100")
                tot_voce = imp + iva_voce
                imponibile += imp
                iva += iva_voce
                voci_calcolate.append({
                    "ordine_voce_id": v.ordine_voce_id,
                    "descrizione": v.descrizione,
                    "quantita": q,
                    "prezzo_unitario": p,
                    "aliquota_iva": a,
                    "totale_voce": tot_voce,
                })
            totale = imponibile + iva

        # Vincolo: per le FATTURE la somma cumulativa non può eccedere il totale ordine
        if tipo == TipoDocumentoFiscale.FATTURA:
            gia_fatturato = OrdineService._totale_fatturato(ordine)
            residuo = Decimal(str(ordine.totale)) - gia_fatturato
            if Decimal(str(totale)) - residuo > Decimal("0.01"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Importo eccede il residuo fatturabile: "
                        f"residuo €{residuo:.2f}, fattura €{totale:.2f}"
                    )
                )

        documento = DocumentoFiscale(
            ordine_id=ordine_id,
            paziente_id=ordine.paziente_id,
            pagamento_id=pagamento_id,
            tipo=tipo,
            numero=OrdineService._genera_numero_documento(db, tipo),
            totale_imponibile=imponibile,
            totale_iva=iva,
            totale=totale,
        )
        db.add(documento)
        db.flush()

        for idx, v in enumerate(voci_calcolate):
            voce = DocumentoFiscaleVoce(
                documento_fiscale_id=documento.id,
                ordine_voce_id=v["ordine_voce_id"],
                descrizione=v["descrizione"],
                quantita=v["quantita"],
                prezzo_unitario=v["prezzo_unitario"],
                aliquota_iva=v["aliquota_iva"],
                totale_voce=v["totale_voce"],
                ordine_visualizzazione=idx,
            )
            db.add(voce)

        # Stato ordine: FATTURATO solo quando la somma cumulativa fatturata copre il totale.
        if tipo == TipoDocumentoFiscale.FATTURA:
            db.flush()
            db.refresh(ordine)
            if OrdineService._totale_fatturato(ordine) >= Decimal(str(ordine.totale)) - Decimal("0.01"):
                ordine.stato = StatoOrdine.FATTURATO

        LogService.log_evento(
            db=db,
            operazione=TipoOperazione.INSERT,
            utente_id=emesso_da,
            tabella="documenti_fiscali",
            record_id=documento.id,
            modulo="ordini",
            dati_dopo={"tipo": tipo.value, "ordine_id": ordine_id, "totale": str(totale)},
            successo=True,
        )
        db.commit()
        db.refresh(documento)
        return documento
