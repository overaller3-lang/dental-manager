# Dental Manager

Gestionale per uno studio dentistico, sviluppato come Project Work del corso L-31 (Informatica per le Aziende Digitali) — traccia PW16 sull'applicazione full-stack API-based per il settore sanitario.

L'app gestisce pazienti, cartella clinica, appuntamenti, preventivi, ordini e pagamenti, con audit log e gestione dei ruoli. Backend in Python (FastAPI + SQLAlchemy + PostgreSQL), frontend in React con Vite e Tailwind.

## Cosa fa

- Anagrafica pazienti con cartella clinica unificata, consenso al trattamento (L. 219/2017), anonimizzazione GDPR
- Calendario appuntamenti con verifica conflitti su operatore e sala
- Piani di cura con preventivi versionati (ciclo bozza → inviato → accettato/rifiutato)
- Ordini con voci, documenti fiscali (ricevute sanitarie e fatture) e pagamenti rateali
- Odontogramma in notazione FDI (ISO 3950)
- Ruoli e permessi configurabili (admin, dentisti, igienisti, segreteria, contabile)
- Log eventi e versioni dei record per ogni operazione sensibile (GDPR art. 9)
- Dashboard configurabile con widget e statistiche

## Struttura

```
dental-manager/
├── backend/        FastAPI + SQLAlchemy + PostgreSQL
│   └── app/
│       ├── api/        endpoint
│       ├── models/     ORM
│       ├── schemas/    pydantic
│       ├── services/   logica di business
│       └── core/       config, db, auth, seed
└── frontend/       React + Vite + Tailwind
    └── src/
        ├── pages/
        ├── components/
        ├── context/
        ├── hooks/
        └── services/
```

## Avvio rapido con Docker

Requisiti: Docker e Docker Compose installati.

```bash
git clone <url-del-repo>
cd dental-manager
docker compose up --build -d
```

Il primo avvio impiega circa 30-60 secondi: Docker scarica le immagini, il backend installa le dipendenze Python e popola il database con i dati di esempio (35 pazienti, ~70 piani di cura, ~300 appuntamenti distribuiti tra settembre 2025 e luglio 2026).

Una volta avviato:

- **Frontend**: <http://localhost:5173>
- **Backend (API REST)**: <http://localhost:8000>
- **Documentazione API (Swagger)**: <http://localhost:8000/docs>
- **Documentazione API (ReDoc)**: <http://localhost:8000/redoc>

Per fermare i servizi:

```bash
docker compose down
```

Per **azzerare i dati e ripartire da zero** (utile dopo modifiche al seed):

```bash
docker compose down -v
docker compose up --build -d
```

## Credenziali del seed

Account già creati al primo avvio, da usare per accedere al frontend:

| Profilo | Username | Password |
|---|---|---|
| Amministratore | `admin` | `Admin123!` |
| Dentista | `dott.bianchi` | `Password123!` |
| Dentista | `dott.ssa.moretti` | `Password123!` |
| Igienista | `f.mancini` | `Password123!` |
| Segreteria | `segreteria` | `Segreteria123!` |
| Segretario | `g.ricci` | `Password123!` |
| Titolare | `m.rizzo` | `Password123!` |
| Paziente (portale) | `m.bianchi.paz` | `Password123!` |

(Tutti gli altri utenti del seed hanno password `Password123!`.)

## Avvio locale (senza Docker)

Se preferisci eseguire backend e frontend localmente, serve PostgreSQL 16 in esecuzione su localhost:5432.

**Backend**:

```bash
cd backend
python -m venv venv
venv\Scripts\activate         # su linux/mac: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # su linux/mac: cp .env.example .env
# modifica .env se la tua connessione PostgreSQL è diversa
uvicorn app.main:app --reload --port 8000
```

**Frontend**:

```bash
cd frontend
npm install
npm run dev
```

## Variabili d'ambiente

In Docker sono definite direttamente nel `docker-compose.yml`. Per l'avvio locale serve un `backend/.env` (vedi `.env.example`):

- `DATABASE_URL` — stringa di connessione PostgreSQL (obbligatoria)
- `SECRET_KEY` — chiave per firmare i JWT (obbligatoria, almeno 32 caratteri)
- `ACCESS_TOKEN_EXPIRE_MINUTES` — durata del token in minuti, default 480 (8 ore)
- `DEBUG` — modalità verbosa, default `False`

## Note

L'app tiene log di tutti gli accessi ai dati clinici e implementa l'anonimizzazione del paziente come previsto dal GDPR art. 17. I dati clinici restano per gli obblighi di conservazione del Min. Salute, ma vengono scollegati dall'identità anagrafica.

La cartella clinica del paziente è una vista aggregata in tempo reale di anamnesi, allergie, diari di visita degli appuntamenti completati, consensi firmati e odontogramma — non duplica dati esistenti in altre tabelle.
