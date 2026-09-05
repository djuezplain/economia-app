# Desplegar en una Raspberry Pi

Guía paso a paso para correr esta app en una Raspberry Pi, accesible solo desde tu red local, con arranque automático, actualización automática al hacer `git push` y copias de seguridad diarias de la base de datos.

Pensado para una Pi 4 o 5 (ARM64). No cubre exponerla a Internet con dominio/HTTPS — solo acceso en LAN.

## 0. Antes de empezar

Estas dos cosas ya vienen fijadas en el código, tenlas en cuenta:

- **El email no se envía de verdad.** Verificación de cuenta y recuperación de contraseña escriben el email en los logs del backend (`docker compose logs backend`), no lo mandan a ninguna bandeja de entrada — no hay ningún proveedor SMTP configurado en el proyecto. Para uso personal es manejable (miras el log y copias el enlace); si quieres que se envíe de verdad, es una tarea aparte.
- **El modo offline (PWA) no funciona del todo sin HTTPS.** El Service Worker necesita HTTPS (salvo en `localhost`) — en LAN por IP/hostname plano, la app funciona con normalidad pero no cachea para abrir sin conexión. Si más adelante quieres exponerla con un dominio, Caddy (ya usado para servir el frontend) puede darte HTTPS automático casi sin tocar nada.

## 1. Preparar la Raspberry Pi

