"""
ws_manager.py
-------------
Gestor de conexiones WebSocket + listener de PostgreSQL NOTIFY.

Flujo:
  bridge.py  →  INSERT en sfa_readings  →  NOTIFY sfa_update
  FastAPI    →  LISTEN sfa_update       →  broadcast a clientes WS

Colocar en: backend/app/ws_manager.py
"""

import asyncio
import json
import select
from typing import Dict, Set

import psycopg2
import psycopg2.extensions
from fastapi import WebSocket

from app.config.settings import DB_URL


# ==========================================
# GESTOR DE CONEXIONES WEBSOCKET
# ==========================================
class WSManager:
    def __init__(self):
        # sensor_id → set de WebSockets suscritos
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, sensor_id: str):
        await ws.accept()
        if sensor_id not in self._connections:
            self._connections[sensor_id] = set()
        self._connections[sensor_id].add(ws)
        print(f"🔌 WS conectado: sensor={sensor_id} "
              f"total={len(self._connections[sensor_id])}")

    def disconnect(self, ws: WebSocket, sensor_id: str):
        if sensor_id in self._connections:
            self._connections[sensor_id].discard(ws)
            if not self._connections[sensor_id]:
                del self._connections[sensor_id]
        print(f"🔌 WS desconectado: sensor={sensor_id}")

    async def broadcast(self, sensor_id: str, message: dict):
        """Envía mensaje a todos los clientes suscritos a sensor_id."""
        sockets = self._connections.get(sensor_id, set()).copy()
        dead = set()
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(ws, sensor_id)

    @property
    def total_connections(self) -> int:
        return sum(len(v) for v in self._connections.values())

    @property
    def active_sensors(self) -> list:
        return list(self._connections.keys())


ws_manager = WSManager()


# ==========================================
# LISTENER POSTGRESQL LISTEN/NOTIFY
# ==========================================
async def start_pg_listener():
    """
    Corrutina asyncio que escucha el canal 'sfa_update' de PostgreSQL.
    Cuando llega un NOTIFY, hace broadcast al WebSocket del sensor.

    Se lanza en lifespan de FastAPI:
        asyncio.create_task(start_pg_listener())
    """
    print("🎧 Iniciando listener PostgreSQL LISTEN/NOTIFY...")
    loop = asyncio.get_event_loop()

    def _connect():
        conn = psycopg2.connect(DB_URL)
        conn.set_isolation_level(
            psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT
        )
        with conn.cursor() as cur:
            cur.execute("LISTEN sfa_update;")
        print("✅ PostgreSQL LISTEN activo en canal 'sfa_update'")
        return conn

    conn = await loop.run_in_executor(None, _connect)

    while True:
        try:
            # Esperar actividad en el socket de PG (200ms timeout)
            def _poll_once():
                if select.select([conn], [], [], 0.2)[0]:
                    conn.poll()
                return list(conn.notifies)

            notifies = await loop.run_in_executor(None, _poll_once)

            for notify in notifies:
                conn.notifies.clear()
                try:
                    payload = json.loads(notify.payload)
                    sensor_id = payload.get("sensor_id")
                    if sensor_id:
                        await ws_manager.broadcast(sensor_id, {
                            "type":      "reading",
                            "sensor_id": sensor_id,
                            "variable":  payload.get("variable"),
                            "value":     payload.get("value"),
                            "timestamp": payload.get("timestamp"),
                            "source":    payload.get("source", "mqtt"),
                        })
                except json.JSONDecodeError:
                    print(f"⚠️  Payload NOTIFY inválido: {notify.payload}")

            await asyncio.sleep(0.1)

        except Exception as e:
            print(f"❌ PG LISTEN error: {e}. Reconectando en 5s...")
            await asyncio.sleep(5)
            try:
                conn = await loop.run_in_executor(None, _connect)
            except Exception as re:
                print(f"❌ Reconexión PG fallida: {re}")
                await asyncio.sleep(10)