from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone, date, time
from decimal import Decimal
from collections import defaultdict
import random

from app.core.security import get_password_hash
from app.models.ruolo import Ruolo, UtenteRuolo
from app.models.privilegio import Funzione, Privilegio
from app.models.utente import Utente
from app.models.paziente import Paziente
from app.models.stanza import Stanza
from app.models.impostazioni import ImpostazioniStudio
from app.models.articolo import CategoriaArticolo, Articolo
from app.models.piano_cura import PianoCura, StatoPianoCura
from app.models.preventivo import Preventivo, PreventivoVoce, StatoPreventivo
from app.models.appuntamento import Appuntamento, StatoAppuntamento, TipoAppuntamento
from app.models.odontogramma import DenteStato, StatoDente
from app.models.ordine import (
    Ordine, OrdineVoce, DocumentoFiscale, DocumentoFiscaleVoce,
    StatoOrdine, TipoDocumentoFiscale,
)
from app.models.pagamento import Pagamento, MetodoPagamento, StatoPagamento

# Seed riproducibile (stessi dati ad ogni esecuzione su DB vuoto)
random.seed(42)


# ── definizione ruoli ─────────────────────────────────────────────────────────
# Tengo tutti i ruoli definiti anche se non usati: la matrice di permessi
# per ruolo resta valida e sopravvive a eventuali nuovi utenti.

RUOLI = [
    {"nome": "admin",          "descrizione": "Amministratore — controllo totale del sistema"},
    {"nome": "titolare",       "descrizione": "Titolare dello studio dentistico"},
    {"nome": "dentista",       "descrizione": "Medico Dentista"},
    {"nome": "paziente",       "descrizione": "Paziente con accesso al portale"},
    {"nome": "igienista",      "descrizione": "Igienista Dentale"},
    {"nome": "aso",            "descrizione": "Assistente alla Poltrona Odontoiatrica (ASO)"},
    {"nome": "segretario",     "descrizione": "Segretario / Receptionist"},
    {"nome": "segreteria",     "descrizione": "Personale di segreteria (legacy)"},
    {"nome": "medico_estetico","descrizione": "Medico Estetico"},
    {"nome": "contabile",      "descrizione": "Contabile dello studio"},
    {"nome": "dir_sanitario",  "descrizione": "Direttore Sanitario"},
    {"nome": "clinic_manager", "descrizione": "Clinic Manager"},
    {"nome": "ortodontista",   "descrizione": "Ortodontista"},
    {"nome": "endodontista",   "descrizione": "Endodontista"},
    {"nome": "parodontologo",  "descrizione": "Parodontologo"},
    {"nome": "protesista",     "descrizione": "Protesista Dentale"},
    {"nome": "amministrativo", "descrizione": "Personale Amministrativo"},
    {"nome": "marketing",      "descrizione": "Responsabile Marketing"},
    {"nome": "it_support",     "descrizione": "Supporto IT"},
    {"nome": "addetto_pulizie","descrizione": "Addetto alle Pulizie"},
    {"nome": "laboratorista",  "descrizione": "Laboratorista Odontotecnico"},
]

# ── 30 utenti effettivamente attivi (allineati al DB di lavoro) ───────────────

UTENTI = [
    # Admin
    {"username": "admin",              "email": "admin@dentalmanager.it",          "password": "Admin123!",     "nome": "Admin",       "cognome": "Sistema",     "ruolo": "admin"},
    # Titolare
    {"username": "m.rizzo",            "email": "m.rizzo@dentalmanager.it",        "password": "Password123!",  "nome": "Matteo",      "cognome": "Rizzo",       "ruolo": "titolare"},
    # Dentisti
    {"username": "dott.bianchi",       "email": "bianchi@dentalmanager.it",        "password": "Password123!",  "nome": "Luca",        "cognome": "Bianchi",     "ruolo": "dentista"},
    {"username": "dott.ssa.moretti",   "email": "moretti@dentalmanager.it",        "password": "Password123!",  "nome": "Alessia",     "cognome": "Moretti",     "ruolo": "dentista"},
    # Pazienti con account portale
    {"username": "m.bianchi.paz",      "email": "m.bianchi@pazienti.it",          "password": "Password123!",  "nome": "Mario",       "cognome": "Bianchi",     "ruolo": "paziente"},
    {"username": "a.esposito",         "email": "a.esposito@pazienti.it",         "password": "Password123!",  "nome": "Anna",        "cognome": "Esposito",    "ruolo": "paziente"},
    {"username": "l.romano",           "email": "l.romano@pazienti.it",           "password": "Password123!",  "nome": "Luca",        "cognome": "Romano",      "ruolo": "paziente"},
    # Igienisti
    {"username": "f.mancini",          "email": "f.mancini@dentalmanager.it",     "password": "Password123!",  "nome": "Federica",    "cognome": "Mancini",     "ruolo": "igienista"},
    {"username": "a.russo.ig",         "email": "a.russo.ig@dentalmanager.it",    "password": "Password123!",  "nome": "Andrea",      "cognome": "Russo",       "ruolo": "igienista"},
    {"username": "c.ferrero",          "email": "c.ferrero@dentalmanager.it",     "password": "Password123!",  "nome": "Chiara",      "cognome": "Ferrero",     "ruolo": "igienista"},
    # Segreteria
    {"username": "segreteria",         "email": "segreteria@dentalmanager.it",    "password": "Segreteria123!","nome": "Laura",        "cognome": "Bianchi",     "ruolo": "segreteria"},
    {"username": "g.ricci",            "email": "g.ricci@dentalmanager.it",       "password": "Password123!",  "nome": "Giovanni",    "cognome": "Ricci",       "ruolo": "segretario"},
    # Medico Estetico
    {"username": "m.pellegrini",       "email": "m.pellegrini@dentalmanager.it",  "password": "Password123!",  "nome": "Massimo",     "cognome": "Pellegrini",  "ruolo": "medico_estetico"},
    {"username": "a.bruno",            "email": "a.bruno@dentalmanager.it",       "password": "Password123!",  "nome": "Alessia",     "cognome": "Bruno",       "ruolo": "medico_estetico"},
    {"username": "r.fontana",          "email": "r.fontana@dentalmanager.it",     "password": "Password123!",  "nome": "Roberto",     "cognome": "Fontana",     "ruolo": "medico_estetico"},
    # Contabile
    {"username": "c.marini",           "email": "c.marini@dentalmanager.it",      "password": "Password123!",  "nome": "Carlo",       "cognome": "Marini",      "ruolo": "contabile"},
    # Direttore Sanitario
    {"username": "a.moretti.dir",      "email": "a.moretti.dir@dentalmanager.it", "password": "Password123!",  "nome": "Alessandro",  "cognome": "Moretti",     "ruolo": "dir_sanitario"},
    # Clinic Manager
    {"username": "cl.ferrari",         "email": "cl.ferrari@dentalmanager.it",    "password": "Password123!",  "nome": "Claudia",     "cognome": "Ferrari",     "ruolo": "clinic_manager"},
    # Ortodontisti
    {"username": "l.caruso",           "email": "l.caruso@dentalmanager.it",      "password": "Password123!",  "nome": "Lorenzo",     "cognome": "Caruso",      "ruolo": "ortodontista"},
    {"username": "so.gentile",         "email": "so.gentile@dentalmanager.it",    "password": "Password123!",  "nome": "Sofia",       "cognome": "Gentile",     "ruolo": "ortodontista"},
    {"username": "d.coppola",          "email": "d.coppola@dentalmanager.it",     "password": "Password123!",  "nome": "Davide",      "cognome": "Coppola",     "ruolo": "ortodontista"},
    # Endodontisti
    {"username": "ri.serra",           "email": "ri.serra@dentalmanager.it",      "password": "Password123!",  "nome": "Riccardo",    "cognome": "Serra",       "ruolo": "endodontista"},
    {"username": "ma.vitali",          "email": "ma.vitali@dentalmanager.it",     "password": "Password123!",  "nome": "Martina",     "cognome": "Vitali",      "ruolo": "endodontista"},
    {"username": "an.fabbri",          "email": "an.fabbri@dentalmanager.it",     "password": "Password123!",  "nome": "Antonio",     "cognome": "Fabbri",      "ruolo": "endodontista"},
    # Parodontologi
    {"username": "fr.palumbo",         "email": "fr.palumbo@dentalmanager.it",    "password": "Password123!",  "nome": "Francesco",   "cognome": "Palumbo",     "ruolo": "parodontologo"},
    {"username": "be.orlando",         "email": "be.orlando@dentalmanager.it",    "password": "Password123!",  "nome": "Beatrice",    "cognome": "Orlando",     "ruolo": "parodontologo"},
    {"username": "em.longo",           "email": "em.longo@dentalmanager.it",      "password": "Password123!",  "nome": "Emanuele",    "cognome": "Longo",       "ruolo": "parodontologo"},
    # Protesista
    {"username": "cr.monti",           "email": "cr.monti@dentalmanager.it",      "password": "Password123!",  "nome": "Cristian",    "cognome": "Monti",       "ruolo": "protesista"},
    # Amministrativo
    {"username": "ro.amato",           "email": "ro.amato@dentalmanager.it",      "password": "Password123!",  "nome": "Roberta",     "cognome": "Amato",       "ruolo": "amministrativo"},
    # IT Support
    {"username": "fe.sartori",         "email": "fe.sartori@dentalmanager.it",    "password": "Password123!",  "nome": "Federico",    "cognome": "Sartori",     "ruolo": "it_support"},
]