1. Flashea **Raspberry Pi OS Lite (64-bit)** con [Raspberry Pi Imager](https://www.raspberrypi.com/software/) — el 64-bit es imprescindible, las imágenes Docker de este despliegue son ARM64. En las opciones avanzadas del Imager (el icono de engranaje, o Ctrl+Shift+X), activa SSH y configura tu usuario/contraseña y tu WiFi antes de grabar la tarjeta — así arranca ya accesible por red, sin monitor ni teclado.
2. Arranca la Pi, espera un minuto, y conéctate por SSH desde tu Mac:
   ```bash
   ssh <tu-usuario>@raspberrypi.local
   ```
   Si `raspberrypi.local` no resuelve, mira la IP asignada en tu router.
3. **Recomendado: reserva de IP fija en tu router** para la Pi (por su dirección MAC), así la IP no cambia y no tienes que reconstruir la imagen del frontend cada vez que el router reparte otra. Alternativa sin tocar el router: usar `raspberrypi.local` (funciona por Avahi/mDNS, ya viene activado en Raspberry Pi OS) como `FRONTEND_URL`/`VITE_API_BASE_URL` más abajo, en vez de una IP.

## 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Cierra la sesión SSH y vuelve a entrar para que el grupo `docker` tenga efecto (o `newgrp docker`). Comprueba:

```bash
docker compose version
```

El script oficial ya deja el servicio `docker` habilitado para arrancar solo con la Pi (`systemctl is-enabled docker` debería decir `enabled`) — es la base del automatismo de "arranca solo si se va la luz", junto con `restart: unless-stopped` que ya llevan los 3 servicios en `docker-compose.yml`.

## 3. Clonar el repo y configurar

GitHub ya no acepta usuario/contraseña para clonar por HTTPS, y la Pi va a hacer `git fetch` sola cada 10 minutos (deploy/update.sh) sin nadie delante para teclear nada — lo más limpio es una **clave SSH de solo lectura (deploy key)**, específica de este repo, en vez de un token de tu cuenta de GitHub.

```bash
# 1) Genera una clave dedicada a esta Pi, sin passphrase (el timer
#    automático no puede teclearla).
ssh-keygen -t ed25519 -C "raspberrypi-economia-app" -f ~/.ssh/economia_deploy_key -N ""

# 2) Muestra la clave pública y cópiala.
cat ~/.ssh/economia_deploy_key.pub
```

En GitHub: entra en el repo → **Settings → Deploy keys → Add deploy key**. Pega la clave pública, ponle un título (p. ej. "raspberrypi"), y **deja "Allow write access" sin marcar** (la Pi solo necesita leer).

```bash
# 3) Dile a SSH que use esa clave para github.com.
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/economia_deploy_key
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

# 4) Comprueba que autentica (dirá "Hi djuezplain/economia-app! ...").
ssh -T git@github.com

# 5) Clona por SSH, no por HTTPS.
git clone git@github.com:djuezplain/economia-app.git
cd economia-app
cp .env.example .env
```

*(Alternativa más rápida pero menos recomendable para algo automático: un [token de acceso personal](https://github.com/settings/tokens) con permiso `repo`, pegado como "contraseña" al clonar por HTTPS — pero un token de cuenta da más permisos de los que la Pi necesita y hay que gestionar su caducidad; la deploy key es de solo lectura y de este repo únicamente.)*

Edita `.env` y rellena, como mínimo:

- `POSTGRES_PASSWORD` — una contraseña cualquiera, solo la usan los contenedores entre sí.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — genera cada uno con:
  ```bash
  openssl rand -base64 32
  ```
- `FRONTEND_URL` — la IP o el `raspberrypi.local` de tu Pi, sin puerto (el frontend se sirve por el 80). Ejemplo: `http://192.168.1.50` o `http://raspberrypi.local`.
- `VITE_API_BASE_URL` — lo mismo pero con el puerto del backend, `:3000`. Ejemplo: `http://192.168.1.50:3000`.

Dejas vacíos `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` si no vas a usar login con Google (el backend responde 503 de forma controlada en ese caso, sin errores raros) — `GOOGLE_CALLBACK_URL` déjalo con el valor de ejemplo tal cual (el backend sí exige que tenga formato de URL válido, aunque no se use).

## 4. Primer arranque

```bash
docker compose up -d --build
```

La primera vez tarda varios minutos (construye las 2 imágenes y descarga Postgres). El backend aplica las migraciones de base de datos él solo al arrancar.

Comprueba que todo está bien:

```bash
docker compose ps                        # los 3 servicios en estado "running"/"healthy"
curl http://localhost:3000/health         # {"status":"ok","db":"ok",...}
```

Y abre `http://<ip-o-hostname-de-la-pi>` desde el navegador de otro dispositivo de tu red — deberías ver la pantalla de login. Regístrate, y saca el enlace de verificación de `docker compose logs backend` (ver §0):

```bash
# Log completo del email (destinatario, asunto y el texto con el enlace):
docker compose logs backend | grep -A5 "DEV EMAIL"

# O directamente la URL, sin buscar a mano:
docker compose logs backend | grep -o 'http://[^ ]*verify-email[^ ]*' | tail -1
```

Copia esa URL en el navegador (o ábrela desde el móvil si está en la misma red) para confirmar la cuenta. El mismo truco sirve para el email de "olvidé mi contraseña" (busca `reset-password` en vez de `verify-email`).

## 5. Automatizar la actualización al hacer `git push`

Un temporizador de `systemd` en la propia Pi comprueba cada 10 minutos si hay commits nuevos en `origin/master` y, si los hay, actualiza y reconstruye solo — no hace falta abrir ningún puerto hacia fuera ni configurar nada en GitHub.

```bash
chmod +x deploy/update.sh deploy/backup.sh
```

Los ficheros `deploy/economia-update.service`/`economia-backup.service` asumen usuario `pi` y el repo clonado en `/home/pi/economia-app` — si tu usuario o la ruta son distintos (por ejemplo si elegiste otro usuario al flashear la tarjeta), edítalos antes de copiarlos: cambia `User`, `WorkingDirectory` y `ExecStart` en los dos ficheros. Una forma rápida de hacerlo con tu usuario real:

```bash
sed -i "s#/home/pi/economia-app#$HOME/economia-app#g; s#^User=pi#User=$USER#" \
  deploy/economia-update.service deploy/economia-backup.service
```

Importante que `User` sea tu propio usuario, no `root`: si el repo pertenece a un usuario y el servicio corre como otro, `git` se niega a operar con un error de "posesión dudosa" (`detected dubious ownership`).

```bash
sudo cp deploy/economia-update.service deploy/economia-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now economia-update.timer
```

Comprueba que funciona sin esperar 10 minutos:

```bash
sudo systemctl start economia-update.service
journalctl -u economia-update -f
```

## 6. Automatizar las copias de seguridad

Mismo mecanismo, un volcado diario de la base de datos a `backups/` (dentro del propio repo, ya excluido de git) a las 03:30, con purga automática de lo que tenga más de 14 días.

```bash
sudo cp deploy/economia-backup.service deploy/economia-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now economia-backup.timer
```

Fuerza una copia de prueba:

```bash
sudo systemctl start economia-backup.service
ls -lh backups/
```

Para copiar las copias de seguridad a tu Mac de vez en cuando (recomendado — la tarjeta SD de una Pi puede fallar):

```bash
scp <tu-usuario>@raspberrypi.local:~/economia-app/backups/*.sql.gz .
```

## 7. Comandos útiles

```bash
docker compose logs -f backend       # logs en vivo del backend (incluye los "emails")
docker compose logs -f frontend
docker compose restart backend       # reiniciar un servicio sin reconstruir
docker compose down                  # parar todo (los datos de Postgres persisten en el volumen)
systemctl status economia-update.timer economia-backup.timer   # próxima ejecución de cada timer
journalctl -u economia-update --since today                    # historial de actualizaciones
```

## 8. Restaurar una copia de seguridad

```bash
gunzip -c backups/economia_2026-09-01_0330.sql.gz | docker compose exec -T postgres psql -U economia_app -d economia_dev
```

## 9. Acceso desde fuera de tu red (Cloudflare Tunnel)

Opcional. Todo lo anterior deja la app accesible solo en tu WiFi. Cloudflare Tunnel añade acceso desde cualquier sitio (datos móviles, otra red) con HTTPS real, sin abrir puertos en el router ni depender de que tu operador te dé una IP pública fija — `cloudflared` hace una conexión saliente desde la Pi hacia Cloudflare, así que no hay nada que exponer hacia dentro.

Bonus: como aquí sí hay HTTPS de verdad (no solo en `localhost`), el modo offline (PWA, §0) empieza a funcionar del todo.

Necesitas un dominio propio (cualquier registrador vale, el más barato sirve) apuntando a Cloudflare como DNS.

1. Crea una cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up) y añade tu dominio (**Add a site**, plan Free) — te dará dos nameservers que tienes que cambiar en tu registrador. Tarda de minutos a un par de horas en propagarse.
2. En el dashboard, ve a **Zero Trust → Networks → Tunnels → Create a tunnel**, elige tipo **Cloudflared**, y ponle un nombre (p. ej. `economia-app`).
3. En la pestaña **Install and run a connector**, copia el valor que va después de `--token` del comando que te muestra (es un token largo, no la URL del comando entero).
4. En **Public Hostnames**, añade dos:
   - `app.tudominio.com` → Service tipo `HTTP`, URL `frontend:80`
   - `api.tudominio.com` → Service tipo `HTTP`, URL `backend:3000`
   (usa los nombres de los servicios de `docker-compose.yml` tal cual, no `localhost` ni una IP — `cloudflared` corre en la misma red de Docker que el resto).
5. En tu `.env` de la Pi:
   - `CLOUDFLARE_TUNNEL_TOKEN` — el token del paso 3.
   - `FRONTEND_URL=https://app.tudominio.com`
   - `VITE_API_BASE_URL=https://api.tudominio.com`
6. Arranca (o reconstruye) incluyendo el perfil `tunnel` — sin este flag, `cloudflared` no se levanta:
   ```bash
   docker compose --profile tunnel up -d --build
   ```
   (el `--build` es necesario aquí porque `VITE_API_BASE_URL` cambió — se incrusta en el bundle del frontend en tiempo de build, ver comentario en `.env.example`).
7. Comprueba desde el móvil **con el WiFi apagado** (datos móviles) que `https://app.tudominio.com` carga. Los enlaces de verificación de email (§0) ahora llevan ese dominio en vez de la IP local, pero se siguen sacando igual de los logs:
   ```bash
   docker compose logs backend | grep -o 'https://[^ ]*verify-email[^ ]*' | tail -1
   ```

Para quitarlo más adelante: deja `CLOUDFLARE_TUNNEL_TOKEN` vacío, borra el túnel en el dashboard de Cloudflare, y vuelve a arrancar sin `--profile tunnel` (`docker compose up -d`) — el resto del despliegue sigue funcionando igual, solo en LAN.
