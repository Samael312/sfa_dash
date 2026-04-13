"""
endpoints/alert_rules.py
------------------------
CRUD completo de reglas de alerta:

  GET    /alert-rules          → listar reglas de un sensor
  POST   /alert-rules          → crear regla
  PUT    /alert-rules/{rule_id} → actualizar threshold / level / message
  DELETE /alert-rules/{rule_id} → eliminar regla
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.api_client import (
    get_alert_rules,
    create_alert_rule,
    update_alert_rule,
    delete_alert_rule,
)

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/alert-rules")
def endpoint_get_rules(sensor_id: str = Query(...)):
    """Lista todas las reglas de alerta de un sensor."""
    try:
        return {"sensor_id": sensor_id, "rules": get_alert_rules(sensor_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alert-rules", status_code=201)
def endpoint_create_rule(body: AlertRuleCreate):
    """Crea una nueva regla de alerta."""
    try:
        return create_alert_rule(
            body.sensor_id, body.variable, body.operator,
            body.threshold, body.level, body.message,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/alert-rules/{rule_id}")
def endpoint_update_rule(rule_id: int, body: AlertRuleUpdate):
    """Actualiza threshold, level y message de una regla."""
    try:
        return update_alert_rule(rule_id, body.threshold, body.level, body.message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/alert-rules/{rule_id}")
def endpoint_delete_rule(rule_id: int):
    """Elimina una regla de alerta por id."""
    try:
        deleted = delete_alert_rule(rule_id)
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail=f"Regla id={rule_id} no encontrada.",
            )
        return {"deleted": True, "rule_id": rule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))