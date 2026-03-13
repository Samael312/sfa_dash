import math, random
from datetime import datetime, timedelta, timezone


#Metadatos de las variables SFA
SFA_VARIABLES = {
    "radiacion_solar":          {"unit": "W/m²", "label": "Radciacion solar"},
    "temperatura_ambiente":     {"unit": "°C", "label": "Temperatura ambiente"},
    "corriente_generada":       {"unit": "A", "label": "Corriente generada"},
    "tension_bateria":          {"unit": "V", "label": "Tensión de la batería"},
    "corriente_bateria":        {"unit": "A", "label": "Corriente de la batería"},
    "corriente_carga":          {"unit": "%", "label": "Corriente de carga"},
    "temperatura_bateria":      {"unit": "°C", "label": "Temperatura de la batería"},
}

_state = {"soc": 0.75}  # Estado de carga inicial de la batería (75%)

def _solar(hour):
    """Simula la radiación solar en función de la hora del día."""
    if not  (6.5 <= hour <= 20):
        return 0.0
    
    base = 1000 * math.exp(-0.5 * ((hour - 13) / 2.8) ** 2)  # Pico a las 13:00 con forma de campana
    
    if random.random() < 0.1:  # 10% de probabilidad de nubes
        base *= random.uniform(0.2, 0.5)  # Reducción aleatoria por nubes
    
    return max (0, base + random.gauss(0, 15))

def _t_amb(hour):
    """Simula la temperatura ambiente en función de la hora del día."""
    phase = (hour - 6) / 24 * 2 * math.pi  # Fase para el ciclo diario
    return 18 + 17 * (0.5-0.5 * math.cos(phase)) + random.gauss(0, 1)  # Oscilación entre 18°C y 35°C

def get_latest_mock() -> dict:
    """Genera un diccionario con los valores simulados de las variables SFA."""
    now = datetime.now(timezone.utc)
    hour = (now.hour + now.minute / 60.0 + 1) % 24  # Hora con fracción, ajustada a un ciclo de 24 horas

    
    rad = _solar(hour)
    t_amb = _t_amb(hour)
    i_gen = max(0, 8.0 * rad / 1000 + random.gauss(0, 0.5))  # Corriente generada proporcional a la radiación
    load = 2.5 + random.gauss(0, 0.05)  # Carga aleatoria entre 2A y 3A
    
    # Simulación del estado de carga de la batería
    net = i_gen -load
    _state["soc"] = max(0.05, min(1.0, _state["soc"] + (net * 5 / 3600)/ 100))  # Ajuste del SOC con un factor de tiempo
    
    v_bat = 11.0 + _state["soc"] * 3.4 + random.gauss(0, 0.03)  # Tensión de la batería entre 11V y 14.4V
    i_bat= net + random.gauss(0, 0.1)  # Corriente de la batería con algo de ruido
    t_bat = t_amb + 3.0 + 0.8 + abs(net) + random.gauss(0, 0.5)  # Temperatura de la batería influenciada por la temperatura ambiente y la corriente neta

    return {
        "timestamp":                now.isoformat(),
        "radiacion_solar":          round(rad, 2),
        "temperatura_ambiente":     round(t_amb, 2),
        "corriente_generada":       round(i_gen, 2),
        "tension_bateria":          round(v_bat, 2),
        "corriente_bateria":        round(i_bat, 2),
        "corriente_carga":          round(max(0, load), 2),
        "temperatura_bateria":      round(t_bat, 2),
        "source":                   "mock"
    }

def get_history_mock(variable: str, hours: int = 24) -> list[dict]:
    """Genera un histórico sintético hacia atrás desde ahora."""
    if variable not in SFA_VARIABLES:
        return []

    now   = datetime.now(timezone.utc)
    points = []
    soc   = 0.75

    for i in range(hours * 12, 0, -1):          # 1 punto cada 5 min
        ts   = now - timedelta(minutes=i * 5)
        hour = (ts.hour + ts.minute / 60.0 + 1) % 24

        rad   = _solar(hour)
        t_amb = _t_amb(hour)
        i_gen = max(0, 8.0 * (rad / 1000) + random.gauss(0, 0.1))
        load  = 2.5
        net   = i_gen - load
        soc   = max(0.05, min(1.0, soc + (net * 5 / 3600) / 100))
        v_bat = 11.0 + soc * 3.4 + random.gauss(0, 0.03)

        values = {
            "radiacion_solar":      round(rad, 1),
            "temperatura_ambiente": round(t_amb, 1),
            "corriente_generada":   round(i_gen, 2),
            "tension_bateria":      round(v_bat, 2),
            "corriente_bateria":    round(net + random.gauss(0, 0.05), 2),
            "corriente_carga":      round(load, 2),
            "temperatura_bateria":  round(t_amb + 3.0 + 0.8 * abs(net), 1),
        }
        points.append({"timestamp": ts.isoformat(), "value": values[variable]})

    return points

def get_status_mock() -> dict:
    """Estado general del SFA para la cabecera del dashboard."""
    latest = get_latest_mock()
    soc_pct = round(_state["soc"] * 100, 1)

    alerts = []
    if latest["tension_bateria"] <= 11.8:
        alerts.append({"level": "warning", "variable": "tension_bateria",
                        "message": f"Tensión baja: {latest['tension_bateria']} V"})
    if latest["temperatura_bateria"] >= 45:
        alerts.append({"level": "warning", "variable": "temperatura_bateria",
                        "message": f"Temperatura alta: {latest['temperatura_bateria']} °C"})

    return {
        "mode":            "mock",
        "connected":       True,
        "last_update":     latest["timestamp"],
        "battery_percent": soc_pct,
        "solar_generating": latest["radiacion_solar"] > 50,
        "active_alerts":   len(alerts),
        "alerts":          alerts,
        "variables_meta":  SFA_VARIABLES,
    }