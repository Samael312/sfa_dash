import os
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# MQTT — Broker Railway (sin autenticación)
# ==========================================
MQTT_BROKER     = os.getenv("MQTT_BROKER", "autorack.proxy.rlwy.net")
MQTT_PORT       = int(os.getenv("MQTT_PORT", 35512))
MQTT_TOPIC_BASE = os.getenv("MQTT_TOPIC_BASE", "universidad/jaen")
MQTT_TOPIC_SUB  = f"{MQTT_TOPIC_BASE}/+/+"

# ==========================================
# PostgreSQL — Railway
# ==========================================
DB_URL = os.getenv("DB_URL")

if not DB_URL:
    raise RuntimeError(
        "❌ DB_URL no está definida. "
        "Añade DB_URL=postgresql://... a tu .env"
    )

# ==========================================
# Variables SFA — metadatos compartidos
# ==========================================
SFA_VARIABLES = {
    "radiacion_solar":      {"unit": "W/m²", "label": "Radiación solar"},
    "temperatura_ambiente": {"unit": "°C",   "label": "Temperatura ambiente"},
    "corriente_generada":   {"unit": "A",    "label": "Corriente generada"},
    "tension_bateria":      {"unit": "V",    "label": "Tensión de la batería"},
    "corriente_bateria":    {"unit": "A",    "label": "Corriente de la batería"},
    "corriente_carga":      {"unit": "A",    "label": "Corriente de carga"},
    "temperatura_bateria":  {"unit": "°C",   "label": "Temperatura de la batería"},
}