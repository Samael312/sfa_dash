"""
api_client.py
-------------
Capa de acceso a datos. Lee de sfa_readings, sfa_alerts y alert_rules.

Funciones originales:
  - get_latest, get_history, get_status, get_sensors
  - get_alert_rules, create_alert_rule, update_alert_rule, delete_alert_rule
  - evaluate_alerts, clear_alerts

Funciones extendidas (antes en api_client_extended.py):
  - get_history_aggregated, get_stats
  - get_energy_daily, get_energy_balance
  - get_sensor_connectivity
  - get_alerts_history
  - get_multi_sensor_history
"""

from datetime import datetime
from typing import Optional

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
    v       = latest.get("v_bateria", 12.0)
    soc_pct = round(max(0.0, min(100.0, (v - 11.0) / 3.4 * 100)), 1)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT level, variable, message, timestamp, value
                FROM sfa_alerts
                WHERE sensor_id = %s
                  AND timestamp >= NOW() - INTERVAL '24 hours'
                ORDER BY timestamp DESC
                LIMIT 50
            """, (sensor_id,))
            rows = cur.fetchall()
        alerts = [
            {
                "level": lv, 
                "variable": va, 
                "message": msg, 
                "timestamp": _fmt_ts(ts),
                "value": val
            }
            for lv, va, msg, ts, val in rows 
        ]
    finally:
        release_conn(conn)
    return {
        "mode":             "postgresql",
        "connected":        True,
        "sensor_id":        sensor_id,
        "last_update":      latest["timestamp"],
        "i_generada":       latest.get("i_generada"),
        "battery_percent":  soc_pct,
        "solar_generating": (latest.get("radiacion") or 0) > 50,
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

                fired = (
                    value <= rule["threshold"] if rule["operator"] == "<="
                    else value >= rule["threshold"]
                )
                
                if not fired:
                    continue

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
                        continue
                    else:
                        cur.execute("DELETE FROM sfa_alerts WHERE id = %s", (old_id,))

                cur.execute("""
                    SELECT id FROM sfa_readings
                    WHERE sensor_id = %s AND variable = %s
                    ORDER BY timestamp DESC LIMIT 1
                """, (sensor_id, rule["variable"]))
                reading_row = cur.fetchone()
                reading_id  = reading_row[0] if reading_row else None

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


# ==========================================
# HELPERS INTERNOS EXTENDIDOS
# ==========================================
def _bucket_interval(hours: int) -> str | None:
    """Devuelve el intervalo de agrupación según la ventana solicitada."""
    if hours <= 3:
        return None          # Sin agrupación, puntos crudos
    elif hours <= 24:
        return "5 minutes"
    elif hours <= 72:
        return "15 minutes"
    elif hours <= 168:
        return "1 hour"
    else:
        return "3 hours"


# ==========================================
# HISTORIAL AGREGADO CON DOWNSAMPLING
# ==========================================
def get_history_aggregated(sensor_id: str, variable: str, hours: int = 24) -> dict | None:
    if variable not in SFA_VARIABLES:
        return None

    interval = _bucket_interval(hours)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if interval is None:
                cur.execute("""
                    SELECT
                        timestamp,
                        value,
                        value AS avg_val,
                        value AS min_val,
                        value AS max_val,
                        0     AS stddev_val,
                        1     AS count_val
                    FROM sfa_readings
                    WHERE sensor_id = %s
                      AND variable  = %s
                      AND timestamp >= NOW() - INTERVAL '%s hours'
                    ORDER BY timestamp ASC
                """, (sensor_id, variable, hours))
            else:
                cur.execute("""
                    SELECT
                        date_bin(%s::interval, timestamp, TIMESTAMPTZ '2001-01-01') AS bucket
                        AVG(value)                  AS avg_val,
                        AVG(value)                  AS avg_val2,
                        MIN(value)                  AS min_val,
                        MAX(value)                  AS max_val,
                        STDDEV(value)               AS stddev_val,
                        COUNT(*)                    AS count_val
                    FROM sfa_readings
                    WHERE sensor_id = %s
                      AND variable  = %s
                      AND timestamp >= NOW() - INTERVAL '%s hours'
                    GROUP BY bucket
                    ORDER BY bucket ASC
                """, (interval, sensor_id, variable, hours))

            rows = cur.fetchall()

        points = [
            {
                "timestamp": _fmt_ts(r[0]),
                "value":     round(float(r[1]), 3) if r[1] is not None else None,
                "avg":       round(float(r[2]), 3) if r[2] is not None else None,
                "min":       round(float(r[3]), 3) if r[3] is not None else None,
                "max":       round(float(r[4]), 3) if r[4] is not None else None,
                "stddev":    round(float(r[5]), 3) if r[5] is not None else 0,
                "count":     int(r[6]),
            }
            for r in rows
        ]

        return {
            "sensor_id":  sensor_id,
            "variable":   variable,
            "hours":      hours,
            "interval":   interval or "raw",
            "unit":       SFA_VARIABLES[variable]["unit"],
            "label":      SFA_VARIABLES[variable]["label"],
            "points":     points,
        }
    finally:
        release_conn(conn)


# ==========================================
# ESTADÍSTICAS GLOBALES DE UNA VARIABLE
# ==========================================
def get_stats(sensor_id: str, variable: str, hours: int = 24) -> dict | None:
    if variable not in SFA_VARIABLES:
        return None

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    MIN(value),
                    MAX(value),
                    AVG(value),
                    STDDEV(value),
                    COUNT(*),
                    (SELECT value FROM sfa_readings
                     WHERE sensor_id = %s AND variable = %s
                     ORDER BY timestamp DESC LIMIT 1)
                FROM sfa_readings
                WHERE sensor_id = %s
                  AND variable  = %s
                  AND timestamp >= NOW() - INTERVAL '%s hours'
            """, (sensor_id, variable, sensor_id, variable, hours))
            row = cur.fetchone()

        if not row or row[4] == 0:
            return None

        return {
            "sensor_id": sensor_id,
            "variable":  variable,
            "hours":     hours,
            "unit":      SFA_VARIABLES[variable]["unit"],
            "min":       round(float(row[0]), 3) if row[0] is not None else None,
            "max":       round(float(row[1]), 3) if row[1] is not None else None,
            "avg":       round(float(row[2]), 3) if row[2] is not None else None,
            "stddev":    round(float(row[3]), 3) if row[3] is not None else 0,
            "count":     int(row[4]),
            "last":      round(float(row[5]), 3) if row[5] is not None else None,
        }
    finally:
        release_conn(conn)


