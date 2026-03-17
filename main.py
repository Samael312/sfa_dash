"""
main.py
-------
API FastAPI del dashboard SFA.

Al arrancar (lifespan) lanza el mock SFA como tarea background:
  - Genera datos simulados y los publica en MQTT cada 10 s
  - Railway los recibe, los persiste en PostgreSQL
  - Los endpoints leen de PostgreSQL vía api_client.py
"""

import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.logic.Sfa_mock import run_mock
from app.api_client import get_latest, get_history, get_status, get_sensors

SENSOR_ID = os.getenv("SENSOR_ID", "sensor1")


# ==========================================
# LIFESPAN
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando aplicación…")
    mock_task = asyncio.create_task(run_mock(sensor_id=SENSOR_ID))
    print(f"📡 Mock SFA arrancado para sensor '{SENSOR_ID}'")
    yield
    mock_task.cancel()
    try:
        await mock_task
    except asyncio.CancelledError:
        pass
    print("🛑 Aplicación cerrada.")


# ==========================================
# APP
# ==========================================
app = FastAPI(
    title="Dashboard SFA — Universidad de Jaén",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# ENDPOINTS
# ==========================================

@app.get("/internal/dashboard/sfa/sensors")
def endpoint_sensors():
    try:
        return {"sensors": get_sensors()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/internal/dashboard/sfa/latest")
def endpoint_latest(sensor_id: str = Query(...)):
    try:
        return get_latest(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/internal/dashboard/sfa/history")
def endpoint_history(
    sensor_id: str = Query(...),
    variable:  str = Query(...),
    hours:     int = Query(24, ge=1, le=168),
):
    try:
        points = get_history(sensor_id, variable, hours)
        if points is None:
            raise HTTPException(status_code=404, detail=f"Variable '{variable}' no reconocida.")
        if not points:
            raise HTTPException(status_code=503, detail="Sin datos en la ventana solicitada.")
        return {"sensor_id": sensor_id, "variable": variable, "hours": hours, "points": points}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/internal/dashboard/sfa/status")
def endpoint_status(sensor_id: str = Query(...)):
    try:
        return get_status(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# ENTRYPOINT
# ==========================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)