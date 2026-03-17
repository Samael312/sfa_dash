"""
api_client.py
-------------
Lee de sfa_readings y sfa_alerts (escritas por bridge.py en Railway).

Funciones públicas:
  - get_latest(sensor_id)
  - get_history(sensor_id, variable, hours)
  - get_status(sensor_id)
  - get_sensors()
"""

from datetime import datetime

from app.config.db import get_conn, release_conn
from app.config.settings import SFA_VARIABLES


def _fmt_ts(ts) -> str:
    return ts.isoformat() if isinstance(ts, datetime) else str(ts)


def get_latest(sensor_id: str) -> dict:
    """Última lectura de cada variable para el sensor. Lanza ValueError si no hay datos."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (variable)
                    variable, value, timestamp, source
                FROM sfa_readings
                WHERE sensor_id = %s
                ORDER BY variable, timestamp DESC
            """, (sensor_id,))
            rows = cur.fetchall()

        if not rows:
            raise ValueError(f"No hay lecturas para el sensor '{sensor_id}'.")

        result  = {"sensor_id": sensor_id}
        last_ts = None
        source  = "mqtt"

        for variable, value, ts, src in rows:
            result[variable] = value
            if last_ts is None or ts > last_ts:
                last_ts = ts
                source  = src

        result["timestamp"] = _fmt_ts(last_ts)
        result["source"]    = source
        return result
    finally:
        release_conn(conn)


def get_history(sensor_id: str, variable: str, hours: int = 24) -> list[dict] | None:
    """
    Serie temporal de `variable` para `sensor_id` en las últimas `hours` horas.
    Devuelve None si la variable no es conocida.
    """
    if variable not in SFA_VARIABLES:
        return None

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT timestamp, value
                FROM sfa_readings
                WHERE sensor_id = %s
                  AND variable  = %s
                  AND timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp ASC
            """, (sensor_id, variable, hours))
            rows = cur.fetchall()
        return [{"timestamp": _fmt_ts(ts), "value": value} for ts, value in rows]
    finally:
        release_conn(conn)


def get_status(sensor_id: str) -> dict:
    """Resumen del SFA: última lectura, SOC estimado, alertas recientes."""
    latest = get_latest(sensor_id)

    v       = latest.get("tension_bateria", 12.0)
    soc_pct = round(max(0.0, min(100.0, (v - 11.0) / 3.4 * 100)), 1)

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT level, variable, message, timestamp
                FROM sfa_alerts
                WHERE sensor_id = %s
                  AND timestamp >= NOW() - INTERVAL '24 hours'
                ORDER BY timestamp DESC
                LIMIT 50
            """, (sensor_id,))
            rows = cur.fetchall()
        alerts = [
            {"level": lv, "variable": va, "message": msg, "timestamp": _fmt_ts(ts)}
            for lv, va, msg, ts in rows
        ]
    finally:
        release_conn(conn)

    return {
        "mode":             "postgresql",
        "connected":        True,
        "sensor_id":        sensor_id,
        "last_update":      latest["timestamp"],
        "battery_percent":  soc_pct,
        "solar_generating": (latest.get("radiacion_solar") or 0) > 50,
        "active_alerts":    len(alerts),
        "alerts":           alerts,
        "variables_meta":   SFA_VARIABLES,
    }


def get_sensors() -> list[str]:
    """Lista de sensor_id con lecturas en sfa_readings."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT sensor_id
                FROM sfa_readings
                ORDER BY sensor_id
            """)
            return [row[0] for row in cur.fetchall()]
    finally:
        release_conn(conn)