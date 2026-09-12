# Despliegue en Raspberry Pi (ver deploy/README.md). Se construye con
# `context: .` en la raíz del monorepo (docker-compose.yml) porque el
# lockfile (npm workspaces) cubre backend y frontend a la vez.
FROM node:22-bookworm-slim

# `argon2` (hash de contraseñas, constitution.md §3) usa un módulo nativo —
# si npm no encuentra un binario precompilado para esta combinación exacta
# de plataforma/arquitectura (p. ej. ARM64), lo compila él solo. Estas
# herramientas son la red de seguridad para que esa compilación funcione en
# vez de fallar el build.
#
# `tesseract-ocr`/`tesseract-ocr-spa` (spec 034, plan.md §2/§10): no es un
# paquete npm, es el binario que `ReceiptOcrService` invoca como subproceso
# — tiene que estar en la imagen del backend, no solo en la máquina de
# desarrollo.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
    tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Solo los manifiestos primero: si no cambian las dependencias, Docker
# reutiliza la capa de `npm ci` en el siguiente build (relevante para el
# despliegue automático — deploy/update.sh reconstruye en cada push).
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root

COPY backend ./backend
WORKDIR /app/backend
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# `drizzle-kit migrate` aplica solo las migraciones pendientes (seguro de
# repetir en cada arranque/actualización, plan.md de spec 011 §2 usa el
# mismo criterio de idempotencia) antes de levantar la app — así una
# actualización automática que trae una migración nueva la aplica sola.
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/main"]
