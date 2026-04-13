"""
endpoints/status.py
-------------------
GET /status  →  estado general del sensor (batería, alertas activas, metadatos).
"""

from fastapi import APIRouter, HTTPException, Query

from app.api_client import get_status

router = APIRouter()


@router.get("/status")
def endpoint_status(sensor_id: str = Query(...)):
    try:
        return get_status(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))