# ==========================================
# ENERGÍA ACUMULADA DIARIA
# ==========================================
def get_energy_daily(sensor_id: str, days: int = 7) -> list[dict]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                WITH gen AS (
                    SELECT
                        DATE(timestamp AT TIME ZONE 'UTC') AS day,
                        value,
                        EXTRACT(EPOCH FROM (
                            timestamp - LAG(timestamp) OVER (
                                PARTITION BY DATE(timestamp AT TIME ZONE 'UTC')
                                ORDER BY timestamp
                            )
                        )) AS delta_seconds
                    FROM sfa_readings
                    WHERE sensor_id = %s
                      AND variable  = 'i_generada'
                      AND timestamp >= NOW() - INTERVAL '%s days'
                ),
                load AS (
                    SELECT
                        DATE(timestamp AT TIME ZONE 'UTC') AS day,
                        value,
                        EXTRACT(EPOCH FROM (
                            timestamp - LAG(timestamp) OVER (
                                PARTITION BY DATE(timestamp AT TIME ZONE 'UTC')
                                ORDER BY timestamp
                            )
                        )) AS delta_seconds
                    FROM sfa_readings
                    WHERE sensor_id = %s
                      AND variable  = 'i_carga'
                      AND timestamp >= NOW() - INTERVAL '%s days'
                )
                SELECT
                    COALESCE(g.day, l.day)                                          AS day,
                    COALESCE(SUM(g.value * COALESCE(g.delta_seconds, 0) / 3600), 0) AS gen_ah,
                    COALESCE(SUM(l.value * COALESCE(l.delta_seconds, 0) / 3600), 0) AS load_ah
                FROM gen g
                FULL OUTER JOIN load l ON g.day = l.day
                GROUP BY COALESCE(g.day, l.day)
                ORDER BY day ASC
            """, (sensor_id, days, sensor_id, days))

            rows = cur.fetchall()

        return [
            {
                "day":     str(r[0]),
                "gen_ah":  round(float(r[1]), 3),
                "load_ah": round(float(r[2]), 3),
                "net_ah":  round(float(r[1]) - float(r[2]), 3),
            }
            for r in rows
        ]
    finally:
        release_conn(conn)


# ==========================================
# BALANCE ENERGÉTICO HISTÓRICO
# ==========================================
def get_energy_balance(sensor_id: str, hours: int = 24) -> dict:
    interval = _bucket_interval(hours) or "5 minutes"
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    date_bin(%s::interval, timestamp, TIMESTAMPTZ '2001-01-01') AS bucket,
                    variable,
                    AVG(value) AS avg_val
                FROM sfa_readings
                WHERE sensor_id = %s
                  AND variable IN ('i_generada', 'i_carga')
                  AND timestamp >= NOW() - make_interval(hours => %s)
                GROUP BY bucket, variable
                ORDER BY bucket ASC
            """, (interval, sensor_id, hours))

            rows = cur.fetchall()

        buckets = {}
        for ts, variable, avg in rows:
            key = _fmt_ts(ts)
            if key not in buckets:
                buckets[key] = {"timestamp": key, "i_generada": None, "i_carga": None}
            buckets[key][variable] = round(float(avg), 3) if avg is not None else None

        points = list(buckets.values())
        for p in points:
            gen  = p["i_generada"] or 0
            load = p["i_carga"]    or 0
            p["net"] = round(gen - load, 3)

        return {
            "sensor_id": sensor_id,
            "hours":     hours,
            "interval":  interval,
            "points":    points,
        }
    finally:
        release_conn(conn)