# ── permessi per tipo di ruolo ────────────────────────────────────────────────

PERM_CLINICO_PIENO = {
    "pazienti.read": (True, False, False), "pazienti.write": (True, True, False),
    "appuntamenti.read": (True, False, False), "appuntamenti.write": (True, True, False),
    "appuntamenti.delete": (True, True, False),
    "preventivi.read": (True, False, False), "preventivi.write": (True, True, False),
    "ordini.read": (True, False, False), "pagamenti.read": (True, False, False),
    "articoli.read": (True, False, False), "utenti.read": (True, False, False),
}
PERM_CLINICO_BASE = {
    "pazienti.read": (True, False, False), "pazienti.write": (True, True, False),
    "appuntamenti.read": (True, False, False), "appuntamenti.write": (True, True, False),
    "preventivi.read": (True, False, False),
    "articoli.read": (True, False, False),
}
PERM_SEGRETERIA = {
    "pazienti.read": (True, False, False), "pazienti.write": (True, True, False),
    "appuntamenti.read": (True, False, False), "appuntamenti.write": (True, True, False),
    "appuntamenti.delete": (True, True, False),
    "preventivi.read": (True, False, False),
    "ordini.read": (True, False, False), "ordini.write": (True, True, False),
    "pagamenti.read": (True, False, False), "pagamenti.write": (True, True, False),
    "articoli.read": (True, False, False),
}
PERM_CONTABILE = {
    "pagamenti.read": (True, False, False), "pagamenti.write": (True, True, False),
    "ordini.read": (True, False, False), "preventivi.read": (True, False, False),
    "pazienti.read": (True, False, False),
}
PERM_MANAGER = {
    "utenti.read": (True, False, False),
    "pazienti.read": (True, False, False), "pazienti.write": (True, True, False),
    "appuntamenti.read": (True, False, False), "appuntamenti.write": (True, True, False),
    "appuntamenti.delete": (True, True, False),
    "preventivi.read": (True, False, False), "preventivi.write": (True, True, False),
    "ordini.read": (True, False, False), "ordini.write": (True, True, False),
    "pagamenti.read": (True, False, False), "pagamenti.write": (True, True, False),
    "articoli.read": (True, False, False), "articoli.write": (True, True, False),
    "log.read": (True, False, False),
}
PERM_PAZIENTE = {
    "appuntamenti.read": (True, False, False),
    "preventivi.read": (True, False, False),
    "pagamenti.read": (True, False, False),
}
PERM_SUPPORTO = {}

RUOLO_PERMESSI = {
    "titolare":       PERM_MANAGER,
    "dentista":       PERM_CLINICO_PIENO,
    "paziente":       PERM_PAZIENTE,
    "igienista":      PERM_CLINICO_BASE,
    "aso":            PERM_CLINICO_BASE,
    "segretario":     PERM_SEGRETERIA,
    "segreteria":     PERM_SEGRETERIA,
    "medico_estetico":PERM_CLINICO_PIENO,
    "contabile":      PERM_CONTABILE,
    "dir_sanitario":  PERM_MANAGER,
    "clinic_manager": PERM_MANAGER,
    "ortodontista":   PERM_CLINICO_PIENO,
    "endodontista":   PERM_CLINICO_PIENO,
    "parodontologo":  PERM_CLINICO_PIENO,
    "protesista":     PERM_CLINICO_BASE,
    "amministrativo": PERM_SEGRETERIA,
    "marketing":      {"pazienti.read": (True, False, False), "appuntamenti.read": (True, False, False)},
    "it_support":     PERM_SUPPORTO,
    "addetto_pulizie":PERM_SUPPORTO,
    "laboratorista":  {"pazienti.read": (True, False, False), "ordini.read": (True, False, False)},
}


# ── 35 pazienti (15 base + 20 nuovi) ──────────────────────────────────────────

PAZIENTI_BASE = [
    {"nome": "Mario",     "cognome": "Bianchi",   "codice_fiscale": "BNCMRA80A01F205Z", "data_nascita": date(1980, 1, 15),  "sesso": "M", "telefono": "3331112201", "email": "mario.bianchi@example.com"},
    {"nome": "Anna",      "cognome": "Esposito",  "codice_fiscale": "SPSNNA75T48F205X", "data_nascita": date(1975, 12, 8),  "sesso": "F", "telefono": "3331112202", "email": "anna.esposito@example.com"},
    {"nome": "Luca",      "cognome": "Romano",    "codice_fiscale": "RMNLCU90B14F205Y", "data_nascita": date(1990, 2, 14),  "sesso": "M", "telefono": "3331112203", "email": "luca.romano@example.com"},
    {"nome": "Giulia",    "cognome": "Marini",    "codice_fiscale": "MRNGLI92E55F205W", "data_nascita": date(1992, 5, 15),  "sesso": "F", "telefono": "3331112204", "email": "giulia.marini@example.com"},
    {"nome": "Francesco", "cognome": "Greco",     "codice_fiscale": "GRCFNC65L20F205V", "data_nascita": date(1965, 7, 20),  "sesso": "M", "telefono": "3331112205", "email": "francesco.greco@example.com"},
    {"nome": "Chiara",    "cognome": "Conti",     "codice_fiscale": "CNTCHR88P58F205U", "data_nascita": date(1988, 9, 18),  "sesso": "F", "telefono": "3331112206", "email": "chiara.conti@example.com"},
    {"nome": "Marco",     "cognome": "Costa",     "codice_fiscale": "CSTMRC78D03F205T", "data_nascita": date(1978, 4, 3),   "sesso": "M", "telefono": "3331112207", "email": "marco.costa@example.com"},
    {"nome": "Sara",      "cognome": "Ferrari",   "codice_fiscale": "FRRSRA95M61F205S", "data_nascita": date(1995, 8, 21),  "sesso": "F", "telefono": "3331112208", "email": "sara.ferrari@example.com"},
    {"nome": "Davide",    "cognome": "Russo",     "codice_fiscale": "RSSDVD85R10F205R", "data_nascita": date(1985, 10, 10), "sesso": "M", "telefono": "3331112209", "email": "davide.russo@example.com"},
    {"nome": "Elena",     "cognome": "Romano",    "codice_fiscale": "RMNLNE70S62F205Q", "data_nascita": date(1970, 11, 22), "sesso": "F", "telefono": "3331112210", "email": "elena.romano@example.com"},
    {"nome": "Paolo",     "cognome": "Galli",     "codice_fiscale": "GLLPLA82H05F205P", "data_nascita": date(1982, 6, 5),   "sesso": "M", "telefono": "3331112211", "email": "paolo.galli@example.com"},
    {"nome": "Francesca", "cognome": "Lombardi",  "codice_fiscale": "LMBFNC93T67F205N", "data_nascita": date(1993, 12, 27), "sesso": "F", "telefono": "3331112212", "email": "francesca.lombardi@example.com"},
    {"nome": "Andrea",    "cognome": "Moretti",   "codice_fiscale": "MRTNDR68B25F205M", "data_nascita": date(1968, 2, 25),  "sesso": "M", "telefono": "3331112213", "email": "andrea.moretti@example.com"},
    {"nome": "Valentina", "cognome": "Ricci",     "codice_fiscale": "RCCVNT87E45F205L", "data_nascita": date(1987, 5, 5),   "sesso": "F", "telefono": "3331112214", "email": "valentina.ricci@example.com"},
    {"nome": "Simone",    "cognome": "Barbieri",  "codice_fiscale": "BRBSMN76C18F205K", "data_nascita": date(1976, 3, 18),  "sesso": "M", "telefono": "3331112215", "email": "simone.barbieri@example.com"},
]

