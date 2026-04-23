"""
soc_worker.py
-------------
Worker periódico que recalcula el SOC de todos los sensores activos.

Debe ejecutarse cada ~10 minutos (cron job en Railway o tarea asyncio).

Modo cron en Railway:
  - Crear un nuevo servicio "Cron Job" en Railway
  - Comando: python scripts/soc_worker.py
  - Schedule: */10 * * * *

Modo asyncio (alternativo, añadir al lifespan de main.py):
    asyncio.create_task(soc_worker_loop())

Colocar en: backend/scripts/soc_worker.py
"""

import asyncio
import os
import sys
import time

# Asegurar que el path del backend esté en sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.logic.soc_engine import compute_soc
from app.api_client import get_sensors


def run_once():
    """Recalcula el SOC de todos los sensores activos una sola vez."""
    try:
        sensors = get_sensors()
    except Exception as e:
        print(f"[SOC Worker] Error obteniendo sensores: {e}")
        return

    if not sensors:
        print("[SOC Worker] No hay sensores activos.")
        return

    for sensor_id in sensors:
        try:
            result = compute_soc(sensor_id)
            method = result.get("method", "?")
            soc    = result.get("soc_pct", "?")
            delta  = result.get("delta_ah", "")
            delta_str = f"  ΔAh={delta:+.4f}" if isinstance(delta, float) else ""
            print(f"[SOC Worker] {sensor_id}: SOC={soc}%  método={method}{delta_str}")
        except Exception as e:
            print(f"[SOC Worker] Error actualizando {sensor_id}: {e}")


async def soc_worker_loop(interval_s: int = 600):
    """
    Corrutina asyncio para ejecutar el worker cada `interval_s` segundos.
    Usar en el lifespan de FastAPI:

        soc_task = asyncio.create_task(soc_worker_loop())
    """
    print(f"[SOC Worker] Iniciado. Intervalo: {interval_s}s (~{interval_s//60} min)")
    while True:
        try:
            run_once()
        except Exception as e:
            print(f"[SOC Worker] Error en ciclo: {e}")
        await asyncio.sleep(interval_s)


if __name__ == "__main__":
    print("[SOC Worker] Ejecutando actualización de SOC...")
    run_once()
    print("[SOC Worker] Completado.")
