"""
soc_engine.py
-------------
Estimador de Estado de Carga (SOC) para batería de plomo-ácido 12V 7.2Ah.

Método:
  1. Calibración OCV (Open Circuit Voltage):
     Se detecta cuando la batería está en reposo (i_generada ≈ 0 e i_carga ≈ 0
     durante al menos REST_WINDOW_MIN minutos). Condición ideal: ~04:00 AM.
     A partir del voltaje en reposo se obtiene el SOC inicial mediante la
     curva OCV→SOC para plomo-ácido 12V.

  2. Coulomb Counting (integración de corriente):
     SOC(t) = SOC(t-1) + (I_gen(t) - I_carga(t)) × Δt_h / C_nom × 100
     donde Δt_h es el intervalo en horas y C_nom = 7.2 Ah.

  3. Tabla en PostgreSQL `soc_state`:
     Guarda el SOC actual y la última calibración OCV por sensor.

Tabla a crear (bridge.py ya la añade si no existe):
    CREATE TABLE IF NOT EXISTS soc_state (
        sensor_id       VARCHAR(64)      PRIMARY KEY,
        soc_pct         DOUBLE PRECISION NOT NULL DEFAULT 50.0,
        last_calibrated TIMESTAMPTZ,
        calibration_soc DOUBLE PRECISION,
        updated_at      TIMESTAMPTZ      DEFAULT NOW()
    );
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from app.config.db import get_conn, release_conn

# ── Parámetros de la batería ──────────────────────────────────
C_NOM_AH        = 7.2      # Capacidad nominal (Ah)
SOC_MIN         = 5.0      # SOC mínimo permitido (%)
SOC_MAX         = 100.0    # SOC máximo permitido (%)

# Umbral de corriente para considerar batería "en reposo"
# ACS730 tiene ruido ≈ ±0.05A con señal centrada en 2.5V
REST_CURRENT_TH = 0.10     # A  — por encima de esto NO es reposo
REST_WINDOW_MIN = 30       # minutos de reposo continuos para calibrar

# Hora de calibración preferente (madrugada, sin solar, sin carga)
OCV_CALIB_HOUR  = 4        # 04:00 AM UTC

# Curva OCV → SOC para plomo-ácido 12V (a 25°C, en reposo)
# Fuente: curvas típicas de batería VRLA/SLA 12V
# Interpolación lineal por tramos
OCV_TABLE = [
    (10.50,  0.0),
    (11.00,  5.0),
    (11.50, 10.0),
    (11.80, 20.0),
    (12.00, 30.0),
    (12.20, 50.0),
    (12.40, 60.0),
    (12.60, 75.0),
    (12.80, 85.0),
    (13.00, 95.0),
    (13.20, 100.0),
]


def ocv_to_soc(voltage: float) -> float:
    """
    Convierte voltaje OCV (en reposo) a SOC (%) mediante interpolación lineal
    sobre la curva característica de la batería plomo-ácido 12V 7.2Ah.
    """
    if voltage <= OCV_TABLE[0][0]:
        return OCV_TABLE[0][1]
    if voltage >= OCV_TABLE[-1][0]:
        return OCV_TABLE[-1][1]

    for i in range(len(OCV_TABLE) - 1):
        v0, s0 = OCV_TABLE[i]
        v1, s1 = OCV_TABLE[i + 1]
        if v0 <= voltage <= v1:
            # Interpolación lineal
            t = (voltage - v0) / (v1 - v0)
            return round(s0 + t * (s1 - s0), 1)

    return 50.0  # fallback


def _ensure_table(conn):
    """Crea la tabla soc_state si no existe."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS soc_state (
                sensor_id       VARCHAR(64)      PRIMARY KEY,
                soc_pct         DOUBLE PRECISION NOT NULL DEFAULT 50.0,
                last_calibrated TIMESTAMPTZ,
                calibration_soc DOUBLE PRECISION,
                updated_at      TIMESTAMPTZ      DEFAULT NOW()
            );
        """)
    conn.commit()


def get_soc_state(sensor_id: str) -> dict:
    """
    Devuelve el estado SOC actual del sensor desde la BD.
    Si no existe, devuelve SOC=50% (valor inicial conservador).
    """
    conn = get_conn()
    try:
        _ensure_table(conn)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT soc_pct, last_calibrated, calibration_soc, updated_at
                FROM soc_state
                WHERE sensor_id = %s
            """, (sensor_id,))
            row = cur.fetchone()

        if not row:
            return {
                "sensor_id":       sensor_id,
                "soc_pct":         50.0,
                "last_calibrated": None,
                "calibration_soc": None,
                "updated_at":      None,
                "method":          "default",
            }

        soc_pct, last_cal, cal_soc, updated = row
        ts_since = None
        if last_cal:
            delta = datetime.now(timezone.utc) - last_cal.replace(tzinfo=timezone.utc)
            ts_since = round(delta.total_seconds() / 3600, 1)  # horas

        return {
            "sensor_id":           sensor_id,
            "soc_pct":             round(float(soc_pct), 1),
            "last_calibrated":     last_cal.isoformat() if last_cal else None,
            "hours_since_calib":   ts_since,
            "calibration_soc":     round(float(cal_soc), 1) if cal_soc else None,
            "updated_at":          updated.isoformat() if updated else None,
            "method":              "coulomb_counting",
        }
    finally:
        release_conn(conn)


