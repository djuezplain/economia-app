#!/usr/bin/env bash
# Se ejecuta a diario vía economia-backup.timer (systemd) en la Raspberry
# Pi. Vuelca la base de datos a `backups/` (bind-mount fuera de Docker, así
# que sobrevive a recrear los contenedores y se puede copiar con `scp`) y
# purga lo de más de 14 días.
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p backups
TIMESTAMP=$(date +%F_%H%M)
FILE="backups/economia_${TIMESTAMP}.sql.gz"

docker compose exec -T postgres pg_dump -U economia_app economia_dev | gzip > "$FILE"
echo "economia-app: copia guardada en $FILE ($(du -h "$FILE" | cut -f1))."

find backups -name 'economia_*.sql.gz' -mtime +14 -delete
