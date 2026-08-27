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

## 4. Convenciones de código

- TypeScript en modo `strict` en ambos proyectos.
- Commits en formato [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Una tarea de `tasks.md` = como mucho un commit (o PR) enfocado; nada de commits que mezclen varias tareas.
- Toda función de cálculo financiero (sección "Cálculos automáticos" del documento de requisitos) debe tener test unitario antes de considerarse hecha.

## 5. Fuera del control de esta constitution

Decisiones de UI/UX visual, nombres exactos de componentes, y detalles de estilo se deciden en el plan de cada feature, no aquí.

---
*Referencia: el documento completo de requisitos funcionales/no funcionales vive en `docs/requisitos_app_economia.md`.*
