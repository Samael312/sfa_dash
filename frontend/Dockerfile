# Etapa 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# La URL del backend se inyecta en build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Etapa 2: Nginx
FROM nginx:stable-alpine

# Instalar gettext para envsubst
RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html

# Plantilla de configuración de Nginx
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Script de arranque que sustituye $PORT y lanza nginx
CMD ["sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]