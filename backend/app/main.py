"""
main.py
-------
API FastAPI del dashboard SFA — con autenticación JWT.
"""

import asyncio
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.security import HTTPBearer
from fastapi.openapi.utils import get_openapi
from app.auth import decode_token
from app.logic.Sfa_mock import run_mock
from app.api_client import (
    get_latest, get_history, get_status, get_sensors,
    get_alert_rules, create_alert_rule, update_alert_rule, delete_alert_rule,
    evaluate_alerts, clear_alerts,
)
from app.routes.auth_routes import router as auth_router


SENSOR_ID = os.getenv("SENSOR_ID", "s1")

# ==========================================
# ESTADO GLOBAL DEL MOCK
# ==========================================
# Diccionario: sensor_id → {"task": asyncio.Task, "stop_event": asyncio.Event}
_mock_tasks: dict[str, dict] = {}


# ==========================================
# MIDDLEWARE DE AUTENTICACIÓN
# ==========================================
class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        # Rutas públicas
        if (
            path.startswith("/internal/dashboard/auth")
            or path.startswith("/docs")
            or path.startswith("/openapi")
            or path.startswith("/redoc")
        ):
            return await call_next(request)

        # Proteger rutas SFA y mock
        if path.startswith("/internal/dashboard/"):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "No autenticado. Inicia sesión para acceder."},
                )
            token = auth_header.split(" ", 1)[1]
            payload = decode_token(token)
            if not payload:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Token inválido o expirado. Inicia sesión de nuevo."},
                )
            request.state.user = payload

        return await call_next(request)


# ==========================================
# SCHEMAS
# ==========================================
class AlertRuleCreate(BaseModel):
    sensor_id: str
    variable:  str
    operator:  str
    threshold: float
    level:     str = "warning"
    message:   str

class AlertRuleUpdate(BaseModel):
    threshold: float
    level:     str
    message:   str


# ==========================================
# LIFESPAN
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando aplicación…")
    print(f"📡 SFA arrancado para sensor '{SENSOR_ID}'")
    yield
    # Cancelar todos los mocks activos al apagar
    for sensor_id, info in list(_mock_tasks.items()):
        info["stop_event"].set()
        info["task"].cancel()
        try:
            await info["task"]
        except (asyncio.CancelledError, Exception):
            pass
        print(f"🛑 Mock [{sensor_id}] detenido al apagar.")
    print("🛑 Aplicación cerrada.")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Dashboard SFA — Universidad de Jaén",
    version="4.0.0",
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True},
)

_bearer = HTTPBearer(auto_error=False)

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description="API del sistema de monitorización SFA.",
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }
    for path, methods in schema.get("paths", {}).items():
        if "/sfa/" in path or "/mock/" in path:
            for method_data in methods.values():
                method_data.setdefault("security", [{"BearerAuth": []}])
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi

app.add_middleware(JWTAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

BASE = "/internal/dashboard/sfa"
MOCK_BASE = "/internal/dashboard/mock"


# ==========================================
# MOCK CONTROL
# ==========================================
@app.post(f"{MOCK_BASE}/start")
async def endpoint_mock_start(sensor_id: str = Query(default="s2")):
    """
    Arranca el simulador MQTT para el sensor indicado.
    Por defecto simula 's2'. Se puede usar cualquier sensor_id.
    """
    if sensor_id in _mock_tasks:
        info = _mock_tasks[sensor_id]
        if not info["task"].done():
            return {
                "status": "already_running",
                "sensor_id": sensor_id,
                "message": f"El mock para '{sensor_id}' ya está en ejecución.",
            }
        # La tarea terminó (p.ej. por error), limpiar entrada antigua
        del _mock_tasks[sensor_id]

    stop_event = asyncio.Event()
    task = asyncio.create_task(run_mock(sensor_id=sensor_id, stop_event=stop_event))
    _mock_tasks[sensor_id] = {"task": task, "stop_event": stop_event}

    return {
        "status": "started",
        "sensor_id": sensor_id,
        "message": f"Simulador iniciado para sensor '{sensor_id}'.",
    }


@app.post(f"{MOCK_BASE}/stop")
async def endpoint_mock_stop(sensor_id: str = Query(default="s2")):
    """Detiene el simulador MQTT del sensor indicado."""
    if sensor_id not in _mock_tasks:
        return {
            "status": "not_running",
            "sensor_id": sensor_id,
            "message": f"No hay mock activo para '{sensor_id}'.",
        }

    info = _mock_tasks[sensor_id]
    info["stop_event"].set()
    info["task"].cancel()
    try:
        await info["task"]
    except (asyncio.CancelledError, Exception):
        pass
    del _mock_tasks[sensor_id]

    return {
        "status": "stopped",
        "sensor_id": sensor_id,
        "message": f"Simulador detenido para sensor '{sensor_id}'.",
    }


@app.get(f"{MOCK_BASE}/status")
def endpoint_mock_status():
    """Devuelve el estado de todos los simuladores activos."""
    result = {}
    for sensor_id, info in _mock_tasks.items():
        result[sensor_id] = {
            "running": not info["task"].done(),
            "cancelled": info["task"].cancelled(),
        }
    return {"mocks": result, "active_count": len(result)}


# ==========================================
# DATOS
# ==========================================
@app.get(f"{BASE}/sensors")
def endpoint_sensors():
    try:
        return {"sensors": get_sensors()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/latest")
def endpoint_latest(sensor_id: str = Query(...)):
    try:
        return get_latest(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/history")
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


@app.get(f"{BASE}/status")
def endpoint_status(sensor_id: str = Query(...)):
    try:
        return get_status(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# REGLAS DE ALERTA — CRUD
# ==========================================
@app.get(f"{BASE}/alert-rules")
def endpoint_get_rules(sensor_id: str = Query(...)):
    try:
        return {"sensor_id": sensor_id, "rules": get_alert_rules(sensor_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post(f"{BASE}/alert-rules", status_code=201)
def endpoint_create_rule(body: AlertRuleCreate):
    try:
        return create_alert_rule(
            body.sensor_id, body.variable, body.operator,
            body.threshold, body.level, body.message
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put(f"{BASE}/alert-rules/{{rule_id}}")
def endpoint_update_rule(rule_id: int, body: AlertRuleUpdate):
    try:
        return update_alert_rule(rule_id, body.threshold, body.level, body.message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete(f"{BASE}/alert-rules/{{rule_id}}")
def endpoint_delete_rule(rule_id: int):
    try:
        deleted = delete_alert_rule(rule_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Regla id={rule_id} no encontrada.")
        return {"deleted": True, "rule_id": rule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# EVALUACIÓN Y GESTIÓN DE ALERTAS
# ==========================================
@app.get(f"{BASE}/alerts/evaluate")
def endpoint_evaluate_alerts(sensor_id: str = Query(...)):
    try:
        triggered = evaluate_alerts(sensor_id)
        return {
            "sensor_id": sensor_id,
            "evaluated": True,
            "new_alerts": len(triggered),
            "alerts": triggered,
        }
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete(f"{BASE}/alerts")
def endpoint_clear_alerts(sensor_id: str = Query(...)):
    try:
        deleted = clear_alerts(sensor_id)
        return {"sensor_id": sensor_id, "deleted": deleted, "message": f"{deleted} alerta(s) eliminadas."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# ENTRYPOINT
# ==========================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)