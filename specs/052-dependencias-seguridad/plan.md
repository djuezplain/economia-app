# Plan — Spec 052 (dependencias con avisos de seguridad e IP real del cliente)

**Fase:** 2 de 4 (pendiente de aprobación)
**Parte de:** spec 052 aprobada. Toca `package.json` (raíz y backend), `package-lock.json`, `backend/src/main.ts`, `docker-compose.yml` y `deploy/README.md`.

## 0. Decisiones de diseño

1. **Primero actualizar dentro de los rangos ya permitidos y solo después forzar versiones.** La mayoría de los avisos son dependencias transitivas cuyas versiones corregidas ya entran en los rangos de sus padres: `proxy-addr` 2.0.8, `body-parser` 2.4.0 y `qs` 6.16.1 (de `express` 5.3.0, a través de `@nestjs/platform-express` 12.2.0), y `brace-expansion` 1.1.21 y 2.1.7. Se resuelven subiendo la familia `@nestjs/*` a 12.2.0 y regenerando el lockfile para esos paquetes.
2. **`overrides` solo donde un padre fija la versión vulnerable:**
   - `multer`: `@nestjs/platform-express` 12.2.0 lo fija en 2.4.0, que sigue siendo vulnerable. Se fuerza 2.5.0 con `overrides`, y la dependencia directa del backend pasa de 2.2.0 a 2.5.0 exacta (sigue habiendo una sola copia, motivo de fijarlo en la spec 048).
   - `uuid` (moderado): `exceljs` pide `^8`. Se prueba a forzar 11.1.1 (sigue exportando `v4`, lo único que usa `exceljs`). Si la importación de Excel o sus tests fallan, se quita y se anota como riesgo aceptado: `exceljs` solo usa v4, y el aviso es de v3/v5/v6 con búfer.
3. **Versiones muy recientes (decisión para Diego):** las correcciones de `multer` 2.5.0 y `body-parser` 2.4.0 son de hace 2 días y `@nestjs/*` 12.2.0 de hace 5. Las versiones recién publicadas tienen más riesgo de venir manipuladas (ataques a la cadena de suministro). Propuesta: aplicarlas ya, porque corrigen fallos explotables (sobre todo `multer`, que recibe las subidas de documentos y copias), con versiones exactas y comprobando las firmas y la procedencia con `npm audit signatures`. La alternativa es esperar a que cumplan dos semanas (en torno al 5 de noviembre).
4. **IP del cliente: confiar solo en `cloudflared`, no en cualquiera.** En producción hay dos caminos al backend: desde la red local, directo al puerto 3000 y sin proxy; y desde fuera, por Cloudflare → contenedor `cloudflared` → `backend:3000`. El único proxy legítimo es `cloudflared`.
   - `docker-compose.yml` define una red propia con subred fija y da a `cloudflared` una IP fija.
   - `trust proxy` pasa de `true` a una variable `TRUSTED_PROXIES` (direcciones o subredes, separadas por comas, en el formato que entiende Express). En producción vale la IP de `cloudflared`; sin la variable, no se confía en ninguna cabecera.
   - Así, con una petición directa, `X-Forwarded-For` se ignora y la IP es la de la conexión. Con una petición por el túnel, Express toma la última dirección que añadió Cloudflare, la del cliente real (spec H3 criterio 2), y no las que el cliente hubiera puesto antes en la cabecera. `X-Forwarded-Proto` solo se cree cuando viene de `cloudflared`, lo que mantiene la cookie `secure` por el túnel (criterio 3).
5. **Dependencias de desarrollo (decisión para Diego en lo que no tiene arreglo fácil):**
   - Con corrección sin cambio de versión mayor: `vite`, `vitest`, `@vitest/*`, `fast-uri`, `source-map-js` y `serialize-javascript`. Se actualizan.
   - Sin corrección razonable:
     - `drizzle-kit`: npm propone "bajar" a 0.18, una versión mayor antigua que rompería las migraciones.
     - `@nestjs/mau`: es la CLI opcional de despliegue en la nube de NestJS, que el proyecto no usa.
   - Propuesta: quitar `@nestjs/mau` (eso elimina además los avisos de `tmp`, `undici`, `inquirer` y `external-editor`) y anotar `drizzle-kit`: solo se ejecuta en el arranque para aplicar migraciones y en desarrollo, nunca con datos de usuarios.

