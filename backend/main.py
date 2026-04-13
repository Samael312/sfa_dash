"""
main.py
-------
API FastAPI del dashboard SFA.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.logic.Sfa_mock import run_mock
from app.api_client import (
    get_latest, get_history, get_status, get_sensors,
    get_alert_rules, create_alert_rule, update_alert_rule, delete_alert_rule,
    evaluate_alerts, clear_alerts,
)

SENSOR_ID = os.getenv("SENSOR_ID", "sensor1")


# ==========================================
# SCHEMAS
# ==========================================
class AlertRuleCreate(BaseModel):
    sensor_id: str
    variable:  str
    operator:  str        # '<=' | '>='
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

BASE = "/internal/dashboard/sfa"


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
    """Lista todas las reglas de alerta de un sensor."""
    try:
        return {"sensor_id": sensor_id, "rules": get_alert_rules(sensor_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post(f"{BASE}/alert-rules", status_code=201)
def endpoint_create_rule(body: AlertRuleCreate):
    """Crea una nueva regla de alerta."""
    try:
        rule = create_alert_rule(
            body.sensor_id, body.variable, body.operator,
            body.threshold, body.level, body.message
        )
        return rule
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put(f"{BASE}/alert-rules/{{rule_id}}")
def endpoint_update_rule(rule_id: int, body: AlertRuleUpdate):
    """Actualiza threshold, level y message de una regla."""
    try:
        rule = update_alert_rule(rule_id, body.threshold, body.level, body.message)
        return rule
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete(f"{BASE}/alert-rules/{{rule_id}}")
def endpoint_delete_rule(rule_id: int):
    """Elimina una regla de alerta por id."""
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
    """
    Compara la última lectura del sensor contra las reglas de alert_rules
    y escribe en sfa_alerts las que disparen.
    Devuelve las alertas nuevas generadas en esta evaluación.
    """
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
    """Elimina todas las alertas de sfa_alerts para el sensor indicado."""
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