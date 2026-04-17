FROM node:20-alpine
WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar el código y compilar Vite
COPY . .

# La URL del backend se inyecta en build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Instalar el servidor estático
RUN npm install -g serve

# Arrancar leyendo la variable de entorno $PORT de Railway
# Si Railway no manda nada, usa el 8080 por defecto
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
