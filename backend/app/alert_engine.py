"""
alert_engine.py
---------------
Motor de evaluación de alertas extendido. Añade:

1. Alertas de tendencia:
   - Detecta variables que llevan N lecturas consecutivas subiendo o bajando
   - Configurable por variable: pendiente mínima y número de lecturas
   - Escribe en sfa_alerts con level='trend_warning' o 'trend_critical'

2. Silenciar alertas (snooze):
   - Nueva tabla: alert_snooze (sensor_id, variable, until_ts)
   - Si una variable está en snooze, sus alertas no se evalúan hasta que expire

Tabla nueva a crear en PostgreSQL:
    CREATE TABLE IF NOT EXISTS alert_snooze (
        id         BIGSERIAL    PRIMARY KEY,
        sensor_id  VARCHAR(64)  NOT NULL,
        variable   VARCHAR(64), -- NULL = snooze todo el sensor
        until_ts   TIMESTAMPTZ  NOT NULL,
        created_at TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE (sensor_id, variable)
    );

Colocar en: backend/app/alert_engine.py
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from app.config.db import get_conn, release_conn
from app.config.settings import SFA_VARIABLES


def _fmt_ts(ts) -> str:
    return ts.isoformat() if isinstance(ts, datetime) else str(ts)


# ==========================================
# CONFIGURACIÓN DE TENDENCIAS POR VARIABLE
# ==========================================
# min_slope: cambio mínimo por lectura para considerar tendencia
# window:    número de lecturas consecutivas a analizar
# warn_mult: multiplicador de slope para warning
# crit_mult: multiplicador de slope para critical

TREND_CONFIG = {
    "v_bateria":  {"window": 6,  "min_slope": -0.01, "direction": "down",  "level_warn": "warning",  "level_crit": "critical"},
    "temp_bat":   {"window": 5,  "min_slope":  0.5,  "direction": "up",    "level_warn": "warning",  "level_crit": "critical"},
    "temp_pan":   {"window": 5,  "min_slope":  0.8,  "direction": "up",    "level_warn": "warning",  "level_crit": "critical"},
    "temp_amb":   {"window": 8,  "min_slope":  1.0,  "direction": "up",    "level_warn": "warning",  "level_crit": "critical"},
    "i_generada": {"window": 10, "min_slope": -0.2,  "direction": "down",  "level_warn": "warning",  "level_crit": "critical"},
}

# Ventana de supresión: no re-disparar una alerta de tendencia
# si ya se disparó en los últimos N minutos
TREND_SUPPRESS_MINUTES = 30


# ==========================================
# SNOOZE (SILENCIAR ALERTAS)
# ==========================================
def snooze_alert(sensor_id: str, variable: Optional[str], hours: float) -> dict:
    """
    Silencia las alertas de una variable (o todo el sensor si variable=None)
    durante `hours` horas.
    """
    until = datetime.now(timezone.utc) + timedelta(hours=hours)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO alert_snooze (sensor_id, variable, until_ts)
                VALUES (%s, %s, %s)
                ON CONFLICT (sensor_id, variable)
                DO UPDATE SET until_ts = EXCLUDED.until_ts, created_at = NOW()
                RETURNING id, sensor_id, variable, until_ts
            """, (sensor_id, variable, until))
            row = cur.fetchone()
        conn.commit()
        return {
            "id":        row[0],
            "sensor_id": row[1],
            "variable":  row[2],
            "until_ts":  _fmt_ts(row[3]),
            "hours":     hours,
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def cancel_snooze(sensor_id: str, variable: Optional[str] = None) -> int:
    """
    Cancela el snooze de una variable (o todo el sensor si variable=None).
    Devuelve el número de registros eliminados.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if variable is None:
                cur.execute(
                    "DELETE FROM alert_snooze WHERE sensor_id = %s",
                    (sensor_id,)
                )
            else:
                cur.execute(
                    "DELETE FROM alert_snooze WHERE sensor_id = %s AND variable = %s",
                    (sensor_id, variable)
                )
            deleted = cur.rowcount
        conn.commit()
        return deleted
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def get_snoozes(sensor_id: str) -> list[dict]:
    """Lista los snoozes activos de un sensor."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, sensor_id, variable, until_ts, created_at
                FROM alert_snooze
                WHERE sensor_id = %s
                  AND until_ts > NOW()
                ORDER BY variable NULLS FIRST
            """, (sensor_id,))
            rows = cur.fetchall()
        return [
            {
                "id":         r[0],
                "sensor_id":  r[1],
                "variable":   r[2],
                "until_ts":   _fmt_ts(r[3]),
                "created_at": _fmt_ts(r[4]),
            }
            for r in rows
        ]
    finally:
        release_conn(conn)


def _is_snoozed(sensor_id: str, variable: str, conn) -> bool:
    """
    Comprueba si una variable está en snooze.
    Considera snooze de la variable específica O del sensor completo (variable=NULL).
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM alert_snooze
            WHERE sensor_id = %s
              AND (variable = %s OR variable IS NULL)
              AND until_ts > NOW()
            LIMIT 1
        """, (sensor_id, variable))
        return cur.fetchone() is not None


# ==========================================
# ALERTAS DE TENDENCIA
# ==========================================
def evaluate_trends(sensor_id: str) -> list[dict]:
    """
    Analiza las últimas N lecturas de cada variable configurada en TREND_CONFIG.
    Detecta tendencias sostenidas (subida o bajada continua) y genera alertas.

    Lógica:
    1. Obtener las últimas `window` lecturas de la variable
    2. Calcular la pendiente media (regresión lineal simple)
    3. Si la pendiente supera min_slope en la dirección configurada:
       - Calcular nivel (warning/critical) según la magnitud
       - Comprobar snooze
       - Comprobar si ya se disparó en los últimos TREND_SUPPRESS_MINUTES
       - Insertar alerta en sfa_alerts
    """
    triggered = []
    conn = get_conn()

    try:
        with conn.cursor() as cur:
            for variable, cfg in TREND_CONFIG.items():
                if variable not in SFA_VARIABLES:
                    continue

                # Obtener últimas `window` lecturas
                cur.execute("""
                    SELECT value, timestamp
                    FROM sfa_readings
                    WHERE sensor_id = %s AND variable = %s
                    ORDER BY timestamp DESC
                    LIMIT %s
                """, (sensor_id, variable, cfg["window"]))
                rows = cur.fetchall()

                if len(rows) < cfg["window"]:
                    continue  # No hay suficientes datos

                # Ordenar cronológicamente (rows viene DESC)
                rows = list(reversed(rows))
                values = [float(r[0]) for r in rows]

                # Pendiente media: diferencia entre último y primero / ventana
                slope = (values[-1] - values[0]) / (len(values) - 1)

                # Comprobar si la tendencia supera el umbral en la dirección correcta
                direction = cfg["direction"]
                min_slope = cfg["min_slope"]

                triggered_flag = False
                if direction == "down" and slope <= min_slope:
                    triggered_flag = True
                elif direction == "up" and slope >= min_slope:
                    triggered_flag = True

                if not triggered_flag:
                    continue

                # Comprobar snooze
                if _is_snoozed(sensor_id, variable, conn):
                    continue

                # Comprobar supresión: ¿ya se disparó hace menos de N minutos?
                cur.execute("""
                    SELECT 1 FROM sfa_alerts
                    WHERE sensor_id = %s
                      AND variable  = %s
                      AND message   LIKE '%%[tendencia]%%'
                      AND timestamp >= NOW() - INTERVAL '%s minutes'
                    LIMIT 1
                """, (sensor_id, variable, TREND_SUPPRESS_MINUTES))
                if cur.fetchone():
                    continue  # Ya se notificó recientemente

                # Determinar nivel según magnitud de la pendiente
                abs_slope = abs(slope)
                if abs_slope >= abs(min_slope) * 3:
                    level = cfg["level_crit"]
                else:
                    level = cfg["level_warn"]

                # Construir mensaje
                direction_label = "bajando" if direction == "down" else "subiendo"
                unit = SFA_VARIABLES[variable]["unit"]
                label = SFA_VARIABLES[variable]["label"]
                last_val = round(values[-1], 2)
                slope_str = f"{slope:+.3f} {unit}/lectura"
                message = (
                    f"[tendencia] {label} lleva {cfg['window']} lecturas {direction_label}: "
                    f"{slope_str} · Valor actual: {last_val} {unit}"
                )

                ts = datetime.now(timezone.utc)

                # Obtener reading_id del último valor
                cur.execute("""
                    SELECT id FROM sfa_readings
                    WHERE sensor_id = %s AND variable = %s
                    ORDER BY timestamp DESC LIMIT 1
                """, (sensor_id, variable))
                reading_row = cur.fetchone()
                reading_id  = reading_row[0] if reading_row else None

                cur.execute("""
                    INSERT INTO sfa_alerts
                        (reading_id, timestamp, sensor_id, level, variable, value, message)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (reading_id, ts, sensor_id, level, variable, last_val, message))

                alert_id = cur.fetchone()[0]
                triggered.append({
                    "id":        alert_id,
                    "sensor_id": sensor_id,
                    "level":     level,
                    "variable":  variable,
                    "message":   message,
                    "timestamp": _fmt_ts(ts),
                    "slope":     round(slope, 4),
                    "window":    cfg["window"],
                })

        conn.commit()

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)

    return triggered


# ==========================================
# EVALUACIÓN COMPLETA (umbral + tendencia)
# ==========================================
def evaluate_all(sensor_id: str) -> dict:
    """
    Ejecuta evaluación de umbrales (api_client.evaluate_alerts)
    y evaluación de tendencias, devolviendo todas las alertas generadas.
    """
    from app.api_client import evaluate_alerts as evaluate_thresholds

    threshold_alerts = evaluate_thresholds(sensor_id)
    trend_alerts     = evaluate_trends(sensor_id)

    return {
        "sensor_id":        sensor_id,
        "threshold_alerts": threshold_alerts,
        "trend_alerts":     trend_alerts,
        "total_new":        len(threshold_alerts) + len(trend_alerts),
    }