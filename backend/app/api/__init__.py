from fastapi import APIRouter
from app.api.routes import (
    auth, utenti, pazienti, appuntamenti, preventivi, ordini, pagamenti,
    articoli, log, stanze, impostazioni, ruoli, statistiche, odontogramma,
    lista_attesa, dashboard, piano_cura, documenti_fiscali, cartella_clinica,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(utenti.router)
api_router.include_router(pazienti.router)
api_router.include_router(piano_cura.router)
api_router.include_router(appuntamenti.router)
api_router.include_router(preventivi.router)
api_router.include_router(ordini.router)
api_router.include_router(pagamenti.router)
api_router.include_router(documenti_fiscali.router)
api_router.include_router(articoli.router)
api_router.include_router(log.router)
api_router.include_router(stanze.router)
api_router.include_router(impostazioni.router)
api_router.include_router(ruoli.router)
api_router.include_router(statistiche.router)
api_router.include_router(odontogramma.router)
api_router.include_router(lista_attesa.router)
api_router.include_router(dashboard.router)
api_router.include_router(cartella_clinica.router)