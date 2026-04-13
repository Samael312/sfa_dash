"""
api/router.py
-------------
Router principal de la API.

Agrega todos los sub-routers de `endpoints/` bajo el prefijo común
/internal/dashboard/sfa, de modo que main.py sólo necesita hacer:

    app.include_router(api_router)
"""

from fastapi import APIRouter

from app.api.endpoints import alert_rules, alerts, history, latest, sensors, status

BASE = "/internal/dashboard/sfa"

api_router = APIRouter(prefix=BASE)

api_router.include_router(sensors.router,     tags=["Sensores"])
api_router.include_router(latest.router,      tags=["Datos"])
api_router.include_router(history.router,     tags=["Datos"])
api_router.include_router(status.router,      tags=["Datos"])
api_router.include_router(alert_rules.router, tags=["Reglas de alerta"])
api_router.include_router(alerts.router,      tags=["Alertas"])