# Spec 052 — Dependencias con avisos de seguridad e IP real del cliente

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** el `npm audit` que salió al añadir `sharp` en la spec 051. Diego pidió tratarlo aparte. Parte de la rama de la spec 051 (PR #95), porque las dos tocan `package-lock.json`.

## 0. Qué hay hoy

`npm audit --omit=dev` (solo lo que se despliega) da 9 avisos: 1 crítico, 5 altos y 3 moderados. Con las dependencias de desarrollo, 25.

| Paquete | Gravedad | Llega por | Qué es |
|---|---|---|---|
| `proxy-addr` 2.0.7 | crítica | `express` | La IP del cliente se puede suplantar con direcciones IPv4 en forma IPv6 (GHSA-jqcg-44mw-7w3h). |
| `multer` 2.2.0 | alta | directa (fijada en la spec 048) y `@nestjs/platform-express` | Seis avisos de denegación de servicio y uno que permite saltarse el límite de tamaño de un fichero. |
| `body-parser` 2.3.0 | alta | `express` | Denegación de servicio con bytes de más tras un cuerpo comprimido. |
| `joi` 18.2.x | alta | directa (validación del `.env`) | Sustitución del prototipo y expresión regular lenta. Solo valida la configuración al arrancar, así que no le llegan datos de usuarios. |
| `brace-expansion` | alta | `exceljs` → `archiver` → `glob` | Denegación de servicio por recursión. No recibe datos de usuarios. |
| `qs` 6.15.3 | moderada | `express` | Denegación de servicio con cadenas de consulta manipuladas. |
| `uuid` 8.3.2 | moderada | `exceljs` | Falta una comprobación de límites en v3/v5/v6 con un búfer; `exceljs` solo usa v4. La única corrección que ofrece npm es volver a `exceljs` 3 (versión mayor anterior). |

**Hallazgo al revisarlo:** `main.ts` tiene `app.set('trust proxy', true)`. El comentario dice que es seguro porque solo hay un proxy delante, pero con `true` Express toma como IP del cliente la **primera** de `X-Forwarded-For`, que la escribe el propio cliente. Cualquiera puede mandar `X-Forwarded-For: 1.2.3.4` y cambiar la IP que ve la app. Lo usan el limitador de intentos (inicio de sesión y demás, por IP) y el registro de sesiones. Con una IP distinta en cada petición, el limitador deja de servir. Es un problema más serio y más directo que el aviso de `proxy-addr`.

## 1. Historias de usuario

**H1 — Lo que se despliega no tiene avisos graves**

- Criterio 1: `npm audit --omit=dev` no da ningún aviso crítico ni alto.
- Criterio 2: los moderados que queden solo pueden ser los que no tienen corrección sin romper algo (por ejemplo, `uuid` dentro de `exceljs` si forzarlo rompe la importación de Excel). Cada uno queda anotado en `tasks.md` con el motivo y por qué no afecta a la app.
- Criterio 3: `multer` deja de estar fijado en una versión vulnerable. Se conserva el motivo de fijarlo (una sola copia instalada, spec 048) con la versión corregida.
- Criterio 4: todo sigue funcionando igual: todos los tests (unitarios, e2e y frontend) en verde, y la subida de documentos, la importación de copias `.zip` y la importación de Excel probadas a mano. También que todo sigue funcionando en `linux/arm64` (la Raspberry Pi).

**H2 — Dependencias de desarrollo**

- Criterio 1: se actualizan las que tengan corrección sin cambio de versión mayor.
- Criterio 2: las que queden se anotan con el motivo. No se despliegan, así que no bloquean.

**H3 — La IP del cliente no se puede falsificar**

- Criterio 1: una cabecera `X-Forwarded-For` enviada por el cliente no cambia la IP que usan el limitador de intentos ni el registro de sesiones, ni conectando directamente al backend en la red local ni a través del Cloudflare Tunnel.
- Criterio 2: a través del túnel, la IP es la del cliente real (no la de `cloudflared`), para que el limitador siga distinguiendo a cada uno.
- Criterio 3: la cookie de sesión sigue siendo `secure` cuando se entra por HTTPS a través del túnel (el motivo original de `trust proxy`, spec 001).
- Criterio 4: un test e2e demuestra que cambiar `X-Forwarded-For` no permite saltarse el límite de intentos de inicio de sesión.

## 2. Fuera de alcance

- **Revisar el código de las dependencias** más allá de los avisos publicados.
- **Automatizar el `npm audit`** (CI, Dependabot): se puede proponer aparte.
- **Cambiar de librería de Excel.**

## 3. Decisiones tomadas con Diego

1. Se trata aparte de la spec 051 (respuesta "sí" al cierre de la 051).
2. Se incluye la IP del cliente (H3), aunque no la pidió expresamente, porque es lo que da sentido real al aviso crítico de `proxy-addr`.

---
**Siguiente paso:** `plan.md`.
