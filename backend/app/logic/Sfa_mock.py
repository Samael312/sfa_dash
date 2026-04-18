
import asyncio
import json
import math
import random
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from app.config.settings import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC_BASE

PUBLISH_INTERVAL = 10   

# ==========================================
# ESTADO INTERNO DEL SIMULADOR
# ==========================================
_state = {"soc": 0.75}


# ==========================================
# FUNCIONES DE SIMULACIÓN FÍSICA
# ==========================================
def _solar(hour: float) -> float:
    if not (6.5 <= hour <= 20.0):
        return 0.0
    base = 1000 * math.exp(-0.5 * ((hour - 13) / 2.8) ** 2)
    if random.random() < 0.10:
        base *= random.uniform(0.2, 0.5)
    return max(0.0, base + random.gauss(0, 15))


def _t_amb(hour: float) -> float:
    phase = (hour - 6) / 24 * 2 * math.pi
    return 18 + 17 * (0.5 - 0.5 * math.cos(phase)) + random.gauss(0, 1)


def generate_readings() -> dict[str, float]:
    """Genera los valores de todas las variables SFA."""
    now  = datetime.now(timezone.utc)
    hour = (now.hour + now.minute / 60.0 + 1) % 24

    rad   = _solar(hour)
    t_amb = _t_amb(hour)
    i_gen = max(0.0, 8.0 * rad / 1000 + random.gauss(0, 0.5))
    load  = max(0.0, 2.5 + random.gauss(0, 0.05))
    net   = i_gen - load

    _state["soc"] = max(0.05, min(1.0, _state["soc"] + (net * 5 / 3600) / 100))

    v_bat = 11.0 + _state["soc"] * 3.4 + random.gauss(0, 0.03)
    i_bat = net + random.gauss(0, 0.1)
    t_bat = t_amb + 3.0 + 0.8 * abs(net) + random.gauss(0, 0.5)

    return {
        "radiacion_solar":      round(rad,   2),
        "temperatura_ambiente": round(t_amb, 2),
        "corriente_generada":   round(i_gen, 2),
        "tension_bateria":      round(v_bat, 2),
        "corriente_bateria":    round(i_bat, 2),
        "corriente_carga":      round(load,  2),
        "temperatura_bateria":  round(t_bat, 2),
    }


# ==========================================
# CLIENTE MQTT (compartido)
# ==========================================
def _build_client() -> mqtt.Client:
    def on_connect(client, userdata, flags, rc, properties=None):
        if rc == 0:
            print(f"✅ Mock MQTT conectado a {MQTT_BROKER}:{MQTT_PORT}")
        else:
            print(f"❌ Mock MQTT error de conexión: rc={rc}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    return client


# ==========================================
# TAREA ASYNCIO — para usar desde main.py
# ==========================================
async def run_mock(sensor_id: str = "sensor1"):
    """
    Corrutina asyncio que publica datos simulados cada PUBLISH_INTERVAL segundos.
    Llamar con asyncio.create_task(run_mock()) desde el lifespan de FastAPI.
    """
    client = _build_client()
    print(f"⏳ Mock conectando a {MQTT_BROKER}:{MQTT_PORT} como '{sensor_id}'…")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    try:
        while True:
            now      = datetime.now(timezone.utc)
            readings = generate_readings()

            for variable, value in readings.items():
                topic   = f"{MQTT_TOPIC_BASE}/{sensor_id}/{variable}"
                payload = json.dumps({
                    "timestamp": now.isoformat(),
                    "sensor_id": sensor_id,
                    "variable":  variable,
                    "value":     value,
                    "source":    "mock",
                })
                client.publish(topic, payload, qos=1)

            print(
                f"[mock {now.strftime('%H:%M:%S')}] {sensor_id} → "
                f"rad={readings['radiacion_solar']} W/m²  "
                f"v_bat={readings['tension_bateria']} V  "
                f"soc={round(_state['soc'] * 100, 1)} %"
            )
            await asyncio.sleep(PUBLISH_INTERVAL)

    except asyncio.CancelledError:
        print("🛑 Mock detenido.")
    finally:
        client.loop_stop()
        client.disconnect()


# ==========================================
# STANDALONE — python Sfa_mock.py
# ==========================================
if __name__ == "__main__":
    import argparse
    MQTT_BROKER, MQTT_PORT, MQTT_TOPIC_BASE = "autorack.proxy.rlwy.net", 35512, "universidad/jaen"
    parser = argparse.ArgumentParser(description="Simulador SFA — publicador MQTT")
    parser.add_argument("--sensor", default="sensor1")
    args = parser.parse_args()
    #asyncio.run(run_mock(sensor_id=args.sensor))