## 1. Cambios

- **`backend/package.json`:** `@nestjs/common`, `core`, `platform-express`, `testing` y el resto de la familia en `^12.2.0`; `multer` en `2.5.0`; `joi` en `^18.3.0`; fuera `@nestjs/mau` (si se aprueba §0.5).
- **`package.json` (raíz):** `overrides` con `multer: 2.5.0` y, si funciona, `uuid: 11.1.1` para `exceljs`.
- **`package-lock.json`:** regenerado con `npm install` y después `npm update` de `express`, `proxy-addr`, `body-parser`, `qs` y `brace-expansion`; comprobado con `npm ls` que de cada uno hay una sola versión corregida.
- **`backend/src/main.ts`:** `app.set('trust proxy', parseTrustedProxies(process.env.TRUSTED_PROXIES))`, con una función pura en `common/trusted-proxies.ts` (lista vacía → `false`). Se corrige el comentario.
- **`backend/src/config/env.validation.ts`:** `TRUSTED_PROXIES` opcional, validado (direcciones IP o CIDR separadas por comas).
- **`docker-compose.yml`:** red `economia` con subred `172.30.0.0/24`; `cloudflared` en `172.30.0.10`; `TRUSTED_PROXIES: 172.30.0.10` en el backend. Los demás servicios, en la misma red sin IP fija.
- **`deploy/README.md`:** qué cambia, que la primera actualización recrea la red (lo hace `docker compose up -d` de `update.sh`), y qué hacer si la subred chocara con la red de casa.

## 2. Tests

- **Unitarios de `parseTrustedProxies`:** vacío, una IP, varias, CIDR, espacios, y valor no válido (error al arrancar).
- **e2e de la IP del cliente** (con `TRUSTED_PROXIES` de prueba):
  - Sin proxy de confianza: cambiar `X-Forwarded-For` en cada intento no permite saltarse el límite de inicios de sesión.
  - Con la conexión como proxy de confianza (`127.0.0.1`, simulando el túnel): la IP registrada en la sesión es la última de `X-Forwarded-For` (la que añade Cloudflare), no una puesta antes por el cliente. `X-Forwarded-Proto: https` marca la cookie como `secure`.
  - Sin proxy de confianza, `X-Forwarded-Proto: https` no marca la cookie como `secure` por sí sola (mismo comportamiento que una conexión HTTP directa).
- **Regresión:** todas las suites (unitarios, e2e en serie y frontend). Se repasan expresamente las de subida de documentos, importación de copias `.zip` (`multer`) y de Excel (`exceljs`, `uuid`).
- **`npm audit --omit=dev`:** sin avisos altos ni críticos. `npm audit signatures`: todas las firmas y la procedencia verificadas.
- **A mano en el navegador:** subir un documento, importar una copia `.zip` y un Excel, e iniciar sesión.

## 3. Fuera de este plan

- Automatizar el `npm audit` (spec §2).
- Comprobar en la Raspberry Pi real que el túnel sigue funcionando con la red nueva. Lo hará Diego al desplegar, con los pasos del README; aquí se prueba con `docker compose config` y los tests.

## 4. Orden de implementación propuesto (para `tasks.md`)

1. `@nestjs/*` 12.2.0, `multer` 2.5.0 (directa y `overrides`) y `joi`; regenerar el lockfile; `npm audit signatures`; tests de subidas e importación.
2. Transitivas (`express`, `proxy-addr`, `body-parser`, `qs`, `brace-expansion`) y `uuid` de `exceljs`; tests de Excel.
3. Dependencias de desarrollo (§0.5).
4. `TRUSTED_PROXIES` y `parseTrustedProxies`, con sus tests unitarios y e2e.
5. `docker-compose.yml` y `deploy/README.md`.
6. Cierre: todas las suites, `npm audit`, revisión a mano y checklist.
