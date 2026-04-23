"""
soc_routes.py  (añadir a backend/app/routes/ y registrar en main.py)
--------------------------------------------------------------------
Endpoints REST para el motor de SOC (Coulomb Counting + OCV).

Registrar en main.py con:
    from app.routes.soc_routes import router as soc_router
    app.include_router(soc_router)
"""

from fastapi import APIRouter, HTTPException, Query
from app.logic.soc_engine import (
    compute_soc,
    get_soc_state,
    try_calibrate_ocv,
    update_soc_coulomb,
    ocv_to_soc,
    OCV_TABLE,
    C_NOM_AH,
    REST_CURRENT_TH,
)

router = APIRouter(prefix="/internal/dashboard/sfa", tags=["soc"])


@router.get("/soc/current")
def endpoint_soc_current(sensor_id: str = Query(...)):
    """
    Devuelve el SOC actual del sensor (lee de soc_state, sin recalcular).
    Respuesta rápida para el frontend.
    """
    try:
        return get_soc_state(sensor_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/soc/compute")
def endpoint_soc_compute(sensor_id: str = Query(...)):
    """
    Recalcula el SOC con el método apropiado:
      - Si es madrugada y batería en reposo → OCV calibration
      - Si no → Coulomb counting desde última actualización

    Llamar periódicamente (p.ej. cada 10 minutos desde el frontend
    o desde un cron job en el backend).
    """
    try:
        result = compute_soc(sensor_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/soc/calibrate")
def endpoint_soc_calibrate(sensor_id: str = Query(...)):
    """
    Fuerza una calibración OCV inmediata si la batería está en reposo.
    Útil para calibrar manualmente desde la UI.
    """
    try:
        result = try_calibrate_ocv(sensor_id)
        if result is None:
            raise HTTPException(
                status_code=422,
                detail="No es posible calibrar: la batería no está en reposo "
                       f"(se requieren {REST_CURRENT_TH}A o menos en i_generada e i_carga "
                       "durante al menos 30 minutos)."
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/soc/ocv-table")
def endpoint_soc_ocv_table():
    """
    Devuelve la curva OCV→SOC utilizada para la calibración.
    Útil para mostrar en la UI y para documentación del TFM.
    """
    return {
        "battery": "Plomo-ácido 12V 7.2Ah",
        "capacity_ah": C_NOM_AH,
        "rest_current_threshold_a": REST_CURRENT_TH,
        "ocv_table": [
            {"voltage_v": v, "soc_pct": s}
            for v, s in OCV_TABLE
        ],
    }


@router.get("/soc/ocv-to-soc")
def endpoint_ocv_to_soc(voltage: float = Query(..., description="Voltaje OCV en reposo (V)")):
    """
    Convierte un voltaje OCV a SOC usando la curva de la batería.
    Útil para depuración y para el panel de diagnóstico.
    """
    if voltage < 9.0 or voltage > 16.0:
        raise HTTPException(status_code=422, detail="Voltaje fuera de rango (9–16 V).")
    soc = ocv_to_soc(voltage)
    return {
        "voltage_v": voltage,
        "soc_pct":   soc,
        "method":    "ocv_interpolation",
    }