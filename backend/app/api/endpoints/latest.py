"""
endpoints/latest.py
-------------------
GET /latest  →  última lectura de cada variable para un sensor.
"""

from fastapi import APIRouter, HTTPException, Query

from app.api_client import get_latest

router = APIRouter()


@router.get("/latest")
def endpoint_latest(sensor_id: str = Query(...)):
    try:
        return get_latest(sensor_id)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))