"""
endpoints/alerts.py
-------------------
Evaluación y gestión del historial de alertas disparadas:

  GET    /alerts/evaluate  → evalúa última lectura contra reglas y persiste alertas
  DELETE /alerts           → borra todas las alertas de un sensor
"""

from fastapi import APIRouter, HTTPException, Query

from app.api_client import evaluate_alerts, clear_alerts

router = APIRouter()


@router.get("/alerts/evaluate")
def endpoint_evaluate_alerts(sensor_id: str = Query(...)):
    """
    Compara la última lectura del sensor contra las reglas de alert_rules
    y escribe en sfa_alerts las que disparen.
    Devuelve las alertas nuevas generadas en esta evaluación.
    """
    try:
        triggered = evaluate_alerts(sensor_id)
        return {
            "sensor_id":  sensor_id,
            "evaluated":  True,
            "new_alerts": len(triggered),
            "alerts":     triggered,
        }
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/alerts")
def endpoint_clear_alerts(sensor_id: str = Query(...)):
    """Elimina todas las alertas de sfa_alerts para el sensor indicado."""
    try:
        deleted = clear_alerts(sensor_id)
        return {
            "sensor_id": sensor_id,
            "deleted":   deleted,
            "message":   f"{deleted} alerta(s) eliminadas.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))