# Despliegue en Raspberry Pi (ver deploy/README.md). `context: .` en la raíz
# del monorepo, igual que backend/Dockerfile.

# --- Stage 1: build del bundle estático con Vite ---
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root

COPY frontend ./frontend
WORKDIR /app/frontend

# Las variables VITE_* se incrustan en el bundle en tiempo de build — no se
# pueden cambiar arrancando el contenedor con otro valor, hace falta
# reconstruir la imagen si cambia la IP/hostname de la Pi (ver .env.example
# de la raíz).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# --- Stage 2: servir el resultado con Caddy ---
FROM caddy:2-alpine
COPY frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
EXPOSE 80
