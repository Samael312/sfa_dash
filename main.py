#Archivo: main.py
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.logic.Sfa_mock import get_latest_mock, get_history_mock, get_status_mock

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando la aplicación...")
    yield
    print("Finalizando la aplicación...")

app = FastAPI(lifespan=lifespan)

@app.get("/internal/dashboard/SFA/latest")
def get_sfa_latest():

    try:
        return get_latest_mock()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/internal/dashboard/SFA/history")
def get_sfa_history(
    variable: str = Query(..., description="Nombre de la variable"),
    hours: int = Query(24, ge=1, le=168, description="Horas hacia atrás")
):
    """Histórico de una variable (últimas N horas, 1 punto cada 5 min)."""
    try:
        points = get_history_mock(variable, hours)
        if not points:
            raise HTTPException(status_code=404, detail=f"Variable '{variable}' no encontrada")
        return {"variable": variable, "hours": hours, "points": points}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/internal/dashboard/SFA/status")
def get_sfa_status():
    """Estado general del sistema: batería, alertas, modo mock/real."""
    try:
        return get_status_mock()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="192.168.5.108", port=8000)