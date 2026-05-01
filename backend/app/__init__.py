from fastapi import APIRouter
from app.api.routes import auth, utenti, pazienti, appuntamenti, preventivi, ordini, pagamenti, articoli, log

api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(utenti.router)
api_router.include_router(pazienti.router)
api_router.include_router(appuntamenti.router)
api_router.include_router(preventivi.router)
api_router.include_router(ordini.router)
api_router.include_router(pagamenti.router)
api_router.include_router(articoli.router)
api_router.include_router(log.router)