# ==========================================
# CONECTIVIDAD DE SENSORES
# ==========================================
def get_sensor_connectivity(sensor_ids: list[str]) -> list[dict]:
    if not sensor_ids:
        return []

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    sensor_id,
                    MAX(timestamp) AS last_seen,
                    EXTRACT(EPOCH FROM (NOW() - MAX(timestamp))) AS seconds_ago
                FROM sfa_readings
                WHERE sensor_id = ANY(%s)
                GROUP BY sensor_id
            """, (sensor_ids,))
            rows = cur.fetchall()

        result = []
        seen_ids = set()
        for sensor_id, last_seen, seconds_ago in rows:
            seen_ids.add(sensor_id)
            result.append({
                "sensor_id":   sensor_id,
                "last_seen":   _fmt_ts(last_seen),
                "seconds_ago": int(seconds_ago) if seconds_ago is not None else None,
                "connected":   seconds_ago is not None and seconds_ago < 300,
                "status":      "online" if (seconds_ago is not None and seconds_ago < 300)
                               else "offline",
            })

        for sid in sensor_ids:
            if sid not in seen_ids:
                result.append({
                    "sensor_id":   sid,
                    "last_seen":   None,
                    "seconds_ago": None,
                    "connected":   False,
                    "status":      "never_seen",
                })

        return sorted(result, key=lambda x: x["sensor_id"])
    finally:
        release_conn(conn)


# ==========================================
# HISTORIAL DE ALERTAS PAGINADO
# ==========================================
def get_alerts_history(
    sensor_id: str,
    page: int = 1,
    limit: int = 20,
    level: str | None = None,
    variable: str | None = None,
) -> dict:
    offset = (page - 1) * limit
    filters = ["sensor_id = %s"]
    params  = [sensor_id]

    if level:
        filters.append("level = %s")
        params.append(level)
    if variable:
        filters.append("variable = %s")
        params.append(variable)

    where = " AND ".join(filters)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) FROM sfa_alerts WHERE {where}",
                params
            )
            total = cur.fetchone()[0]

            cur.execute(
                f"""
                SELECT id, level, variable, message, timestamp, value
                FROM sfa_alerts
                WHERE {where}
                ORDER BY timestamp DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset]
            )
            rows = cur.fetchall()

        alerts = [
            {
                "id":        r[0],
                "level":     r[1],
                "variable":  r[2],
                "message":   r[3],
                "timestamp": _fmt_ts(r[4]),
                "value":     round(float(r[5]), 3) if r[5] is not None else None,
            }
            for r in rows
        ]

        return {
            "sensor_id": sensor_id,
            "page":      page,
            "limit":     limit,
            "total":     total,
            "pages":     (total + limit - 1) // limit,
            "alerts":    alerts,
        }
    finally:
        release_conn(conn)


# ==========================================
# HISTORIAL MULTI-SENSOR
# ==========================================
def get_multi_sensor_history(
    sensor_ids: list[str],
    variable: str,
    hours: int = 24,
) -> dict | None:
    if variable not in SFA_VARIABLES:
        return None

    interval = _bucket_interval(hours)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if interval is None:
                cur.execute("""
                    SELECT sensor_id, timestamp, value
                    FROM sfa_readings
                    WHERE sensor_id = ANY(%s)
                      AND variable  = %s
                      AND timestamp >= NOW() - INTERVAL '%s hours'
                    ORDER BY sensor_id, timestamp ASC
                """, (sensor_ids, variable, hours))
            else:
                cur.execute("""
                    SELECT
                        sensor_id,
                        date_bin(%s::interval, timestamp, TIMESTAMPTZ '2001-01-01') AS bucket,
                        AVG(value)                AS avg_val
                    FROM sfa_readings
                    WHERE sensor_id = ANY(%s)
                      AND variable  = %s
                      AND timestamp >= NOW() - INTERVAL '%s hours'
                    GROUP BY sensor_id, bucket
                    ORDER BY sensor_id, bucket ASC
                """, (interval, sensor_ids, variable, hours))

            rows = cur.fetchall()

        series: dict[str, list] = {sid: [] for sid in sensor_ids}
        for sensor_id, ts, value in rows:
            if sensor_id in series:
                series[sensor_id].append({
                    "timestamp": _fmt_ts(ts),
                    "value":     round(float(value), 3) if value is not None else None,
                })

        return {
            "variable": variable,
            "hours":    hours,
            "interval": interval or "raw",
            "unit":     SFA_VARIABLES[variable]["unit"],
            "label":    SFA_VARIABLES[variable]["label"],
            "series":   [
                {"sensor_id": sid, "points": series[sid]}
                for sid in sensor_ids
            ],
        }
    finally:
        release_conn(conn)