PAZIENTI_EXTRA = [
    {"nome": "Federico",  "cognome": "Bruno",     "codice_fiscale": "BRNFRC72L08F205A", "data_nascita": date(1972, 7, 8),   "sesso": "M", "telefono": "3331112216", "email": "federico.bruno@example.com"},
    {"nome": "Martina",   "cognome": "De Luca",   "codice_fiscale": "DLCMRT94H50F205B", "data_nascita": date(1994, 6, 10),  "sesso": "F", "telefono": "3331112217", "email": "martina.deluca@example.com"},
    {"nome": "Alessandro","cognome": "Galli",     "codice_fiscale": "GLLLSN59A12F205C", "data_nascita": date(1959, 1, 12),  "sesso": "M", "telefono": "3331112218", "email": "alessandro.galli@example.com"},
    {"nome": "Silvia",    "cognome": "Caruso",    "codice_fiscale": "CRSSLV83R66F205D", "data_nascita": date(1983, 10, 26), "sesso": "F", "telefono": "3331112219", "email": "silvia.caruso@example.com"},
    {"nome": "Tommaso",   "cognome": "Vitali",    "codice_fiscale": "VTLTMS01M07F205E", "data_nascita": date(2001, 8, 7),   "sesso": "M", "telefono": "3331112220", "email": "tommaso.vitali@example.com"},
    {"nome": "Gloria",    "cognome": "Sartori",   "codice_fiscale": "SRTGLR89T59F205F", "data_nascita": date(1989, 12, 19), "sesso": "F", "telefono": "3331112221", "email": "gloria.sartori@example.com"},
    {"nome": "Riccardo",  "cognome": "Esposito",  "codice_fiscale": "SPSRCR67P15F205G", "data_nascita": date(1967, 9, 15),  "sesso": "M", "telefono": "3331112222", "email": "riccardo.esposito@example.com"},
    {"nome": "Eleonora",  "cognome": "Marchetti", "codice_fiscale": "MRCLNR91D44F205H", "data_nascita": date(1991, 4, 4),   "sesso": "F", "telefono": "3331112223", "email": "eleonora.marchetti@example.com"},
    {"nome": "Stefano",   "cognome": "Pugliese",  "codice_fiscale": "PGLSFN54E22F205I", "data_nascita": date(1954, 5, 22),  "sesso": "M", "telefono": "3331112224", "email": "stefano.pugliese@example.com"},
    {"nome": "Camilla",   "cognome": "Fontana",   "codice_fiscale": "FNTCML97L52F205J", "data_nascita": date(1997, 7, 12),  "sesso": "F", "telefono": "3331112225", "email": "camilla.fontana@example.com"},
    {"nome": "Niccolò",   "cognome": "Orsini",    "codice_fiscale": "RSNNCL08C04F205K", "data_nascita": date(2008, 3, 4),   "sesso": "M", "telefono": "3331112226", "email": "niccolo.orsini@example.com"},
    {"nome": "Aurora",    "cognome": "Battaglia", "codice_fiscale": "BTTRRA13B49F205L", "data_nascita": date(2013, 2, 9),   "sesso": "F", "telefono": "3331112227", "email": "aurora.battaglia@example.com"},
    {"nome": "Giorgio",   "cognome": "Pellegrino","codice_fiscale": "PLLGRG48S30F205M", "data_nascita": date(1948, 11, 30), "sesso": "M", "telefono": "3331112228", "email": "giorgio.pellegrino@example.com"},
    {"nome": "Beatrice",  "cognome": "Costa",     "codice_fiscale": "CSTBRC86R57F205N", "data_nascita": date(1986, 10, 17), "sesso": "F", "telefono": "3331112229", "email": "beatrice.costa@example.com"},
    {"nome": "Alessio",   "cognome": "Russo",     "codice_fiscale": "RSSLSS79T11F205P", "data_nascita": date(1979, 12, 11), "sesso": "M", "telefono": "3331112230", "email": "alessio.russo@example.com"},
    {"nome": "Ilaria",    "cognome": "Ferri",     "codice_fiscale": "FRRLRI90E46F205Q", "data_nascita": date(1990, 5, 6),   "sesso": "F", "telefono": "3331112231", "email": "ilaria.ferri@example.com"},
    {"nome": "Matteo",    "cognome": "Greco",     "codice_fiscale": "GRCMTT63A29F205R", "data_nascita": date(1963, 1, 29),  "sesso": "M", "telefono": "3331112232", "email": "matteo.greco@example.com"},
    {"nome": "Noemi",     "cognome": "Conti",     "codice_fiscale": "CNTNMO04P51F205S", "data_nascita": date(2004, 9, 11),  "sesso": "F", "telefono": "3331112233", "email": "noemi.conti@example.com"},
    {"nome": "Pietro",    "cognome": "Lombardi",  "codice_fiscale": "LMBPTR71H17F205T", "data_nascita": date(1971, 6, 17),  "sesso": "M", "telefono": "3331112234", "email": "pietro.lombardi@example.com"},
    {"nome": "Marta",     "cognome": "Ricci",     "codice_fiscale": "RCCMRT99B51F205U", "data_nascita": date(1999, 2, 11),  "sesso": "F", "telefono": "3331112235", "email": "marta.ricci@example.com"},
]

# ── profili anamnestici (ognuno è un mix anamnesi + allergie + note) ──────────

PROFILI_ANAMNESTICI = [
    {"anamnesi": "Nessuna patologia rilevante.",                                              "allergie": None,                          "note": None},
    {"anamnesi": "Ipertensione arteriosa controllata con ramipril 5 mg/die.",                 "allergie": None,                          "note": None},
    {"anamnesi": "Diabete mellito tipo 2 in terapia con metformina.",                         "allergie": None,                          "note": "Glicemia a digiuno controllata."},
    {"anamnesi": "Cardiopatica, in terapia anticoagulante con warfarin.",                      "allergie": "Penicillina",                "note": "Verificare INR prima di interventi chirurgici."},
    {"anamnesi": "Nessuna patologia rilevante. Riferisce ansia da poltrona.",                 "allergie": "Lattice",                    "note": "Usare guanti senza lattice."},
    {"anamnesi": "Donna in gravidanza al secondo trimestre.",                                 "allergie": None,                          "note": "Evitare radiografie non urgenti."},
    {"anamnesi": "Asma allergico stagionale.",                                                "allergie": "Acari, polline di graminacee","note": None},
    {"anamnesi": "Pregresso intervento di by-pass coronarico (2018).",                         "allergie": "Aspirina",                   "note": "Profilassi antibiotica per interventi cruenti."},
    {"anamnesi": "Pregressa epatite B, HBsAg negativo.",                                      "allergie": None,                          "note": None},
    {"anamnesi": "Osteoporosi in terapia con bifosfonati orali.",                             "allergie": None,                          "note": "Rischio osteonecrosi mascellari, valutare attentamente le estrazioni."},
    {"anamnesi": "Reflusso gastroesofageo cronico.",                                          "allergie": None,                          "note": None},
    {"anamnesi": "Tabagista (circa 20 sigarette al giorno).",                                 "allergie": None,                          "note": None},
    {"anamnesi": "Bruxismo notturno, già usato bite di protezione.",                          "allergie": None,                          "note": None},
    {"anamnesi": "Pregressa parodontite, in mantenimento parodontale semestrale.",            "allergie": None,                          "note": None},
    {"anamnesi": "Ipotiroidismo subclinico in terapia con levotiroxina.",                     "allergie": "Iodio",                      "note": None},
    {"anamnesi": "Paziente pediatrico, dentatura mista in fase di eruzione.",                  "allergie": None,                          "note": "Approccio gentile e ludico."},
    {"anamnesi": "Allergia stagionale ad alimenti (frutta a guscio).",                        "allergie": "Frutta a guscio, kiwi",      "note": None},
    {"anamnesi": "Nessuna patologia rilevante. Pratica sport a livello agonistico.",           "allergie": None,                          "note": "Attenzione a possibili traumi sportivi."},
]

# ── catalogo diagnosi e trattamenti per i diari di visita ─────────────────────

DIAGNOSI_TIPI = [
    "Carie dentinale superficiale 1.6.",
    "Carie profonda con interessamento pulpare 3.6.",
    "Pulpite irreversibile 4.7.",
    "Tartaro sopragengivale settore antero-inferiore.",
    "Edentulia parziale settori posteriori inferiori.",
    "Fissurazione dello smalto 2.1 senza interessamento dentinale.",
    "Gengivite cronica generalizzata.",
    "Frattura coronale 1.1 senza esposizione pulpare.",
    "Granuloma apicale 2.6.",
    "Mobilità dentale grado 1 settore antero-inferiore.",
    "Recessione gengivale 4.1 con sensibilità.",
    "Ascesso parodontale 3.7.",
    "Pigmentazione superficiale (caffè, fumo).",
    "Diastemi multipli settore frontale superiore.",
    "Bruxismo con segni di abrasione occlusale.",
    "Quadro generale soddisfacente, nessuna lesione attiva.",
]

TRATTAMENTI_TIPI = [
    "Otturazione composita superficie occlusale.",
    "Devitalizzazione e ricostruzione coronale.",
    "Detartrasi sopra e sottogengivale, lucidatura.",
    "Sigillatura solchi denti molari permanenti.",
    "Estrazione semplice del terzo molare.",
    "Levigatura radicolare quadrante.",
    "Otturazione composita estesa multifaccia.",
    "Sostituzione otturazione vecchia.",
    "Sbiancamento professionale alla poltrona.",
    "Visita di controllo ed esame del cavo orale.",
    "Anestesia locale e rimozione corpo estraneo.",
    "Applicazione di gel desensibilizzante.",
    "Confezionamento di bite di protezione notturna.",
    "Istruzioni di igiene orale domiciliare.",
]

ESAMI_OBIETTIVI_TIPI = [
    "Mucose orali integre, lingua e pavimento orale nella norma.",
    "Linfonodi sottomandibolari non palpabili.",
    "Articolazione temporo-mandibolare libera, nessun click.",
    "Igiene orale buona, indice di placca contenuto.",
    "Igiene orale insufficiente, accumulo di placca su settore inferiore.",
    "Nessuna lesione delle mucose, gengiva di colorito roseo.",
    "Sondaggio parodontale entro la norma su tutti i sestanti.",
    "Sanguinamento al sondaggio in sestante 4.",
    "Tessuti molli regolari, attenzione a recessione classe I 4.1.",
]

ANAMNESI_AGGIORNAMENTI = [
    "Nessuna variazione rispetto alla scorsa visita.",
    "Riferisce sensibilità al freddo nel quadrante inferiore destro.",
    "Riferisce dolore spontaneo alla pressione su 3.6 da una settimana.",
    "Riferisce episodio di sanguinamento gengivale nei giorni scorsi.",
    "Riferisce occasionale serramento mascellare notturno.",
    "Riferisce miglioramento dell'igiene domiciliare dopo le ultime istruzioni.",
    "Riferisce variazione della terapia farmacologica per ipertensione (consultato medico curante).",
]

