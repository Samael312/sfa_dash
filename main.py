from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.logic.Sfa_mock import get_latest_mock, get_history_mock, get_status_mock

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando la aplicación...")
    yield
    print("Finalizando la aplicación...")

app = FastAPI(lifespan=lifespan)

# CORS — debe ir aquí, antes de cualquier endpoint
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/internal/dashboard/sfa/latest")
def get_sfa_latest():
    try:
        return get_latest_mock()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/internal/dashboard/sfa/history")
def get_sfa_history(
    variable: str = Query(...),
    hours: int = Query(24, ge=1, le=168)
):
    try:
        points = get_history_mock(variable, hours)
        if not points:
            raise HTTPException(status_code=404, detail=f"Variable '{variable}' no encontrada")
        return {"variable": variable, "hours": hours, "points": points}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/internal/dashboard/sfa/status")
def get_sfa_status():
    try:
        return get_status_mock()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)