def _is_rest_condition(sensor_id: str, conn, window_min: int = REST_WINDOW_MIN) -> tuple[bool, Optional[float]]:
    """
    Comprueba si la batería ha estado en reposo durante `window_min` minutos.
    Condición de reposo: i_generada < REST_CURRENT_TH AND i_carga < REST_CURRENT_TH.

    Devuelve (is_rest, avg_voltage_during_rest).
    """
    with conn.cursor() as cur:
        # Lecturas de corriente en la ventana
        cur.execute("""
            SELECT variable, AVG(value) as avg_val, COUNT(*) as n
            FROM sfa_readings
            WHERE sensor_id = %s
              AND variable IN ('i_generada', 'i_carga', 'v_bateria')
              AND timestamp >= NOW() - make_interval(mins => %s)
            GROUP BY variable
        """, (sensor_id, window_min))
        rows = {r[0]: {"avg": float(r[1]), "n": int(r[2])} for r in cur.fetchall()}

    i_gen   = rows.get("i_generada", {}).get("avg", 999.0)
    i_carga = rows.get("i_carga",    {}).get("avg", 999.0)
    v_bat   = rows.get("v_bateria",  {}).get("avg", None)
    n       = rows.get("v_bateria",  {}).get("n",   0)

    if n < 3:
        return False, None  # No hay suficientes datos

    is_rest = (i_gen < REST_CURRENT_TH) and (i_carga < REST_CURRENT_TH)
    return is_rest, v_bat


