from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.api import api_router
from fastapi.security import HTTPBearer


def reset_cliniche_se_serve():
    # se la tabella piani_cura non c'e' siamo al primo avvio dopo il refactor:
    # le tabelle cliniche vanno droppate, le anagrafiche restano
    inspector = inspect(engine)
    if inspector.has_table("piani_cura"):
        return

    cliniche = [
        "documenti_fiscali",
        "pagamenti",
        "ordini_voci",
        "ordini",
        "preventivi_voci",
        "preventivi",
        "appuntamenti",
        "lista_attesa",
        "documenti_clinici",
        "denti_stato",
        "pazienti",
    ]
    with engine.connect() as conn:
        for tbl in cliniche:
            conn.execute(text(f'DROP TABLE IF EXISTS {tbl} CASCADE'))
        for enum_name in ("statoordine", "tipodocumentofiscale", "statopreventivo",
                          "statoappuntamento", "tipoappuntamento", "statopagamento",
                          "metodopagamento"):
            conn.execute(text(f'DROP TYPE IF EXISTS {enum_name} CASCADE'))
        conn.commit()
    print("Reset tabelle cliniche eseguito")


reset_cliniche_se_serve()
Base.metadata.create_all(bind=engine)


def migra_db():
    # converte sesso da enum a varchar per supportare valori liberi
    with engine.connect() as conn:
        conn.execute(text("""
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sesso_paziente') THEN
                ALTER TABLE pazienti ALTER COLUMN sesso TYPE VARCHAR(50) USING sesso::VARCHAR;
                DROP TYPE sesso_paziente;
              END IF;
            END $$;
        """))
        conn.commit()

    # aggiunge 'RINVIATO' all'enum statoappuntamento
    with engine.connect() as conn:
        conn.execute(text("""
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'RINVIATO'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'statoappuntamento')
              ) THEN
                ALTER TYPE statoappuntamento ADD VALUE 'RINVIATO';
              END IF;
            END $$;
        """))
        conn.commit()

    nuove_colonne = [
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS pausa_attiva BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS ora_inizio_pausa VARCHAR(5) DEFAULT '13:00'",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS ora_fine_pausa VARCHAR(5) DEFAULT '14:00'",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS nome_studio VARCHAR(200)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS indirizzo VARCHAR(300)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS telefono VARCHAR(20)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS email VARCHAR(100)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS sito_web VARCHAR(200)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS partita_iva VARCHAR(20)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS codice_fiscale VARCHAR(20)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS promemoria_abilitato BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS promemoria_ore_prima INTEGER NOT NULL DEFAULT 24",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS promemoria_email BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS promemoria_sms BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS patrono_data VARCHAR(5)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS patrono_nome VARCHAR(100)",
        "ALTER TABLE impostazioni_studio ADD COLUMN IF NOT EXISTS festivita_personalizzate JSON",
        # Campi clinici visita su appuntamenti
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS anamnesi_aggiornamento TEXT",
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS esame_obiettivo TEXT",
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS diagnosi TEXT",
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS trattamenti_eseguiti TEXT",
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS prossimo_controllo_data DATE",
        "ALTER TABLE appuntamenti ADD COLUMN IF NOT EXISTS prossimo_controllo_note TEXT",
        # FK ricevuta -> pagamento
        "ALTER TABLE documenti_fiscali ADD COLUMN IF NOT EXISTS pagamento_id INTEGER REFERENCES pagamenti(id) ON DELETE SET NULL",
        # Colore avatar utente
        "ALTER TABLE utenti ADD COLUMN IF NOT EXISTS colore_avatar VARCHAR(7)",
        # Operatore opzionale sul preventivo (non più obbligatorio); FK ON DELETE SET NULL
        "ALTER TABLE preventivi ALTER COLUMN dentista_id DROP NOT NULL",
        "ALTER TABLE preventivi DROP CONSTRAINT IF EXISTS preventivi_dentista_id_fkey",
        "ALTER TABLE preventivi ADD CONSTRAINT preventivi_dentista_id_fkey FOREIGN KEY (dentista_id) REFERENCES utenti(id) ON DELETE SET NULL",
        # Sconto percentuale per voce di preventivo
        "ALTER TABLE preventivi_voci ADD COLUMN IF NOT EXISTS sconto_percentuale NUMERIC(5,2) NOT NULL DEFAULT 0",
        # Rimozione DocumentoClinico: la cartella clinica e' una vista aggregata,
        # non una tabella autonoma. La tabella esisteva solo come predisposizione mai usata.
        "DROP TABLE IF EXISTS documenti_clinici CASCADE",
        "DROP TYPE IF EXISTS tipodocumento CASCADE",
        # Colore di sfondo per la stanza, propagato alle tabelle che la mostrano.
        "ALTER TABLE stanze ADD COLUMN IF NOT EXISTS colore VARCHAR(7)",
    ]
    with engine.connect() as conn:
        for stmt in nuove_colonne:
            conn.execute(text(stmt))
            conn.commit()

    nuovi_index = [
        # FK heavily used in WHERE clauses (Priorità alta)
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_paziente_id      ON appuntamenti(paziente_id)",
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_dentista_id      ON appuntamenti(dentista_id)",
        "CREATE INDEX IF NOT EXISTS ix_preventivi_paziente_id        ON preventivi(paziente_id)",
        "CREATE INDEX IF NOT EXISTS ix_ordini_paziente_id            ON ordini(paziente_id)",
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_paziente_id         ON pagamenti(paziente_id)",
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_ordine_id           ON pagamenti(ordine_id)",
        "CREATE INDEX IF NOT EXISTS ix_ordini_voci_ordine_id         ON ordini_voci(ordine_id)",
        "CREATE INDEX IF NOT EXISTS ix_preventivi_voci_preventivo_id ON preventivi_voci(preventivo_id)",
        # Composite per scheda utente (pazienti visitati dall'operatore)
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_dentista_paziente ON appuntamenti(dentista_id, paziente_id)",
        # Junction tabella ruoli (lookup ruoli di un utente / utenti di un ruolo)
        "CREATE INDEX IF NOT EXISTS ix_utenti_ruoli_utente_id        ON utenti_ruoli(utente_id)",
        "CREATE INDEX IF NOT EXISTS ix_utenti_ruoli_ruolo_id         ON utenti_ruoli(ruolo_id)",
        # Log per utente
        "CREATE INDEX IF NOT EXISTS ix_log_eventi_utente_id          ON log_eventi(utente_id)",
        # Documenti fiscali per ordine/pagamento
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_ordine_id   ON documenti_fiscali(ordine_id)",
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_pagamento_id ON documenti_fiscali(pagamento_id)",
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_paziente_id ON documenti_fiscali(paziente_id)",
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_tipo        ON documenti_fiscali(tipo)",
        # Voci documento fiscale (lookup per documento)
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_voci_documento_id ON documenti_fiscali_voci(documento_fiscale_id)",
        # Composite per agenda operatore/cronologia paziente per intervallo date
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_dentista_data    ON appuntamenti(dentista_id, data_ora_inizio)",
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_paziente_data    ON appuntamenti(paziente_id, data_ora_inizio)",
        # Aggregazioni giornaliere dashboard (selettore widget settimanale)
        "CREATE INDEX IF NOT EXISTS ix_ordini_created_at             ON ordini(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_documenti_fiscali_data_emissione ON documenti_fiscali(data_emissione)",
        # Sort di default delle liste anagrafiche (cognome, nome)
        "CREATE INDEX IF NOT EXISTS ix_pazienti_cognome_nome ON pazienti(cognome, nome)",
        "CREATE INDEX IF NOT EXISTS ix_utenti_cognome_nome   ON utenti(cognome, nome)",
        # Sort temporali frequenti su entita' con cronologia visibile a UI
        "CREATE INDEX IF NOT EXISTS ix_pazienti_data_nascita     ON pazienti(data_nascita)",
        "CREATE INDEX IF NOT EXISTS ix_appuntamenti_created_at   ON appuntamenti(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_preventivi_data_emissione ON preventivi(data_emissione)",
        "CREATE INDEX IF NOT EXISTS ix_preventivi_created_at     ON preventivi(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_data_pagamento  ON pagamenti(data_pagamento)",
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_created_at      ON pagamenti(created_at)",
        # Filter Pagamenti aggiunti con la pagina di ricerca
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_metodo ON pagamenti(metodo)",
        "CREATE INDEX IF NOT EXISTS ix_pagamenti_stato  ON pagamenti(stato)",
        # Sort temporali sui piani di cura (data_apertura DESC e' il default)
        "CREATE INDEX IF NOT EXISTS ix_piani_cura_data_apertura ON piani_cura(data_apertura)",
        "CREATE INDEX IF NOT EXISTS ix_piani_cura_data_chiusura ON piani_cura(data_chiusura)",
        "CREATE INDEX IF NOT EXISTS ix_piani_cura_created_at    ON piani_cura(created_at)",
    ]
    with engine.connect() as conn:
        for stmt in nuovi_index:
            conn.execute(text(stmt))
            conn.commit()


migra_db()


def init_db():
    db = SessionLocal()
    try:
        from app.core.seed import run_seed
        run_seed(db)
    finally:
        db.close()

init_db()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API per la gestione di uno studio dentistico",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/", tags=["Health"])
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}