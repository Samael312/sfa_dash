"""
api_client.py
-------------
Capa de acceso a datos. Lee de sfa_readings, sfa_alerts y alert_rules.

Funciones públicas:
  Datos:
    - get_latest(sensor_id)
    - get_history(sensor_id, variable, hours)
    - get_status(sensor_id)
    - get_sensors()

  Reglas de alerta (CRUD):
    - get_alert_rules(sensor_id)
    - create_alert_rule(sensor_id, variable, operator, threshold, level, message)
    - update_alert_rule(rule_id, **fields)
    - delete_alert_rule(rule_id)

  Evaluación y gestión:
    - evaluate_alerts(sensor_id)   → compara última lectura contra reglas → escribe sfa_alerts
    - clear_alerts(sensor_id)
"""

from datetime import datetime

from app.config.db import get_conn, release_conn
from app.config.settings import SFA_VARIABLES


def _fmt_ts(ts) -> str:
    return ts.isoformat() if isinstance(ts, datetime) else str(ts)


# ==========================================
# DATOS
# ==========================================
def get_latest(sensor_id: str) -> dict:
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
            {"level": lv, "variable": va, "message": msg, "timestamp": _fmt_ts(ts), "value": val}
            for lv, va, msg, ts, val in rows
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
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT sensor_id FROM sfa_readings ORDER BY sensor_id")
            return [row[0] for row in cur.fetchall()]
    finally:
        release_conn(conn)


# ==========================================
# CRUD REGLAS DE ALERTA
# ==========================================
def get_alert_rules(sensor_id: str) -> list[dict]:
    """Devuelve todas las reglas de alerta para un sensor."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, sensor_id, variable, operator, threshold, level, message, created_at
                FROM alert_rules
                WHERE sensor_id = %s
                ORDER BY variable, operator
            """, (sensor_id,))
            rows = cur.fetchall()
        return [
            {
                "id": r[0], "sensor_id": r[1], "variable": r[2],
                "operator": r[3], "threshold": r[4], "level": r[5],
                "message": r[6], "created_at": _fmt_ts(r[7])
            }
            for r in rows
        ]
    finally:
        release_conn(conn)


def create_alert_rule(sensor_id: str, variable: str, operator: str,
                      threshold: float, level: str, message: str) -> dict:
    """Crea una nueva regla de alerta. Lanza error si ya existe la combinación sensor+variable+operator."""
    if variable not in SFA_VARIABLES:
        raise ValueError(f"Variable '{variable}' no reconocida.")
    if operator not in ("<=", ">="):
        raise ValueError("operator debe ser '<=' o '>='.")
    if level not in ("warning", "critical"):
        raise ValueError("level debe ser 'warning' o 'critical'.")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO alert_rules (sensor_id, variable, operator, threshold, level, message)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, sensor_id, variable, operator, threshold, level, message, created_at
            """, (sensor_id, variable, operator, threshold, level, message))
            r = cur.fetchone()
        conn.commit()
        return {
            "id": r[0], "sensor_id": r[1], "variable": r[2],
            "operator": r[3], "threshold": r[4], "level": r[5],
            "message": r[6], "created_at": _fmt_ts(r[7])
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def update_alert_rule(rule_id: int, threshold: float, level: str, message: str) -> dict:
    """Actualiza threshold, level y message de una regla existente."""
    if level not in ("warning", "critical"):
        raise ValueError("level debe ser 'warning' o 'critical'.")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE alert_rules
                SET threshold = %s, level = %s, message = %s
                WHERE id = %s
                RETURNING id, sensor_id, variable, operator, threshold, level, message, created_at
            """, (threshold, level, message, rule_id))
            r = cur.fetchone()
        if not r:
            raise ValueError(f"Regla id={rule_id} no encontrada.")
        conn.commit()
        return {
            "id": r[0], "sensor_id": r[1], "variable": r[2],
            "operator": r[3], "threshold": r[4], "level": r[5],
            "message": r[6], "created_at": _fmt_ts(r[7])
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def delete_alert_rule(rule_id: int) -> bool:
    """Elimina una regla por id. Devuelve True si se eliminó, False si no existía."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM alert_rules WHERE id = %s", (rule_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


# ==========================================
# EVALUACIÓN DE ALERTAS
# ==========================================
def evaluate_alerts(sensor_id: str) -> list[dict]:
    """
    Compara la última lectura contra las reglas.
    Si una regla dispara:
      - Si ya existe una alerta para esa variable con el MISMO valor: se ignora (evita spam).
      - Si existe una alerta para esa variable con DIFERENTE valor: se borra la vieja y se pone la nueva.
      - Si no existe: se inserta.
    """
    latest = get_latest(sensor_id)
    rules  = get_alert_rules(sensor_id)

    if not rules:
        return []

    triggered = []
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for rule in rules:
                value = latest.get(rule["variable"])
                if value is None:
                    continue

                # 1. Verificar si la regla se cumple (Fired)
                fired = (
                    value <= rule["threshold"] if rule["operator"] == "<="
                    else value >= rule["threshold"]
                )
                
                if not fired:
                    continue

                # 2. Buscar si ya hay una alerta activa para esta variable (última hora)
                cur.execute("""
                    SELECT id, value FROM sfa_alerts
                    WHERE sensor_id = %s 
                      AND variable  = %s
                      AND timestamp >= NOW() - INTERVAL '1 hour'
                    ORDER BY timestamp DESC LIMIT 1
                """, (sensor_id, rule["variable"]))
                
                existing_alert = cur.fetchone()

                if existing_alert:
                    old_id, old_value = existing_alert
                    
                    if abs(value - old_value) < 0.001: 
                        # Es el mismo valor (o casi), no hacemos nada para no saturar
                        continue
                    else:
                        # El valor cambió: eliminamos la anterior para "reemplazarla"
                        cur.execute("DELETE FROM sfa_alerts WHERE id = %s", (old_id,))

                # 3. Obtener el reading_id de la lectura que disparó esto
                cur.execute("""
                    SELECT id FROM sfa_readings
                    WHERE sensor_id = %s AND variable = %s
                    ORDER BY timestamp DESC LIMIT 1
                """, (sensor_id, rule["variable"]))
                reading_row = cur.fetchone()
                reading_id  = reading_row[0] if reading_row else None

                # 4. Preparar mensaje e insertar nueva alerta
                op_symbol = rule["operator"]
                clean_val = round(value, 2)
                message = (
                    rule["message"].replace("{value}", str(clean_val))
                    + f" (regla: {op_symbol} {rule['threshold']})"
                )
                ts = datetime.fromisoformat(latest["timestamp"])

                cur.execute("""
                    INSERT INTO sfa_alerts
                        (reading_id, timestamp, sensor_id, level, variable, value, message)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (reading_id, ts, sensor_id, rule["level"], rule["variable"], value, message))

                alert_id = cur.fetchone()[0]
                triggered.append({
                    "id":        alert_id,
                    "sensor_id": sensor_id,
                    "level":     rule["level"],
                    "variable":  rule["variable"],
                    "message":   message,
                    "timestamp": _fmt_ts(ts),
                    "value":     value
                })

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)

    return triggered


# ==========================================
# LIMPIAR ALERTAS
# ==========================================
def clear_alerts(sensor_id: str) -> int:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sfa_alerts WHERE sensor_id = %s", (sensor_id,))
            deleted = cur.rowcount
        conn.commit()
        return deleted
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)