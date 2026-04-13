"""
endpoints/history.py
--------------------
GET /history  →  serie histórica de una variable para un sensor.
"""

from fastapi import APIRouter, HTTPException, Query

from app.api_client import get_history

router = APIRouter()


@router.get("/history")
def endpoint_history(
    sensor_id: str = Query(...),
    variable:  str = Query(...),
    hours:     int = Query(24, ge=1, le=168),
):
    try:
        points = get_history(sensor_id, variable, hours)
        if points is None:
            raise HTTPException(
                status_code=404,
                detail=f"Variable '{variable}' no reconocida.",
            )
        if not points:
            raise HTTPException(
                status_code=503,
                detail="Sin datos en la ventana solicitada.",
            )
        return {
            "sensor_id": sensor_id,
            "variable":  variable,
            "hours":     hours,
            "points":    points,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))