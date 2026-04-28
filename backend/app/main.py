"""
main.py
-------
API FastAPI del dashboard SFA — con autenticación JWT y WebSocket en tiempo real.
"""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.security import HTTPBearer
from fastapi.openapi.utils import get_openapi
from app.auth import decode_token
from app.logic.Sfa_mock import run_mock
from app.ws_manager import ws_manager, start_pg_listener
from app.api_client import (
    get_latest, get_history, get_status, get_sensors,
    get_alert_rules, create_alert_rule, update_alert_rule, delete_alert_rule,
    evaluate_alerts, clear_alerts,
    get_history_aggregated, get_stats,
    get_energy_daily, get_energy_balance,
    get_sensor_connectivity, get_alerts_history,
    get_multi_sensor_history,
)
from app.routes.auth_routes import router as auth_router
from app.alert_engine import snooze_alert, cancel_snooze, get_snoozes, evaluate_all, TREND_CONFIG
from pydantic import BaseModel
from typing import Optional
from app.routes.soc_routes import router as soc_router
from app.logic.soc_worker import soc_worker_loop   


SENSOR_ID = os.getenv("SENSOR_ID", "s1")

# ==========================================
# ESTADO GLOBAL DEL MOCK
# ==========================================
_mock_tasks: dict[str, dict] = {}


# ==========================================
# MIDDLEWARE DE AUTENTICACIÓN
# ==========================================
class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if (
            path.startswith("/internal/dashboard/auth")
            or path.startswith("/docs")
            or path.startswith("/openapi")
            or path.startswith("/redoc")
        ):
            return await call_next(request)

        # Los WebSockets se autentican con token en query param, no en header
        if path.startswith("/ws/"):
            return await call_next(request)

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

 
class SnoozeBody(BaseModel):
    sensor_id: str
    variable:  Optional[str] = None
    hours:     float = 2.0


# ==========================================
# LIFESPAN
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando aplicación…")
    print(f"📡 SFA arrancado para sensor '{SENSOR_ID}'")

    soc_task = asyncio.create_task(soc_worker_loop(interval_s=600))
    # Iniciar listener PostgreSQL NOTIFY → WebSocket
    pg_listener_task = asyncio.create_task(start_pg_listener())
    
    yield  # Aquí es donde la app de FastAPI está viva y recibiendo peticiones
    
    # === FASE DE APAGADO ===
    soc_task.cancel()
    pg_listener_task.cancel()
    
    # 1. Esperamos ambas tareas a la vez. 
    # return_exceptions=True atrapa CancelledError y cualquier otra excepción, 
    # garantizando que el código de abajo siempre se ejecute.
    await asyncio.gather(soc_task, pg_listener_task, return_exceptions=True)

    # 2. Cancelar todos los mocks activos al apagar
    for sensor_id, info in list(_mock_tasks.items()):
        info["stop_event"].set()
        info["task"].cancel()
        try:
            await info["task"]
        except asyncio.CancelledError:
            pass
        except Exception as e:
            # Es buena práctica loguear si un mock falló de forma inesperada al cerrar
            print(f"⚠️ Error inesperado al cerrar mock [{sensor_id}]: {e}")
            
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
app.include_router(soc_router)

BASE      = "/internal/dashboard/sfa"
MOCK_BASE = "/internal/dashboard/mock"


