"""
endpoints/sensors.py
--------------------
GET /sensors  →  lista de sensor_id disponibles en la BD.
"""

from fastapi import APIRouter, HTTPException

from app.api_client import get_sensors

router = APIRouter()


@router.get("/sensors")
def endpoint_sensors():
    try:
        return {"sensors": get_sensors()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))