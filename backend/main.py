"""
main.py
-------
Punto de entrada de la API FastAPI del dashboard SFA.

Responsabilidades:
  - Crear la instancia de FastAPI.
  - Registrar el middleware CORS.
  - Gestionar el ciclo de vida (lifespan): arrancar y detener el mock MQTT.
  - Incluir el router central de la API.
"""

import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.logic.Sfa_mock import run_mock

SENSOR_ID = os.getenv("SENSOR_ID", "sensor1")


# ── Lifespan ───────────────────────────────────────────────────────────────────

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


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Dashboard SFA — Universidad de Jaén",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)