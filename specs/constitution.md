# Constitution del proyecto — App de Gestión de Economía Personal

Este documento fija las decisiones y principios que **no se vuelven a discutir** en cada spec. Cualquier spec, plan o tarea que contradiga esto debe justificarlo explícitamente o actualizar primero este documento.

## 1. Proceso: Spec Driven Development

Cada funcionalidad (feature) avanza por 4 fases, en orden, sin saltarse ninguna:

1. **Spec** (`specs/NNN-feature/spec.md`) — qué debe hacer la funcionalidad y por qué, en lenguaje de negocio/usuario. Sin detalles de implementación. Se revisa y aprueba antes de pasar a la fase 2.
2. **Plan** (`specs/NNN-feature/plan.md`) — diseño técnico: modelo de datos, endpoints/contratos, decisiones de arquitectura, casos límite. Se revisa y aprueba antes de pasar a la fase 3.
3. **Tasks** (`specs/NNN-feature/tasks.md`) — desglose en tareas pequeñas, ordenadas, cada una verificable de forma independiente (idealmente con su propio test).
4. **Implementación** — se ejecutan las tareas una a una. Cada tarea completada se valida contra su criterio de aceptación antes de pasar a la siguiente. Ninguna tarea se da por completada si rompe un test existente.

Regla de oro: **no se escribe código de producción sin una tarea de un `tasks.md` aprobado que lo respalde.**

## 2. Principios del producto

- **Aislamiento de datos por usuario es innegociable.** Todo dato económico pertenece a un único usuario. Toda consulta a base de datos que devuelva datos económicos debe filtrar explícitamente por `user_id` del usuario autenticado. Esto se prueba con tests de autorización (un usuario nunca puede leer/escribir datos de otro), no solo se asume del diseño.
- **Los cálculos financieros no llevan lógica "a ojo".** Totales, medias, % de ahorro, plusvalías/minusvalías e impuestos estimados se implementan como funciones puras, con tests unitarios que cubran los casos del Excel origen (ver `docs/requisitos_app_economia.md`).
- **Seguridad de datos financieros por defecto**: HTTPS siempre, contraseñas con hash (argon2 o bcrypt, nunca en texto plano ni cifrado reversible), tokens de sesión con expiración, protección CSRF/XSS/SQLi.
- **Cumplimiento RGPD**: exportación y borrado de datos de usuario deben existir desde el primer feature de usuarios (no se posponen a "más adelante").

## 3. Stack técnico (confirmado)

| Capa | Elección |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Gráficos | Recharts |
| Backend | Node.js + NestJS + TypeScript |
| Base de datos | PostgreSQL |
| ORM | Drizzle ORM (ver nota) |
| Autenticación | JWT (access + refresh token) + OAuth2 con Google |
| Hash de contraseñas | argon2 |
| Testing backend | Vitest (unitario + integración) |
| Testing frontend | Vitest + Testing Library |
| Linting | oxlint (backend y frontend) |
| Rate limiting | Guard propio en memoria (`common/rate-limit.guard.ts`), ver nota |
| Monorepo | `/frontend`, `/backend`, `/specs`, `/docs` en un único repositorio, npm workspaces |

Cambiar cualquier fila de esta tabla requiere actualizar este documento explícitamente, no decidirlo dentro de un plan de feature.

