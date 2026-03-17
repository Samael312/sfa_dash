import os
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# MQTT — Broker Railway (sin autenticación)
# ==========================================
MQTT_BROKER     = os.getenv("MQTT_BROKER", "autorack.proxy.rlwy.net")
MQTT_PORT       = int(os.getenv("MQTT_PORT", 35512))

# Prefijo base: universidad/jaen/{sensor_id}/{variable}
# El bridge se suscribe con wildcards para capturar cualquier
# sensor y cualquier variable dinámicamente.
MQTT_TOPIC_BASE = os.getenv("MQTT_TOPIC_BASE", "universidad/jaen")
MQTT_TOPIC_SUB  = f"{MQTT_TOPIC_BASE}/+/+"   # suscripción wildcard MQTT

# ==========================================
# PostgreSQL — Railway
# ==========================================
PG_HOST     = os.getenv("PGHOST",     "YOUR_HOST.railway.app")
PG_PORT     = int(os.getenv("PGPORT", 5432))
PG_DATABASE = os.getenv("PGDATABASE", "railway")
PG_USER     = os.getenv("PGUSER",     "postgres")
PG_PASSWORD = os.getenv("PGPASSWORD", "YOUR_PASSWORD")

DATABASE_URL = (
    f"postgresql://{PG_USER}:{PG_PASSWORD}"
    f"@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"
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