#!/usr/bin/env bash
# Se ejecuta periódicamente vía economia-update.timer (systemd) en la
# Raspberry Pi. Comprueba si hay commits nuevos en origin/master y, si los
# hay, actualiza el repo y reconstruye/relanza los contenedores —
# `docker compose up -d --build` solo reconstruye lo que haya cambiado.
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch origin master

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "economia-app: sin cambios nuevos ($LOCAL)."
  exit 0
fi

echo "economia-app: actualizando de $LOCAL a $REMOTE…"
git reset --hard origin/master
docker compose up -d --build
echo "economia-app: actualización completada."
