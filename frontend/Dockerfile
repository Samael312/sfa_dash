# Etapa 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Producción con Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Creamos el directorio de templates de Nginx
RUN mkdir -p /etc/nginx/templates

# Creamos la plantilla. Nginx sustituirá ${PORT} automáticamente al arrancar.
RUN echo 'server { \
    listen ${PORT}; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/templates/default.conf.template

# La imagen base de nginx ya tiene su propio CMD de arranque que ejecuta la sustitución