# ── distribuzione stati dei denti per popolare l'odontogramma ────────────────

PESI_STATO_DENTE = [
    (StatoDente.SANO,           40),
    (StatoDente.OTTURATO,       25),
    (StatoDente.CARIE,          12),
    (StatoDente.DEVITALIZZATO,   8),
    (StatoDente.PROTESI,         5),
    (StatoDente.IMPIANTO,        3),
    (StatoDente.ESTRATTO,        4),
    (StatoDente.MOBILE,          2),
    (StatoDente.FRATTURATO,      1),
]

DENTI_PERMANENTI = [
    11, 12, 13, 14, 15, 16, 17, 18,
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
]

# ── titoli e descrizioni dei piani di cura ────────────────────────────────────

TITOLI_PIANO_2025 = [
    ("Igiene professionale e controllo",          "Detartrasi e visita di controllo periodica"),
    ("Conservativa quadrante 1",                  "Risanamento conservativo settore superiore destro"),
    ("Conservativa quadrante 3",                  "Otturazioni multiple settore inferiore sinistro"),
    ("Devitalizzazione 3.6",                      "Pulpite irreversibile dente 3.6"),
    ("Estrazioni e bonifica",                     "Bonifica del cavo orale con estrazioni terzi molari"),
    ("Igiene professionale e sbiancamento",       "Detartrasi più sbiancamento estetico"),
    ("Trattamento parodontale",                   "Levigatura radicolare e mantenimento parodontale"),
    ("Conservativa multipla",                     "Carie multiple su più quadranti"),
    ("Visita di controllo periodica",             "Controllo semestrale"),
    ("Trattamento ortodontico iniziale",          "Valutazione e impronte per apparecchio mobile"),
]

TITOLI_PIANO_2026 = [
    ("Riabilitazione protesica",                  "Riabilitazione protesica fissa quadrante 1"),
    ("Implantologia 4.6",                         "Inserimento implantare in zona 4.6"),
    ("Cura conservativa 2026",                    "Otturazioni del piano annuale"),
    ("Igiene professionale 2026",                 "Mantenimento igiene professionale annuale"),
    ("Trattamento endodontico 2.6",               "Devitalizzazione e ricostruzione coronale"),
    ("Trattamento parodontale 2026",              "Mantenimento parodontale e levigature"),
    ("Conservativa estetica anteriore",           "Restauro estetico settore frontale superiore"),
    ("Sbiancamento professionale",                "Sbiancamento alla poltrona"),
    ("Estrazione dente del giudizio",             "Estrazione chirurgica terzo molare"),
    ("Visita e bonifica",                         "Visita di controllo e bonifica del cavo orale"),
]

# ── helper interni ────────────────────────────────────────────────────────────


def _scegli_pesato(coppie_valore_peso):
    """coppie_valore_peso: lista di (valore, peso). Ritorna un valore."""
    valori = [v for v, _ in coppie_valore_peso]
    pesi = [p for _, p in coppie_valore_peso]
    return random.choices(valori, weights=pesi, k=1)[0]


def _genera_numero(db, model, prefix, anno=None):
    if anno is None:
        anno = datetime.now().year
    n = db.query(model).filter(model.numero.like(f"{prefix}-{anno}-%")).count() + 1
    return f"{prefix}-{anno}-{n:04d}"


# ── slot picker (gestisce conflitti operatore/sala leggendo le impostazioni) ─


class SlotPicker:
    """
    Gestisce gli slot occupati per evitare conflitti operatore/sala
    durante la generazione di appuntamenti.

    Usa le ImpostazioniStudio per capire quali sono i giorni lavorativi,
    gli orari di apertura/chiusura e la pausa pranzo.
    """

    def __init__(self, db: Session):
        self.imp = db.query(ImpostazioniStudio).first()
        self.occupati_op = defaultdict(list)
        self.occupati_sala = defaultdict(list)

    @staticmethod
    def _parse_time(s: str, fallback_h: int, fallback_m: int) -> time:
        if not s:
            return time(fallback_h, fallback_m)
        try:
            h, m = s.split(':')
            return time(int(h), int(m))
        except (ValueError, AttributeError):
            return time(fallback_h, fallback_m)

    def is_giorno_lavorativo(self, d: date) -> bool:
        if not self.imp:
            return d.weekday() < 5
        # giorni_extra_aperti vincono su tutto
        if self.imp.giorni_extra_aperti and d.strftime('%Y-%m-%d') in self.imp.giorni_extra_aperti:
            return True
        # giorni_extra_chiusi: chiuso anche se sarebbe lavorativo
        if self.imp.giorni_extra_chiusi and d.strftime('%Y-%m-%d') in self.imp.giorni_extra_chiusi:
            return False
        # festività ricorrenti MM-DD
        if self.imp.festivita_disabilitate and d.strftime('%m-%d') in self.imp.festivita_disabilitate:
            return False
        # festività personalizzate
        if self.imp.festivita_personalizzate:
            for fp in self.imp.festivita_personalizzate:
                if isinstance(fp, dict) and fp.get('data') == d.strftime('%m-%d'):
                    return False
        # weekday in giorni_lavorativi (0=lun, 6=dom)
        giorni = self.imp.giorni_lavorativi or [0, 1, 2, 3, 4]
        return d.weekday() in giorni

    def _slots_inizio(self, d: date, durata_min: int):
        """Genera tutti gli slot di inizio possibili nella data, ogni 15 minuti, escludendo la pausa pranzo."""
        ap = self._parse_time(self.imp.ora_apertura if self.imp else None, 8, 0)
        ch = self._parse_time(self.imp.ora_chiusura if self.imp else None, 20, 0)
        pausa_attiva = bool(self.imp and self.imp.pausa_attiva)
        pi = self._parse_time(self.imp.ora_inizio_pausa if self.imp else None, 13, 0) if pausa_attiva else None
        pf = self._parse_time(self.imp.ora_fine_pausa if self.imp else None, 14, 0) if pausa_attiva else None

        # tz-aware in modo coerente con le colonne DateTime(timezone=True) del DB
        cur = datetime.combine(d, ap, tzinfo=timezone.utc)
        end_giorno = datetime.combine(d, ch, tzinfo=timezone.utc)
        delta = timedelta(minutes=durata_min)
        step = timedelta(minutes=15)
        slots = []
        while cur + delta <= end_giorno:
            if pi and pf:
                pi_dt = datetime.combine(d, pi, tzinfo=timezone.utc)
                pf_dt = datetime.combine(d, pf, tzinfo=timezone.utc)
                # se l'appuntamento attraversa la pausa, salta alla fine pausa
                if cur < pf_dt and (cur + delta) > pi_dt:
                    cur = pf_dt
                    continue
            slots.append(cur)
            cur += step
        return slots

    def trova_slot(self, d: date, op_id: int, sala: str, durata_min: int):
        """Cerca uno slot libero per (op, sala) nella data. Ritorna (start, end) o None."""
        if not self.is_giorno_lavorativo(d):
            return None
        slots = self._slots_inizio(d, durata_min)
        random.shuffle(slots)
        for start in slots[:30]:  # max 30 tentativi per non rallentare
            end = start + timedelta(minutes=durata_min)
            occupati_op = self.occupati_op[(d.isoformat(), op_id)]
            if any(s < end and e > start for (s, e) in occupati_op):
                continue
            occupati_sala = self.occupati_sala[(d.isoformat(), sala)]
            if any(s < end and e > start for (s, e) in occupati_sala):
                continue
            return start, end
        return None

    def occupa(self, start: datetime, end: datetime, op_id: int, sala: str):
        d = start.date().isoformat()
        self.occupati_op[(d, op_id)].append((start, end))
        self.occupati_sala[(d, sala)].append((start, end))


# ── seed di base ──────────────────────────────────────────────────────────────


def seed_ruoli(db: Session):
    for r in RUOLI:
        if not db.query(Ruolo).filter(Ruolo.nome == r["nome"]).first():
            db.add(Ruolo(**r))
    db.commit()
    print("✓ Ruoli creati")


def seed_funzioni(db: Session):
    funzioni = [
        {"nome": "utenti.read",        "modulo": "utenti",       "descrizione": "Visualizza utenti"},
        {"nome": "utenti.write",       "modulo": "utenti",       "descrizione": "Crea e modifica utenti"},
        {"nome": "utenti.delete",      "modulo": "utenti",       "descrizione": "Disattiva utenti"},
        {"nome": "pazienti.read",      "modulo": "pazienti",     "descrizione": "Visualizza pazienti"},
        {"nome": "pazienti.write",     "modulo": "pazienti",     "descrizione": "Crea e modifica pazienti"},
        {"nome": "pazienti.delete",    "modulo": "pazienti",     "descrizione": "Anonimizza pazienti"},
        {"nome": "appuntamenti.read",  "modulo": "appuntamenti", "descrizione": "Visualizza appuntamenti"},
        {"nome": "appuntamenti.write", "modulo": "appuntamenti", "descrizione": "Crea e modifica appuntamenti"},
        {"nome": "appuntamenti.delete","modulo": "appuntamenti", "descrizione": "Annulla appuntamenti"},
        {"nome": "preventivi.read",    "modulo": "preventivi",   "descrizione": "Visualizza preventivi"},
        {"nome": "preventivi.write",   "modulo": "preventivi",   "descrizione": "Crea e modifica preventivi"},
        {"nome": "ordini.read",        "modulo": "ordini",       "descrizione": "Visualizza ordini"},
        {"nome": "ordini.write",       "modulo": "ordini",       "descrizione": "Crea e gestisce ordini"},
        {"nome": "pagamenti.read",     "modulo": "pagamenti",    "descrizione": "Visualizza pagamenti"},
        {"nome": "pagamenti.write",    "modulo": "pagamenti",    "descrizione": "Registra pagamenti"},
        {"nome": "articoli.read",      "modulo": "articoli",     "descrizione": "Visualizza catalogo"},
        {"nome": "articoli.write",     "modulo": "articoli",     "descrizione": "Gestisce catalogo"},
        {"nome": "log.read",           "modulo": "log",          "descrizione": "Visualizza log di sistema"},
    ]
    for f in funzioni:
        if not db.query(Funzione).filter(Funzione.nome == f["nome"]).first():
            db.add(Funzione(**f))
    db.commit()
    print("✓ Funzioni create")


