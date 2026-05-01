from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_utente_corrente, get_db_session
from app.services.cartella_clinica_service import CartellaClinicaService
from app.models.utente import Utente

router = APIRouter(prefix="/cartella-clinica", tags=["Cartella clinica"])


@router.get("/{paziente_id}")
def get_cartella_clinica(
    paziente_id: int,
    utente_corrente: Utente = Depends(get_utente_corrente),
    db: Session = Depends(get_db_session),
):
    """
    Cartella clinica unificata di un paziente.

    Aggrega in un'unica risposta:
    - dati anagrafici e clinici di base (anamnesi storica, allergie)
    - flag presenza dell'odontogramma
    - timeline cronologica con i diari di visita degli appuntamenti completati
      e i consensi informati firmati associati ai preventivi del paziente
    """
    return CartellaClinicaService.get_cartella_clinica(db=db, paziente_id=paziente_id)
