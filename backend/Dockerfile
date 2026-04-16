# Usamos una imagen oficial y ligera de Python
FROM python:3.11-slim

# Evita que Python escriba archivos .pyc y fuerza que la salida de consola no se bloquee
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Creamos el directorio de trabajo
WORKDIR /app

# Copiamos solo los requirements primero (para aprovechar la caché de Docker)
COPY requirements.txt .

# Instalamos las dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY . .

# Comando de arranque adaptado para Railway (evalúa $PORT en tiempo de ejecución)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]