def _assegna_permessi(db: Session, ruolo: Ruolo, permessi: dict):
    for nome_funzione, (r, w, d) in permessi.items():
        funzione = db.query(Funzione).filter(Funzione.nome == nome_funzione).first()
        if not funzione:
            continue
        esistente = db.query(Privilegio).filter(
            Privilegio.ruolo_id == ruolo.id,
            Privilegio.funzione_id == funzione.id
        ).first()
        if not esistente:
            db.add(Privilegio(
                ruolo_id=ruolo.id, funzione_id=funzione.id,
                can_read=r, can_write=w, can_delete=d
            ))


def seed_privilegi(db: Session):
    admin = db.query(Ruolo).filter(Ruolo.nome == "admin").first()
    if admin:
        for funzione in db.query(Funzione).all():
            if not db.query(Privilegio).filter(
                Privilegio.ruolo_id == admin.id, Privilegio.funzione_id == funzione.id
            ).first():
                db.add(Privilegio(
                    ruolo_id=admin.id, funzione_id=funzione.id,
                    can_read=True, can_write=True, can_delete=True
                ))
    for nome_ruolo, permessi in RUOLO_PERMESSI.items():
        ruolo = db.query(Ruolo).filter(Ruolo.nome == nome_ruolo).first()
        if ruolo:
            _assegna_permessi(db, ruolo, permessi)
    db.commit()
    print("✓ Privilegi assegnati")


def seed_utenti(db: Session):
    for u in UTENTI:
        if db.query(Utente).filter(Utente.username == u["username"]).first():
            continue
        utente = Utente(
            username=u["username"],
            email_login=u["email"],
            hashed_password=get_password_hash(u["password"]),
            nome=u["nome"],
            cognome=u["cognome"],
            attivo=True,
            email_verificata=True,
            primo_accesso=False,
        )
        db.add(utente)
        db.flush()
        ruolo = db.query(Ruolo).filter(Ruolo.nome == u["ruolo"]).first()
        if ruolo:
            db.add(UtenteRuolo(utente_id=utente.id, ruolo_id=ruolo.id))
    db.commit()
    print(f"✓ Utenti creati ({len(UTENTI)} attivi)")
    print("  → admin / Admin123!")
    print("  → dott.bianchi / Password123!")
    print("  → segreteria / Segreteria123!")


def seed_articoli(db: Session):
    categorie = [
        {"nome": "Igiene e Prevenzione"}, {"nome": "Conservativa"},
        {"nome": "Endodonzia"}, {"nome": "Chirurgia Orale"},
        {"nome": "Protesi"}, {"nome": "Ortodonzia"}, {"nome": "Implantologia"},
    ]
    for c in categorie:
        if not db.query(CategoriaArticolo).filter(CategoriaArticolo.nome == c["nome"]).first():
            db.add(CategoriaArticolo(**c))
    db.flush()

    def cat(nome):
        return db.query(CategoriaArticolo).filter(CategoriaArticolo.nome == nome).first()

    articoli = [
        {"codice": "IGI-001", "nome": "Visita di controllo",              "tipo": "trattamento", "categoria_id": cat("Igiene e Prevenzione").id, "prezzo_base": 50.00,  "aliquota_iva": 22},
        {"codice": "IGI-002", "nome": "Igiene professionale (detartrasi)","tipo": "trattamento", "categoria_id": cat("Igiene e Prevenzione").id, "prezzo_base": 80.00,  "aliquota_iva": 22},
        {"codice": "IGI-003", "nome": "Sbiancamento professionale",       "tipo": "trattamento", "categoria_id": cat("Igiene e Prevenzione").id, "prezzo_base": 250.00, "aliquota_iva": 22},
        {"codice": "IGI-004", "nome": "Sigillatura solchi",               "tipo": "trattamento", "categoria_id": cat("Igiene e Prevenzione").id, "prezzo_base": 40.00,  "aliquota_iva": 22},
        {"codice": "CON-001", "nome": "Otturazione composita (1 sup.)",   "tipo": "trattamento", "categoria_id": cat("Conservativa").id,         "prezzo_base": 100.00, "aliquota_iva": 22},
        {"codice": "CON-002", "nome": "Otturazione composita (2 sup.)",   "tipo": "trattamento", "categoria_id": cat("Conservativa").id,         "prezzo_base": 130.00, "aliquota_iva": 22},
        {"codice": "CON-003", "nome": "Otturazione composita (3 sup.)",   "tipo": "trattamento", "categoria_id": cat("Conservativa").id,         "prezzo_base": 160.00, "aliquota_iva": 22},
        {"codice": "END-001", "nome": "Devitalizzazione monoradicolare",  "tipo": "trattamento", "categoria_id": cat("Endodonzia").id,            "prezzo_base": 280.00, "aliquota_iva": 22},
        {"codice": "END-002", "nome": "Devitalizzazione pluriradicolare", "tipo": "trattamento", "categoria_id": cat("Endodonzia").id,            "prezzo_base": 380.00, "aliquota_iva": 22},
        {"codice": "CHI-001", "nome": "Estrazione semplice",              "tipo": "trattamento", "categoria_id": cat("Chirurgia Orale").id,       "prezzo_base": 80.00,  "aliquota_iva": 22},
        {"codice": "CHI-002", "nome": "Estrazione chirurgica",            "tipo": "trattamento", "categoria_id": cat("Chirurgia Orale").id,       "prezzo_base": 180.00, "aliquota_iva": 22},
        {"codice": "CHI-003", "nome": "Estrazione dente del giudizio",    "tipo": "trattamento", "categoria_id": cat("Chirurgia Orale").id,       "prezzo_base": 250.00, "aliquota_iva": 22},
    ]
    for a in articoli:
        if not db.query(Articolo).filter(Articolo.codice == a["codice"]).first():
            db.add(Articolo(**a))
    db.commit()
    print("✓ Catalogo trattamenti creato")


def seed_stanze(db: Session):
    stanze = [
        {"nome": "Stanza 1", "descrizione": "Stanza operativa principale", "colore": "#dbeafe"},  # blu chiaro
        {"nome": "Stanza 2", "descrizione": "Seconda stanza operativa",     "colore": "#dcfce7"},  # verde chiaro
        {"nome": "Stanza 3", "descrizione": "Terza stanza per visite e igiene", "colore": "#fef3c7"},  # giallo chiaro
        {"nome": "Stanza 4", "descrizione": "Quarta stanza, polifunzionale",  "colore": "#fae8ff"},  # viola chiaro
    ]
    for s in stanze:
        if not db.query(Stanza).filter(Stanza.nome == s["nome"]).first():
            db.add(Stanza(**s, attiva=True))
    db.commit()
    print("✓ Stanze create")


def seed_impostazioni(db: Session):
    if not db.query(ImpostazioniStudio).first():
        db.add(ImpostazioniStudio(
            ora_apertura="09:00",
            ora_chiusura="20:00",
            giorni_lavorativi=[0, 1, 2, 3, 4],  # lun-ven (chiuso sab e dom)
            # Lista vuota = nessuna festività e' "disabilitata come chiusura":
            # tutte le festivita' italiane (incluse Pasqua e Pasquetta calcolate
            # dinamicamente dal frontend) e il santo patrono restano giorni di
            # chiusura.
            festivita_disabilitate=[],
            nome_studio="Studio Dentistico Demo",
            indirizzo="Via Roma 1, 20100 Milano",
            telefono="02 1234567",
            email="info@studio-demo.it",
            partita_iva="01234567890",
            pausa_attiva=True,
            ora_inizio_pausa="12:00",
            ora_fine_pausa="14:00",
            patrono_data="05-06",
            patrono_nome="Santo Test",
            promemoria_abilitato=True,
            promemoria_ore_prima=24,
            promemoria_email=True,
            promemoria_sms=False,
        ))
        db.commit()
        print("✓ Impostazioni studio create")


# ── seed pazienti ─────────────────────────────────────────────────────────────