# ==========================================
# WEBSOCKET
# ==========================================
@app.websocket("/ws/{sensor_id}")
async def websocket_endpoint(websocket: WebSocket, sensor_id: str):
    """
    WebSocket por sensor. Autenticación por query param:
      ws://host/ws/s1?token=eyJ...

    Mensajes que recibe el cliente:
      { "type": "reading", "sensor_id": "s1", "variable": "radiacion",
        "value": 523.4, "timestamp": "...", "source": "mqtt" }
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Token requerido")
        return

    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Token inválido o expirado")
        return

    await ws_manager.connect(websocket, sensor_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, sensor_id)
    except Exception:
        ws_manager.disconnect(websocket, sensor_id)


@app.get(f"{BASE}/ws/status")
def endpoint_ws_status():
    """Estado de las conexiones WebSocket activas."""
    return {
        "total_connections": ws_manager.total_connections,
        "active_sensors":    ws_manager.active_sensors,
    }


# ==========================================
# MOCK CONTROL
# ==========================================
@app.post(f"{MOCK_BASE}/start")
async def endpoint_mock_start(sensor_id: str = Query(default="s2")):
    if sensor_id in _mock_tasks:
        info = _mock_tasks[sensor_id]
        if not info["task"].done():
            return {
                "status": "already_running",
                "sensor_id": sensor_id,
                "message": f"El mock para '{sensor_id}' ya está en ejecución.",
            }
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
    result = {}
    for sensor_id, info in _mock_tasks.items():
        result[sensor_id] = {
            "running": not info["task"].done(),
            "cancelled": info["task"].cancelled(),
        }
    return {"mocks": result, "active_count": len(result)}


# ==========================================
# DATOS BASE
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
# ENDPOINTS EXTENDIDOS
# ==========================================
@app.get(f"{BASE}/history/aggregated")
def endpoint_history_aggregated(
    sensor_id: str = Query(...),
    variable:  str = Query(...),
    hours:     int = Query(24, ge=1, le=720),
):
    try:
        result = get_history_aggregated(sensor_id, variable, hours)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Variable '{variable}' no reconocida.")
        if not result["points"]:
            raise HTTPException(status_code=503, detail="Sin datos en la ventana solicitada.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/stats")
def endpoint_stats(
    sensor_id: str = Query(...),
    variable:  str = Query(...),
    hours:     int = Query(24, ge=1, le=720),
):
    try:
        result = get_stats(sensor_id, variable, hours)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Sin datos para '{variable}' en las últimas {hours}h.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/energy/daily")
def endpoint_energy_daily(
    sensor_id: str = Query(...),
    days:      int = Query(7, ge=1, le=90),
):
    try:
        result = get_energy_daily(sensor_id, days)
        if not result:
            raise HTTPException(status_code=503, detail="Sin datos de energía en el período solicitado.")
        return {"sensor_id": sensor_id, "days": days, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/energy/balance")
def endpoint_energy_balance(
    sensor_id: str = Query(...),
    hours:     int = Query(24, ge=1, le=720),
):
    try:
        result = get_energy_balance(sensor_id, hours)
        if not result["points"]:
            raise HTTPException(status_code=503, detail="Sin datos de balance en la ventana solicitada.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/sensors/connectivity")
def endpoint_connectivity(
    sensor_ids: str = Query(..., description="IDs separados por coma: s1,s2,s3"),
):
    try:
        ids = [s.strip() for s in sensor_ids.split(",") if s.strip()]
        if not ids:
            raise HTTPException(status_code=422, detail="sensor_ids vacío.")
        return {"sensors": get_sensor_connectivity(ids)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/alerts/history")
def endpoint_alerts_history(
    sensor_id: str           = Query(...),
    page:      int           = Query(1, ge=1),
    limit:     int           = Query(20, ge=1, le=100),
    level:     Optional[str] = Query(None, description="warning | critical"),
    variable:  Optional[str] = Query(None),
):
    try:
        if level and level not in ("warning", "critical"):
            raise HTTPException(status_code=422, detail="level debe ser 'warning' o 'critical'.")
        return get_alerts_history(sensor_id, page, limit, level, variable)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{BASE}/history/multi")
def endpoint_history_multi(
    sensor_ids: str = Query(..., description="IDs separados por coma: s1,s2"),
    variable:   str = Query(...),
    hours:      int = Query(24, ge=1, le=720),
):
    try:
        ids = [s.strip() for s in sensor_ids.split(",") if s.strip()]
        if not ids:
            raise HTTPException(status_code=422, detail="sensor_ids vacío.")
        result = get_multi_sensor_history(ids, variable, hours)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Variable '{variable}' no reconocida.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 
@app.post(f"{BASE}/alerts/snooze", status_code=201)
def _snooze_create(body: SnoozeBody):
    try:
        if body.hours <= 0 or body.hours > 168:
            raise HTTPException(422, "hours entre 0 y 168")
        result = snooze_alert(body.sensor_id, body.variable, body.hours)
        return {"snoozed": True, **result}
    except HTTPException: raise
    except Exception as e: raise HTTPException(500, str(e))
 
@app.delete(f"{BASE}/alerts/snooze")
def _snooze_cancel(sensor_id: str = Query(...), variable: Optional[str] = Query(None)):
    try:
        deleted = cancel_snooze(sensor_id, variable)
        return {"cancelled": deleted > 0, "deleted": deleted}
    except Exception as e: raise HTTPException(500, str(e))
 
@app.get(f"{BASE}/alerts/snooze")
def _snooze_list(sensor_id: str = Query(...)):
    try:
        return {"sensor_id": sensor_id, "snoozes": get_snoozes(sensor_id)}
    except Exception as e: raise HTTPException(500, str(e))
 
@app.get(f"{BASE}/alerts/evaluate/full")
def _evaluate_full(sensor_id: str = Query(...)):
    try:
        return evaluate_all(sensor_id)
    except ValueError as e: raise HTTPException(503, str(e))
    except Exception as e: raise HTTPException(500, str(e))
 
@app.get(f"{BASE}/alerts/trends/config")
def _trends_config():
    return {"config": TREND_CONFIG}
# ==========================================
# ENTRYPOINT
# ==========================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)