def try_calibrate_ocv(sensor_id: str) -> Optional[dict]:
    """
    Intenta calibrar el SOC mediante OCV si la batería está en reposo.
    Se aplica preferentemente en el rango 03:00–05:00 UTC (sin solar, sin carga).

    Devuelve el nuevo estado SOC si se calibró, None si no era el momento.
    """
    now_utc = datetime.now(timezone.utc)

    # Verificar ventana horaria preferente (03:00–05:00 UTC)
    # Fuera de esta ventana también calibra si la batería lleva suficiente tiempo en reposo
    in_preferred_window = (OCV_CALIB_HOUR - 1) <= now_utc.hour <= (OCV_CALIB_HOUR + 1)

    conn = get_conn()
    try:
        _ensure_table(conn)

        # Comprobar si ya se calibró hace menos de 20 horas (evitar re-calibración)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT last_calibrated FROM soc_state WHERE sensor_id = %s
            """, (sensor_id,))
            row = cur.fetchone()

        if row and row[0]:
            hours_ago = (now_utc - row[0].replace(tzinfo=timezone.utc)).total_seconds() / 3600
            if hours_ago < 20:
                return None  # Ya se calibró hoy

        # Comprobar reposo (ventana más larga en horas preferentes)
        window = REST_WINDOW_MIN if in_preferred_window else 60
        is_rest, avg_voltage = _is_rest_condition(sensor_id, conn, window)

        if not is_rest or avg_voltage is None:
            return None

        # Calcular SOC por OCV
        new_soc = ocv_to_soc(avg_voltage)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO soc_state (sensor_id, soc_pct, last_calibrated, calibration_soc, updated_at)
                VALUES (%s, %s, NOW(), %s, NOW())
                ON CONFLICT (sensor_id)
                DO UPDATE SET
                    soc_pct         = EXCLUDED.soc_pct,
                    last_calibrated = EXCLUDED.last_calibrated,
                    calibration_soc = EXCLUDED.calibration_soc,
                    updated_at      = NOW()
            """, (sensor_id, new_soc, new_soc))
        conn.commit()

        return {
            "sensor_id":       sensor_id,
            "soc_pct":         new_soc,
            "method":          "ocv_calibration",
            "voltage_used":    round(avg_voltage, 3),
            "calibrated_at":   now_utc.isoformat(),
        }

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def update_soc_coulomb(sensor_id: str) -> dict:
    """
    Actualiza el SOC mediante Coulomb Counting usando las últimas lecturas
    de corriente desde la última actualización guardada en soc_state.

    Algoritmo:
      1. Leer SOC actual y timestamp de la última actualización
      2. Obtener lecturas de i_generada e i_carga desde ese timestamp
      3. Para cada par de lecturas consecutivas: ΔAh = (I_gen - I_carga) × Δt_h
      4. SOC_nuevo = SOC_actual + ΔAh_total / C_NOM × 100
      5. Clamp a [SOC_MIN, SOC_MAX]
      6. Guardar en soc_state

    Devuelve el nuevo estado SOC.
    """
    conn = get_conn()
    try:
        _ensure_table(conn)

        # 1. Estado actual
        with conn.cursor() as cur:
            cur.execute("""
                SELECT soc_pct, updated_at
                FROM soc_state
                WHERE sensor_id = %s
            """, (sensor_id,))
            row = cur.fetchone()

        now_utc = datetime.now(timezone.utc)

        if not row:
            # Primera vez: intentar calibrar por OCV, sino usar 50%
            calib = try_calibrate_ocv(sensor_id)
            if calib:
                return calib
            # Sin calibración disponible, inicializar con 50%
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO soc_state (sensor_id, soc_pct, updated_at)
                    VALUES (%s, 50.0, NOW())
                    ON CONFLICT (sensor_id) DO NOTHING
                """, (sensor_id,))
            conn.commit()
            return {"sensor_id": sensor_id, "soc_pct": 50.0, "method": "default"}

        current_soc, last_updated = row
        current_soc = float(current_soc)

        # Asegurar timezone en last_updated
        if last_updated and last_updated.tzinfo is None:
            last_updated = last_updated.replace(tzinfo=timezone.utc)

        # 2. Lecturas de corriente desde la última actualización
        since_ts = last_updated if last_updated else (now_utc - timedelta(hours=1))

        with conn.cursor() as cur:
            cur.execute("""
                SELECT variable, value, timestamp
                FROM sfa_readings
                WHERE sensor_id = %s
                  AND variable IN ('i_generada', 'i_carga')
                  AND timestamp > %s
                ORDER BY timestamp ASC
            """, (sensor_id, since_ts))
            readings = cur.fetchall()

        if not readings:
            return get_soc_state(sensor_id)

        # 3. Organizar lecturas por timestamp para el trapecio
        # Construir series temporales paralelas interpoladas
        gen_series  = [(ts, v) for var, v, ts in readings if var == 'i_generada']
        load_series = [(ts, v) for var, v, ts in readings if var == 'i_carga']

        # Calcular ΔAh neto usando la serie que tenga más puntos
        # Si hay pocas lecturas, usar valor medio × tiempo
        delta_ah = 0.0

        if gen_series and load_series:
            # Combinar timestamps únicos
            all_ts = sorted(set([t for t, _ in gen_series] + [t for t, _ in load_series]))

            def interpolate(series, ts_query):
                """Interpolación lineal sobre la serie más cercana."""
                if not series:
                    return 0.0
                for i in range(len(series) - 1):
                    t0, v0 = series[i]
                    t1, v1 = series[i + 1]
                    if t0 <= ts_query <= t1:
                        dt = (t1 - t0).total_seconds()
                        if dt == 0:
                            return v0
                        alpha = (ts_query - t0).total_seconds() / dt
                        return v0 + alpha * (v1 - v0)
                # Fuera del rango: usar el extremo más cercano
                if ts_query < series[0][0]:
                    return series[0][1]
                return series[-1][1]

            for i in range(len(all_ts) - 1):
                t0, t1 = all_ts[i], all_ts[i + 1]
                dt_h = (t1 - t0).total_seconds() / 3600.0
                if dt_h <= 0 or dt_h > 1.0:  # ignorar gaps > 1h (datos faltantes)
                    continue
                i_gen  = interpolate(gen_series,  t0)
                i_load = interpolate(load_series, t0)
                delta_ah += (i_gen - i_load) * dt_h

        elif gen_series:
            # Solo generación (carga no disponible — no encendida según el tutor)
            for i in range(len(gen_series) - 1):
                t0, v0 = gen_series[i]
                t1, v1 = gen_series[i + 1]
                dt_h = (t1 - t0).total_seconds() / 3600.0
                if 0 < dt_h <= 1.0:
                    delta_ah += ((v0 + v1) / 2.0) * dt_h  # trapecio

        elif load_series:
            # Solo consumo (sin generación)
            for i in range(len(load_series) - 1):
                t0, v0 = load_series[i]
                t1, v1 = load_series[i + 1]
                dt_h = (t1 - t0).total_seconds() / 3600.0
                if 0 < dt_h <= 1.0:
                    delta_ah -= ((v0 + v1) / 2.0) * dt_h  # consumo resta

        # 4. Nuevo SOC
        delta_soc = (delta_ah / C_NOM_AH) * 100.0
        new_soc   = current_soc + delta_soc
        new_soc   = round(max(SOC_MIN, min(SOC_MAX, new_soc)), 1)

        # 5. Guardar
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO soc_state (sensor_id, soc_pct, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (sensor_id)
                DO UPDATE SET soc_pct = EXCLUDED.soc_pct, updated_at = NOW()
            """, (sensor_id, new_soc))
        conn.commit()

        return {
            "sensor_id":  sensor_id,
            "soc_pct":    new_soc,
            "delta_ah":   round(delta_ah, 4),
            "delta_soc":  round(delta_soc, 2),
            "method":     "coulomb_counting",
            "readings_n": len(readings),
        }

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        release_conn(conn)


def compute_soc(sensor_id: str) -> dict:
    """
    Punto de entrada principal. Orden de prioridad:
      1. Si es hora de madrugada y la batería está en reposo → calibrar OCV
      2. Si no → Coulomb counting desde la última actualización

    Devuelve dict con soc_pct y metadatos del método usado.
    """
    now_utc = datetime.now(timezone.utc)
    in_calib_window = (OCV_CALIB_HOUR - 1) <= now_utc.hour <= (OCV_CALIB_HOUR + 1)

    if in_calib_window:
        calib = try_calibrate_ocv(sensor_id)
        if calib:
            return calib

    return update_soc_coulomb(sensor_id)