> **Nota de implementación (T0.2, grupo 0 de `specs/001-auth/tasks.md`):** el plan original proponía Prisma y Jest. Al implementar, los binarios nativos de Prisma (`schema-engine`) devolvían 403 al descargarse desde `binaries.prisma.sh` en este entorno — un problema de la infraestructura de descarga de Prisma, no del código — y la última versión de NestJS CLI genera los proyectos con Vitest/oxlint por defecto en vez de Jest/ESLint. Se optó por **Drizzle ORM** (sin binario nativo, solo TypeScript + el driver `pg`) y por mantener Vitest/oxlint tal como los generan las herramientas oficiales, en vez de forzar Jest/ESLint contra la corriente. Ambos cambios están verificados funcionando de extremo a extremo (migraciones aplicadas contra Postgres real, backend y frontend arrancando, tests en verde).
>
> **Nota de implementación (T2.1, grupo 2):** `plan.md` §4 sugería `@nestjs/throttler` como ejemplo de rate limiting. Al implementar, ninguna versión publicada de `@nestjs/throttler` (máx. 6.5.0 en ese momento) declaraba compatibilidad de peer dependency con `@nestjs/common@12` (recién salido); forzar la instalación (`--force`) rompía la resolución de módulos de `@nestjs/testing` y los tests dejaban de arrancar. Se implementó en su lugar un guard propio en memoria (`common/rate-limit.guard.ts`, decorador `@RateLimit`). Limitación conocida y documentada en el propio código: al ser en memoria, solo es correcto con una única instancia del backend; si en el futuro se despliega con varias instancias detrás de un balanceador, hay que sustituirlo por un contador compartido (p. ej. Redis) — queda anotado como deuda técnica, no bloquea la spec 001.
>
> **Nota de implementación (T3.1–T3.3, grupo 3 — login y sesiones):**
> - **Trade-off de no-enumeración aceptado en el bloqueo de cuenta (spec H4, criterio 3):** el mensaje de "cuenta bloqueada temporalmente" es, por diseño, un mensaje distinto del genérico "email o contraseña incorrectos". Esto es una fuga de información mínima y deliberada: una cuenta que no existe nunca puede llegar a ese estado, así que un atacante que agote 5 intentos sobre un email y reciba el mensaje de bloqueo sabe que esa cuenta existe. Es el mismo trade-off que aceptan la inmensa mayoría de sistemas de login del sector (revelar existencia solo tras comportamiento sostenido de fuerza bruta, nunca en el primer intento) y se documenta aquí en vez de complicar el diseño para cerrar un canal de fuga de muy bajo impacto práctico.
> - **`AuthGuard` no es un guard global de Nest (`APP_GUARD`)**, a diferencia de como lo describe `plan.md` §3 ("un AuthGuard global extrae userId..."). La mayoría de rutas de `/auth` son públicas (login, registro, refresh...) y deben seguir siéndolo; se aplica explícitamente con `@UseGuards(AuthGuard)` en cada ruta que sí requiere autenticación. El efecto para el resto de specs es el mismo: ninguna ruta de datos económicos se implementará sin `@UseGuards(AuthGuard, RequireActiveUserGuard)`.
> - **Cookie del refresh token en `path: '/auth'`**, no `/api/auth` como asumía `plan.md` §4: esta app no usa un prefijo global `/api` (las rutas cuelgan directamente de `/auth`, `/users`, etc.), así que el path de la cookie se ajustó al real.
> - Se añadió la columna `users.last_failed_login_at` (no estaba en el modelo de datos original de `plan.md` §1) para poder aplicar correctamente el criterio "5 intentos fallidos **en 15 minutos**": sin un timestamp del último fallo, el contador `failed_login_count` no podría distinguir "5 fallos hace una hora, dispersos" de "5 fallos seguidos ahora mismo".
>
> **Nota de implementación (T4.1–T4.2, grupo 4 — login con Google):**
> - **Sin PKCE**, a diferencia de como lo menciona `plan.md` §2 ("Authorization Code + PKCE"). PKCE existe para proteger clientes *públicos* (apps móviles, SPA que hablan directamente con el proveedor OAuth) que no pueden guardar un secreto; aquí el flujo lo inicia y termina el backend (cliente confidencial, con `client_secret`), que es exactamente el caso para el que el flujo estándar de Authorization Code ya es suficiente. `passport-google-oauth20`/`passport-oauth2` tampoco lo implementan de fábrica. Se documenta como corrección del plan, no como deuda pendiente.
> - **Sin `state` anti-CSRF explícito**: la implementación por defecto de `state` en `passport-oauth2` requiere sesión de servidor (`express-session`), que esta app no usa en ningún otro sitio y no se quiere introducir solo para esto. El flujo sigue protegido por `client_secret` + `redirect_uri` exacta registrada en Google; queda anotado como mejora posible (un store de `state` sin sesión, p. ej. firmado en una cookie de corta duración) si en el futuro se prioriza.
> - **El callback devuelve el access token a la SPA por query string** (`FRONTEND_URL/oauth-callback?accessToken=...`), no por JSON: `GET /auth/google/callback` lo visita el navegador con una navegación completa (Google redirige ahí directamente), así que no hay una llamada `fetch` del frontend a la que responder con JSON. El token queda brevemente visible en la URL/historial hasta que `OAuthCallbackPage` lo lee y navega a "/" con `replace` (no añade una entrada nueva al historial con el token). Se acepta como trade-off pragmático para esta versión; una alternativa más robusta (código de un solo uso que se canjea por los tokens desde una llamada `fetch` normal) queda anotada como mejora futura si se prioriza.
> - **`GoogleStrategy` se registra siempre**, incluso sin `GOOGLE_CLIENT_ID`/`SECRET` configurados (siguen vacíos en este entorno local, igual que ocurrió con GitHub — ver spec 001, decisiones de proceso): `passport-oauth2` exige un `clientID` no vacío en su constructor o tumba el arranque de Nest. Se le pasa un valor de relleno (`"not-configured"`) cuando no hay credenciales reales, y un guard dedicado (`GoogleConfiguredGuard`) bloquea `/auth/google` y `/auth/google/callback` con un 503 claro mientras tanto, en vez de dejar que el intento llegue a fallar de forma confusa contra Google. Cuando Diego cree unas credenciales OAuth reales en Google Cloud Console, basta con rellenar `GOOGLE_CLIENT_ID`/`SECRET`/`GOOGLE_CALLBACK_URL` en `.env` — no hace falta tocar código.

## 4. Convenciones de código

- TypeScript en modo `strict` en ambos proyectos.
- Commits en formato [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Una tarea de `tasks.md` = como mucho un commit (o PR) enfocado; nada de commits que mezclen varias tareas.
- Toda función de cálculo financiero (sección "Cálculos automáticos" del documento de requisitos) debe tener test unitario antes de considerarse hecha.

## 5. Fuera del control de esta constitution

Decisiones de UI/UX visual, nombres exactos de componentes, y detalles de estilo se deciden en el plan de cada feature, no aquí.

---
*Referencia: el documento completo de requisitos funcionales/no funcionales vive en `docs/requisitos_app_economia.md`.*
