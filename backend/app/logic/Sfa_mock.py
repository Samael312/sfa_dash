"""
Sfa_mock.py
-----------
Simulador de telemetría SFA que publica en MQTT.

Topic pattern:  {MQTT_TOPIC_BASE}/{sensor_id}/{variable}
  e.g.          universidad/jaen/s2/radiacion

Puede ejecutarse como tarea asyncio desde main.py
o como script standalone.
"""

import asyncio
import json
import math
import random
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from app.config.settings import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC_BASE

PUBLISH_INTERVAL = 10   # segundos entre publicaciones

# ==========================================
# ESTADO INTERNO DEL SIMULADOR
# ==========================================
# Diccionario por sensor_id para soportar múltiples instancias
_states: dict[str, dict] = {}


def _get_state(sensor_id: str) -> dict:
    if sensor_id not in _states:
        _states[sensor_id] = {"soc": 0.75}
    return _states[sensor_id]


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


def generate_readings(sensor_id: str = "s1") -> dict[str, float]:
    """Genera los valores de todas las variables SFA para un sensor dado."""
    state = _get_state(sensor_id)
    now   = datetime.now(timezone.utc)
    hour  = (now.hour + now.minute / 60.0 + 1) % 24

    rad   = _solar(hour)
    t_amb = _t_amb(hour)
    i_gen = max(0.0, 8.0 * rad / 1000 + random.gauss(0, 0.5))
    load  = max(0.0, 2.5 + random.gauss(0, 0.05))
    net   = i_gen - load

    state["soc"] = max(0.05, min(1.0, state["soc"] + (net * 5 / 3600) / 100))

    v_bat = 11.0 + state["soc"] * 3.4 + random.gauss(0, 0.03)
    t_bat = t_amb + 3.0 + 0.8 * abs(net) + random.gauss(0, 0.5)

    return {
        "radiacion":   round(rad,   2),
        "temp_amb":    round(t_amb, 2),
        "i_generada":  round(i_gen, 2),
        "v_bateria":   round(v_bat, 2),
        "temp_pan":    round(t_bat, 2),
        "i_carga":     round(load,  2),
        "temp_bat":    round(t_bat, 2),
    }


# ==========================================
# CLIENTE MQTT (compartido)
# ==========================================
def _build_client(client_id: str = "") -> mqtt.Client:
    def on_connect(client, userdata, flags, rc, properties=None):
        code = rc if isinstance(rc, int) else rc.value
        if code == 0:
            print(f"✅ Mock MQTT [{client_id}] conectado a {MQTT_BROKER}:{MQTT_PORT}")
        else:
            print(f"❌ Mock MQTT [{client_id}] error de conexión: rc={code}")

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    except AttributeError:
        client = mqtt.Client(client_id=client_id)

    client.on_connect = on_connect
    return client


# ==========================================
# TAREA ASYNCIO — para usar desde main.py
# ==========================================
async def run_mock(sensor_id: str = "s1", stop_event: asyncio.Event | None = None):
    """
    Corrutina asyncio que publica datos simulados cada PUBLISH_INTERVAL segundos.

    Args:
        sensor_id:   ID del sensor a simular (e.g. 's1', 's2')
        stop_event:  asyncio.Event opcional; si se setea, la corrutina para limpiamente.

    Llamar con:
        task = asyncio.create_task(run_mock('s2', stop_event=my_event))
    """
    client_id = f"sfa-mock-{sensor_id}"
    client = _build_client(client_id)

    print(f"⏳ Mock [{sensor_id}] conectando a {MQTT_BROKER}:{MQTT_PORT}…")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        print(f"❌ Mock [{sensor_id}] no pudo conectar al broker: {e}")
        return

    client.loop_start()

    try:
        while True:
            # Parar si se señaliza el evento
            if stop_event and stop_event.is_set():
                print(f"🛑 Mock [{sensor_id}] detenido por stop_event.")
                break

            now      = datetime.now(timezone.utc)
            readings = generate_readings(sensor_id)

            for variable, value in readings.items():
                # Topic: universidad/jaen/s2/radiacion
                topic   = f"{MQTT_TOPIC_BASE}/{sensor_id}/{variable}"
                payload = json.dumps({
                    "timestamp": now.isoformat(),
                    "sensor_id": sensor_id,
                    "variable":  variable,
                    "value":     value,
                    "source":    "mock",
                })
                client.publish(topic, payload, qos=1)

            state = _get_state(sensor_id)
            print(
                f"[mock {sensor_id} {now.strftime('%H:%M:%S')}] "
                f"rad={readings['radiacion']} W/m²  "
                f"v_bat={readings['v_bateria']} V  "
                f"soc={round(state['soc'] * 100, 1)} %"
            )

            # Esperar PUBLISH_INTERVAL, pero comprobar stop_event cada segundo
            for _ in range(PUBLISH_INTERVAL):
                if stop_event and stop_event.is_set():
                    break
                await asyncio.sleep(1)

    except asyncio.CancelledError:
        print(f"🛑 Mock [{sensor_id}] cancelado.")
    finally:
        client.loop_stop()
        client.disconnect()
        print(f"🔒 Mock [{sensor_id}] desconectado.")


# ==========================================
# STANDALONE — python Sfa_mock.py
# ==========================================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Simulador SFA — publicador MQTT")
    parser.add_argument("--sensor", default="s2", help="ID del sensor a simular")
    args = parser.parse_args()

    print(f"🚀 Iniciando simulador standalone para sensor '{args.sensor}'")
    print(f"   Topic base: {MQTT_TOPIC_BASE}")
    print(f"   Broker:     {MQTT_BROKER}:{MQTT_PORT}")
    asyncio.run(run_mock(sensor_id=args.sensor))