def seed_pazienti(db: Session):
    """35 pazienti totali (15 base + 20 nuovi). Idempotente."""
    n_attuali = db.query(Paziente).count()
    if n_attuali >= 35:
        return

    # collega 3 pazienti agli account utente
    utenti_pazienti = {
        "BNCMRA80A01F205Z": "m.bianchi.paz",
        "SPSNNA75T48F205X": "a.esposito",
        "RMNLCU90B14F205Y": "l.romano",
    }

    tutti = PAZIENTI_BASE + PAZIENTI_EXTRA
    n_creati = 0
    for i, p in enumerate(tutti):
        if db.query(Paziente).filter(Paziente.codice_fiscale == p["codice_fiscale"]).first():
            continue
        profilo = PROFILI_ANAMNESTICI[i % len(PROFILI_ANAMNESTICI)]
        utente_id = None
        if p["codice_fiscale"] in utenti_pazienti:
            utente = db.query(Utente).filter(Utente.username == utenti_pazienti[p["codice_fiscale"]]).first()
            if utente:
                utente_id = utente.id

        db.add(Paziente(
            **p,
            utente_id=utente_id,
            anamnesi=profilo["anamnesi"],
            allergie=profilo["allergie"],
            note=profilo["note"],
            citta="Milano",
            provincia="MI",
            consenso_trattamento=True,
            consenso_privacy=True,
            consenso_marketing=(random.random() < 0.4),
            data_consenso=datetime.now(timezone.utc),
            attivo=True,
        ))
        n_creati += 1
    db.commit()
    print(f"✓ Pazienti: {n_creati} creati ({len(tutti)} totali in catalogo)")


# ── seed odontogrammi ─────────────────────────────────────────────────────────


def seed_odontogrammi(db: Session):
    """Per ogni paziente, popola da 5 a 15 denti permanenti con stati realistici."""
    if db.query(DenteStato).count() > 0:
        return

    pazienti = db.query(Paziente).order_by(Paziente.id).all()
    admin = db.query(Utente).filter(Utente.username == "admin").first()
    aggiornato_da = admin.id if admin else None

    n_record = 0
    for p in pazienti:
        n_denti = random.randint(5, 15)
        denti = random.sample(DENTI_PERMANENTI, n_denti)
        for codice in denti:
            stato = _scegli_pesato(PESI_STATO_DENTE)
            db.add(DenteStato(
                paziente_id=p.id,
                dente_codice=str(codice),
                stato=stato,
                aggiornato_da=aggiornato_da,
            ))
            n_record += 1
    db.commit()
    print(f"✓ Odontogrammi: {n_record} stati di dente popolati su {len(pazienti)} pazienti")


# ── seed dati realistici (piani, appuntamenti, ordini, pagamenti, ricevute) ───


def _seleziona_voci_preventivo(piano_titolo: str, anno: int):
    """Sceglie 2-4 voci dal catalogo coerenti con il titolo del piano."""
    voci = []
    titolo_low = piano_titolo.lower()
    if "igiene" in titolo_low or "controllo" in titolo_low:
        voci.append(("Igiene professionale (detartrasi)", 80, 1, "IGI-002"))
        voci.append(("Visita di controllo", 50, 1, "IGI-001"))
    elif "sbiancamento" in titolo_low:
        voci.append(("Sbiancamento professionale", 250, 1, "IGI-003"))
        voci.append(("Igiene professionale (detartrasi)", 80, 1, "IGI-002"))
    elif "conservativa" in titolo_low:
        n = random.randint(2, 4)
        for _ in range(n):
            cod = random.choice(["CON-001", "CON-002", "CON-003"])
            prezzo = {"CON-001": 100, "CON-002": 130, "CON-003": 160}[cod]
            descr = {"CON-001": "Otturazione composita (1 sup.)",
                     "CON-002": "Otturazione composita (2 sup.)",
                     "CON-003": "Otturazione composita (3 sup.)"}[cod]
            voci.append((descr, prezzo, 1, cod))
    elif "devitalizz" in titolo_low or "endo" in titolo_low:
        voci.append(("Devitalizzazione pluriradicolare", 380, 1, "END-002"))
        voci.append(("Otturazione composita (2 sup.)", 130, 1, "CON-002"))
    elif "estrazion" in titolo_low or "bonifica" in titolo_low or "giudizio" in titolo_low:
        voci.append(("Estrazione dente del giudizio", 250, 1, "CHI-003"))
        if random.random() < 0.5:
            voci.append(("Estrazione semplice", 80, 1, "CHI-001"))
    elif "implant" in titolo_low or "protes" in titolo_low or "riabilita" in titolo_low:
        voci.append(("Estrazione chirurgica", 180, 1, "CHI-002"))
        voci.append(("Devitalizzazione pluriradicolare", 380, 1, "END-002"))
        voci.append(("Otturazione composita (3 sup.)", 160, 1, "CON-003"))
    elif "parodonta" in titolo_low:
        voci.append(("Igiene professionale (detartrasi)", 80, 2, "IGI-002"))
    elif "ortodont" in titolo_low:
        voci.append(("Visita di controllo", 50, 2, "IGI-001"))
    else:
        voci.append(("Visita di controllo", 50, 1, "IGI-001"))
    return voci


def _crea_preventivo_con_voci(db, piano, dentista_id, voci_data, stato, descrizione, creato_da, anno):
    prev = Preventivo(
        piano_cura_id=piano.id,
        paziente_id=piano.paziente_id,
        dentista_id=dentista_id,
        creato_da=creato_da,
        numero=_genera_numero(db, Preventivo, "PREV", anno),
        versione=1,
        attivo=True,
        stato=stato,
        descrizione=descrizione,
        data_emissione=piano.data_apertura or datetime.now(timezone.utc),
        data_scadenza=(piano.data_apertura or datetime.now(timezone.utc)) + timedelta(days=60),
        consenso_firmato=(stato == StatoPreventivo.ACCETTATO),
        data_firma_consenso=(piano.data_apertura + timedelta(days=2)) if stato == StatoPreventivo.ACCETTATO and piano.data_apertura else None,
    )
    db.add(prev)
    db.flush()
    totale_imp = Decimal("0")
    totale_iva = Decimal("0")
    for i, (descr, prezzo, qta, cod) in enumerate(voci_data):
        articolo = db.query(Articolo).filter(Articolo.codice == cod).first()
        prezzo_d = Decimal(str(prezzo))
        q_d = Decimal(str(qta))
        iva_d = Decimal("22")
        imp = prezzo_d * q_d
        iv = imp * iva_d / Decimal("100")
        db.add(PreventivoVoce(
            preventivo_id=prev.id,
            articolo_id=articolo.id if articolo else None,
            descrizione=descr,
            quantita=q_d,
            prezzo_unitario=prezzo_d,
            aliquota_iva=iva_d,
            sconto_percentuale=Decimal("0"),
            totale_voce=imp + iv,
            ordine=i,
        ))
        totale_imp += imp
        totale_iva += iv
    prev.totale_imponibile = totale_imp
    prev.totale_iva = totale_iva
    prev.totale = totale_imp + totale_iva
    return prev, voci_data


def _scegli_operatore_per_tipo(tipo_app: TipoAppuntamento, dentisti, igienisti):
    if tipo_app == TipoAppuntamento.IGIENE and igienisti:
        return random.choice(igienisti)
    return random.choice(dentisti)


def _scegli_sala(tipo_app: TipoAppuntamento, sale_disponibili):
    """Sceglie una sala random dall'elenco disponibile."""
    return random.choice(sale_disponibili)


def _durata_per_tipo(tipo_app: TipoAppuntamento) -> int:
    return {
        TipoAppuntamento.PRIMA_VISITA: 60,
        TipoAppuntamento.VISITA: 45,
        TipoAppuntamento.IGIENE: 45,
        TipoAppuntamento.INTERVENTO: 90,
        TipoAppuntamento.URGENZA: 60,
        TipoAppuntamento.CONTROLLO: 30,
    }.get(tipo_app, 45)


def _stato_appuntamento_per_data(data_inizio: datetime, oggi: datetime) -> StatoAppuntamento:
    if data_inizio.date() < oggi.date():
        # passato: 85% completato, resto distribuito
        return _scegli_pesato([
            (StatoAppuntamento.COMPLETATO,     85),
            (StatoAppuntamento.ANNULLATO,       6),
            (StatoAppuntamento.NON_PRESENTATO,  5),
            (StatoAppuntamento.RINVIATO,        4),
        ])
    if data_inizio.date() == oggi.date():
        return _scegli_pesato([
            (StatoAppuntamento.COMPLETATO, 50),
            (StatoAppuntamento.IN_CORSO,   20),
            (StatoAppuntamento.PRENOTATO,  30),
        ])
    return StatoAppuntamento.PRENOTATO


def _crea_appuntamento(db, piano, paziente_id, dentista_id, sala, data_inizio, durata_min, tipo, stato, creato_da):
    """Crea un appuntamento e ritorna l'oggetto. Popola i campi clinici se completato."""
    app = Appuntamento(
        piano_cura_id=piano.id,
        paziente_id=paziente_id,
        dentista_id=dentista_id,
        creato_da=creato_da,
        data_ora_inizio=data_inizio,
        data_ora_fine=data_inizio + timedelta(minutes=durata_min),
        sala=sala,
        tipo=tipo,
        stato=stato,
    )
    if stato == StatoAppuntamento.COMPLETATO:
        app.anamnesi_aggiornamento = random.choice(ANAMNESI_AGGIORNAMENTI)
        app.esame_obiettivo = random.choice(ESAMI_OBIETTIVI_TIPI)
        app.diagnosi = random.choice(DIAGNOSI_TIPI)
        app.trattamenti_eseguiti = random.choice(TRATTAMENTI_TIPI)
        if random.random() < 0.3:
            mesi_avanti = random.randint(3, 9)
            app.prossimo_controllo_data = (data_inizio + timedelta(days=30 * mesi_avanti)).date()
            app.prossimo_controllo_note = "Controllo periodico programmato."
    db.add(app)
    db.flush()
    return app


def _crea_ordine_da_appuntamenti(db, piano, app_completati, voci_preventivo, creato_da, anno):
    """Crea l'ordine cumulativo, aggiunge le voci dei trattamenti eseguiti, ricalcola totali."""
    ordine = Ordine(
        piano_cura_id=piano.id,
        paziente_id=piano.paziente_id,
        creato_da=creato_da,
        numero=_genera_numero(db, Ordine, "ORD", anno),
        stato=StatoOrdine.BOZZA,
        totale_imponibile=Decimal("0"),
        totale_iva=Decimal("0"),
        totale=Decimal("0"),
        totale_pagato=Decimal("0"),
        totale_residuo=Decimal("0"),
    )
    db.add(ordine)
    db.flush()
    # Distribuisce le voci del preventivo fra gli appuntamenti completati
    if not app_completati or not voci_preventivo:
        return ordine
    voci_per_app = max(1, len(voci_preventivo) // max(1, len(app_completati)))
    voci_iter = iter(voci_preventivo)
    for i, app in enumerate(app_completati):
        for _ in range(voci_per_app):
            try:
                descr, prezzo, qta, cod = next(voci_iter)
            except StopIteration:
                break
            articolo = db.query(Articolo).filter(Articolo.codice == cod).first()
            prezzo_d = Decimal(str(prezzo))
            q_d = Decimal(str(qta))
            iva_d = Decimal("22")
            imp = prezzo_d * q_d
            iv = imp * iva_d / Decimal("100")
            db.add(OrdineVoce(
                ordine_id=ordine.id,
                articolo_id=articolo.id if articolo else None,
                descrizione=descr,
                quantita=q_d,
                prezzo_unitario=prezzo_d,
                aliquota_iva=iva_d,
                totale_voce=imp + iv,
                ordine_visualizzazione=i,
            ))
    db.flush()
    db.refresh(ordine)
    totale_imp = Decimal("0")
    totale_iva = Decimal("0")
    for v in ordine.voci:
        imp = Decimal(str(v.prezzo_unitario)) * Decimal(str(v.quantita))
        iv = imp * Decimal(str(v.aliquota_iva)) / Decimal("100")
        totale_imp += imp
        totale_iva += iv
    ordine.totale_imponibile = totale_imp
    ordine.totale_iva = totale_iva
    ordine.totale = totale_imp + totale_iva
    ordine.totale_residuo = ordine.totale
    return ordine


def _registra_pagamenti_e_ricevuta(db, ordine, paziente_id, creato_da, data_riferimento, anno, completo=True):
    """Registra uno o piu' pagamenti per l'ordine. Se completo, salda interamente ed emette ricevuta."""
    if ordine.totale <= 0:
        return
    metodi = [MetodoPagamento.CONTANTI, MetodoPagamento.CARTA_CREDITO, MetodoPagamento.CARTA_DEBITO, MetodoPagamento.BONIFICO]
    pesi = [25, 35, 25, 15]
    importo_totale = Decimal(str(ordine.totale))

    if completo:
        # ~70% pagamento singolo, ~30% acconto + saldo
        if importo_totale > Decimal("800") and random.random() < 0.4:
            # rateale: acconto distante dal saldo per riflettere la durata del piano
            acconto = (importo_totale * Decimal("0.4")).quantize(Decimal("0.01"))
            saldo = importo_totale - acconto
            data_acconto = data_riferimento - timedelta(days=random.randint(45, 90))
            data_saldo = data_riferimento
            pag_acconto = Pagamento(
                ordine_id=ordine.id, paziente_id=paziente_id, registrato_da=creato_da,
                importo=acconto, metodo=random.choices(metodi, weights=pesi)[0],
                stato=StatoPagamento.COMPLETATO, data_pagamento=data_acconto,
                note="Acconto",
            )
            pag_saldo = Pagamento(
                ordine_id=ordine.id, paziente_id=paziente_id, registrato_da=creato_da,
                importo=saldo, metodo=random.choices(metodi, weights=pesi)[0],
                stato=StatoPagamento.COMPLETATO, data_pagamento=data_saldo,
                note="Saldo",
            )
            db.add_all([pag_acconto, pag_saldo])
            db.flush()
            ricevuta_pagamento = pag_saldo
        else:
            pag = Pagamento(
                ordine_id=ordine.id, paziente_id=paziente_id, registrato_da=creato_da,
                importo=importo_totale, metodo=random.choices(metodi, weights=pesi)[0],
                stato=StatoPagamento.COMPLETATO, data_pagamento=data_riferimento,
            )
            db.add(pag)
            db.flush()
            ricevuta_pagamento = pag

        ordine.totale_pagato = importo_totale
        ordine.totale_residuo = Decimal("0")
        ordine.stato = StatoOrdine.FATTURATO

        # ricevuta sanitaria (90% ricevuta, 10% fattura)
        tipo_doc = TipoDocumentoFiscale.RICEVUTA if random.random() < 0.9 else TipoDocumentoFiscale.FATTURA
        prefisso = "RIC" if tipo_doc == TipoDocumentoFiscale.RICEVUTA else "FAT"
        doc = DocumentoFiscale(
            ordine_id=ordine.id, paziente_id=paziente_id,
            pagamento_id=ricevuta_pagamento.id if tipo_doc == TipoDocumentoFiscale.RICEVUTA else None,
            tipo=tipo_doc,
            numero=_genera_numero(db, DocumentoFiscale, prefisso, anno),
            data_emissione=data_riferimento,
            totale_imponibile=ordine.totale_imponibile,
            totale_iva=ordine.totale_iva,
            totale=importo_totale,
        )
        db.add(doc)
        db.flush()
        # voci copiate dall'ordine
        for i, v in enumerate(ordine.voci):
            db.add(DocumentoFiscaleVoce(
                documento_fiscale_id=doc.id,
                ordine_voce_id=v.id,
                descrizione=v.descrizione,
                quantita=v.quantita,
                prezzo_unitario=v.prezzo_unitario,
                aliquota_iva=v.aliquota_iva,
                totale_voce=v.totale_voce,
                ordine_visualizzazione=i,
            ))
    else:
        # pagamento parziale (acconto già versato, saldo aperto)
        if importo_totale > Decimal("400"):
            acconto = (importo_totale * Decimal("0.3")).quantize(Decimal("0.01"))
            data_acconto = data_riferimento - timedelta(days=random.randint(7, 21))
            db.add(Pagamento(
                ordine_id=ordine.id, paziente_id=paziente_id, registrato_da=creato_da,
                importo=acconto, metodo=random.choices(metodi, weights=pesi)[0],
                stato=StatoPagamento.COMPLETATO, data_pagamento=data_acconto,
                note="Acconto pre-trattamento",
            ))
            ordine.totale_pagato = acconto
            ordine.totale_residuo = importo_totale - acconto
            ordine.stato = StatoOrdine.CONFERMATO


def seed_dati_realistici(db: Session):
    """
    Per ogni paziente:
    - 1 piano di cura 2025 (set-dic), maggior parte completati con fatturazione
    - 1 piano di cura 2026 (gen-lug), distribuzione realistica con apr-mag ad alta densità

    Idempotente: se i piani 2026 esistono già, non rifa nulla.
    """
    if db.query(PianoCura).filter(PianoCura.numero.like("PC-2026-%")).count() > 0:
        return

    pazienti = db.query(Paziente).order_by(Paziente.id).all()
    if not pazienti:
        return

    dentisti = db.query(Utente).filter(Utente.username.in_(["dott.bianchi", "dott.ssa.moretti"])).all()
    igienisti = db.query(Utente).filter(Utente.username.in_(["f.mancini", "c.ferrero", "a.russo.ig"])).all()
    if not dentisti:
        print("⚠ Skip seed_dati_realistici: nessun dentista trovato")
        return

    admin = db.query(Utente).filter(Utente.username == "admin").first()
    creato_da = admin.id if admin else None

    stanze = db.query(Stanza).filter(Stanza.attiva == True).all()
    if not stanze:
        print("⚠ Skip seed_dati_realistici: nessuna stanza attiva")
        return
    sale_disponibili = [s.nome for s in stanze]

    picker = SlotPicker(db)
    oggi = datetime.now(timezone.utc)

    # ── piani 2025 (settembre - dicembre) ────────────────────────────────
    n_piani_2025 = 0
    n_app_2025 = 0
    for p in pazienti:
        # data di apertura tra 1 set 2025 e 30 set 2025
        data_apertura = datetime(2025, 9, random.randint(1, 30), 9, 0, tzinfo=timezone.utc)
        titolo, descrizione = random.choice(TITOLI_PIANO_2025)
        # stato finale: maggior parte completati
        stato_finale = _scegli_pesato([
            (StatoPianoCura.COMPLETATO,   75),
            (StatoPianoCura.SOSPESO,       8),
            (StatoPianoCura.ABBANDONATO,   7),
            (StatoPianoCura.IN_CORSO,     10),
        ])
        dentista_ref = random.choice(dentisti)
        piano = PianoCura(
            paziente_id=p.id,
            dentista_referente_id=dentista_ref.id,
            creato_da=creato_da,
            numero=_genera_numero(db, PianoCura, "PC", 2025),
            titolo=titolo,
            diagnosi=random.choice(DIAGNOSI_TIPI),
            obiettivo=descrizione,
            stato=stato_finale,
            data_apertura=data_apertura,
            # data_chiusura provvisoria, viene aggiornata dopo la creazione
            # degli appuntamenti per riflettere la fine effettiva del percorso
            data_chiusura=None,
        )
        db.add(piano)
        db.flush()

        # preventivo
        voci = _seleziona_voci_preventivo(titolo, 2025)
        stato_prev = StatoPreventivo.ACCETTATO if stato_finale != StatoPianoCura.ABBANDONATO else StatoPreventivo.RIFIUTATO
        prev, voci_data = _crea_preventivo_con_voci(db, piano, dentista_ref.id, voci, stato_prev, descrizione, creato_da, 2025)

        # appuntamenti: 2-4 nel periodo set-dic 2025
        n_app = random.randint(2, 4) if stato_finale != StatoPianoCura.ABBANDONATO else random.randint(0, 1)
        app_completati = []
        # sceglie date all'interno del range set-dic 2025
        for _ in range(n_app):
            for _try in range(15):
                gg = random.randint(0, (date(2025, 12, 31) - date(2025, 9, 1)).days)
                d_target = date(2025, 9, 1) + timedelta(days=gg)
                if d_target > oggi.date():
                    continue  # 2025 dovrebbe essere tutto passato
                # tipo coerente con titolo
                tipo = TipoAppuntamento.IGIENE if "igiene" in titolo.lower() else random.choice([
                    TipoAppuntamento.VISITA, TipoAppuntamento.INTERVENTO, TipoAppuntamento.CONTROLLO,
                ])
                operatore = _scegli_operatore_per_tipo(tipo, dentisti, igienisti)
                sala = _scegli_sala(tipo, sale_disponibili)
                durata = _durata_per_tipo(tipo)
                slot = picker.trova_slot(d_target, operatore.id, sala, durata)
                if not slot:
                    continue
                start, end = slot
                stato_app = _stato_appuntamento_per_data(start, oggi)
                # per piani completati, forza completato salvo eccezione random
                if stato_finale == StatoPianoCura.COMPLETATO and random.random() < 0.9:
                    stato_app = StatoAppuntamento.COMPLETATO
                app = _crea_appuntamento(db, piano, p.id, operatore.id, sala, start, durata, tipo, stato_app, creato_da)
                picker.occupa(start, end, operatore.id, sala)
                if stato_app == StatoAppuntamento.COMPLETATO:
                    app_completati.append(app)
                n_app_2025 += 1
                break

        # data_chiusura realistica: poco dopo l'ultimo appuntamento completato
        if stato_finale in (StatoPianoCura.COMPLETATO, StatoPianoCura.ABBANDONATO):
            if app_completati:
                ultimo = max(a.data_ora_fine for a in app_completati)
                piano.data_chiusura = ultimo + timedelta(days=random.randint(1, 14))
            else:
                piano.data_chiusura = datetime(2025, 12, random.randint(1, 28), 18, 0, tzinfo=timezone.utc)

        # ordine + pagamenti + ricevuta
        if app_completati:
            ordine = _crea_ordine_da_appuntamenti(db, piano, app_completati, voci_data, creato_da, 2025)
            primo_app = min(a.data_ora_inizio for a in app_completati)
            if stato_finale == StatoPianoCura.COMPLETATO:
                data_pag = piano.data_chiusura or datetime(2025, 12, 20, 18, 0, tzinfo=timezone.utc)
                _registra_pagamenti_e_ricevuta(db, ordine, p.id, creato_da, data_pag, 2025, completo=True)
            elif stato_finale == StatoPianoCura.IN_CORSO:
                # acconto registrato all'inizio del percorso
                data_acconto = primo_app + timedelta(days=random.randint(0, 5))
                _registra_pagamenti_e_ricevuta(db, ordine, p.id, creato_da, data_acconto, 2025, completo=False)

        n_piani_2025 += 1
    db.commit()
    print(f"✓ Piani 2025: {n_piani_2025} creati con {n_app_2025} appuntamenti")

    # ── piani 2026 (gen - lug) con distribuzione mese-per-mese ──────────────
    # Strategy: per ogni paziente generiamo da 4 a 12 appuntamenti distribuiti
    # tra gen-lug 2026, con piu' peso su apr-mag.
    n_piani_2026 = 0
    n_app_2026 = 0

    # pesi per mese (apr-mag piu' densi)
    pesi_mesi = {1: 8, 2: 8, 3: 8, 4: 18, 5: 18, 6: 8, 7: 8}

    for p in pazienti:
        data_apertura = datetime(2026, 1, random.randint(1, 28), 9, 0, tzinfo=timezone.utc)
        titolo, descrizione = random.choice(TITOLI_PIANO_2026)
        # piani 2026 in vari stati a seconda del momento corrente
        if oggi < datetime(2026, 4, 1, tzinfo=timezone.utc):
            stato_2026 = _scegli_pesato([
                (StatoPianoCura.PROPOSTO, 20),
                (StatoPianoCura.ACCETTATO, 30),
                (StatoPianoCura.IN_CORSO, 50),
            ])
        else:
            stato_2026 = _scegli_pesato([
                (StatoPianoCura.IN_CORSO, 60),
                (StatoPianoCura.ACCETTATO, 25),
                (StatoPianoCura.COMPLETATO, 10),
                (StatoPianoCura.SOSPESO, 5),
            ])
        dentista_ref = random.choice(dentisti)
        piano = PianoCura(
            paziente_id=p.id,
            dentista_referente_id=dentista_ref.id,
            creato_da=creato_da,
            numero=_genera_numero(db, PianoCura, "PC", 2026),
            titolo=titolo,
            diagnosi=random.choice(DIAGNOSI_TIPI),
            obiettivo=descrizione,
            stato=stato_2026,
            data_apertura=data_apertura,
        )
        db.add(piano)
        db.flush()

        voci = _seleziona_voci_preventivo(titolo, 2026)
        stato_prev = StatoPreventivo.ACCETTATO if stato_2026 != StatoPianoCura.PROPOSTO else StatoPreventivo.INVIATO
        prev, voci_data = _crea_preventivo_con_voci(db, piano, dentista_ref.id, voci, stato_prev, descrizione, creato_da, 2026)

        n_app = random.randint(4, 12)
        app_completati = []
        for _ in range(n_app):
            mese = random.choices(list(pesi_mesi.keys()), weights=list(pesi_mesi.values()))[0]
            for _try in range(15):
                # giorno random nel mese
                if mese in (1, 3, 5, 7):
                    max_g = 31
                elif mese == 2:
                    max_g = 28
                else:
                    max_g = 30
                gg = random.randint(1, max_g)
                d_target = date(2026, mese, gg)
                tipo = TipoAppuntamento.IGIENE if "igiene" in titolo.lower() else random.choice([
                    TipoAppuntamento.PRIMA_VISITA, TipoAppuntamento.VISITA,
                    TipoAppuntamento.INTERVENTO, TipoAppuntamento.CONTROLLO,
                ])
                operatore = _scegli_operatore_per_tipo(tipo, dentisti, igienisti)
                sala = _scegli_sala(tipo, sale_disponibili)
                durata = _durata_per_tipo(tipo)
                slot = picker.trova_slot(d_target, operatore.id, sala, durata)
                if not slot:
                    continue
                start, end = slot
                stato_app = _stato_appuntamento_per_data(start, oggi)
                app = _crea_appuntamento(db, piano, p.id, operatore.id, sala, start, durata, tipo, stato_app, creato_da)
                picker.occupa(start, end, operatore.id, sala)
                if stato_app == StatoAppuntamento.COMPLETATO:
                    app_completati.append(app)
                n_app_2026 += 1
                break

        # ordine 2026: gli appuntamenti completati alimentano l'ordine in modo lazy
        if app_completati:
            ordine = _crea_ordine_da_appuntamenti(db, piano, app_completati, voci_data, creato_da, 2026)
            primo_app = min(a.data_ora_inizio for a in app_completati)
            ultimo_app = max(a.data_ora_inizio for a in app_completati)
            # pagamento parziale per piani in corso, completo per piani completati
            if stato_2026 == StatoPianoCura.COMPLETATO:
                _registra_pagamenti_e_ricevuta(db, ordine, p.id, creato_da, ultimo_app, 2026, completo=True)
            elif stato_2026 in (StatoPianoCura.IN_CORSO, StatoPianoCura.ACCETTATO):
                # acconto registrato all'inizio del percorso
                data_acconto = primo_app + timedelta(days=random.randint(0, 5))
                _registra_pagamenti_e_ricevuta(db, ordine, p.id, creato_da, data_acconto, 2026, completo=False)

        n_piani_2026 += 1
    db.commit()
    print(f"✓ Piani 2026: {n_piani_2026} creati con {n_app_2026} appuntamenti")


# ── orchestrazione ────────────────────────────────────────────────────────────


def run_seed(db: Session):
    print("\n🦷 Dental Manager - Inizializzazione database")
    print("=" * 45)
    seed_ruoli(db)
    seed_funzioni(db)
    seed_privilegi(db)
    seed_utenti(db)
    seed_articoli(db)
    seed_stanze(db)
    seed_impostazioni(db)
    seed_pazienti(db)
    seed_odontogrammi(db)
    seed_dati_realistici(db)
    print("=" * 45)
    print("✅ Database inizializzato con successo!\n")
