# Tasks 001 — Autenticación y gestión de usuarios

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 0 — Infraestructura base (necesaria antes de la primera historia)

- [ ] **T0.1** — Estructura de monorepo: carpetas `/backend`, `/frontend`, config raíz (ESLint, Prettier, `.gitignore`, `tsconfig` base compartido).
  *Verificación:* `npm run lint` corre sin error en ambos paquetes (aunque no haya código aún).
- [ ] **T0.2** — Backend: inicializar proyecto NestJS + TypeScript estricto + Prisma. `docker-compose.yml` con PostgreSQL para desarrollo local.
  *Verificación:* `nest start` arranca; `docker compose up -d db` levanta Postgres.
- [ ] **T0.3** — Backend: esquema Prisma inicial (`User`, `OAuthAccount`, `Session`, `EmailToken`, `AuditLog` de `plan.md` §1) + primera migración.
  *Verificación:* `prisma migrate dev` aplica sin error; `prisma studio` muestra las 5 tablas.
- [ ] **T0.4** — Backend: `ConfigModule` con validación de variables de entorno (`.env.example` con `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `MAIL_*`) + endpoint `GET /health`.
  *Verificación:* arrancar sin `.env` falla con error claro; con `.env` completo, `GET /health` devuelve 200.
- [ ] **T0.5** — Frontend: inicializar proyecto React + TypeScript (Vite) + router + cliente HTTP tipado + estructura de carpetas (`/pages`, `/components`, `/api`).
  *Verificación:* `npm run dev` sirve una página en blanco sin errores de consola.
- [ ] **T0.6** — CI: workflow de GitHub Actions que corre lint + tests de `/backend` y `/frontend` en cada push/PR.
  *Verificación:* el workflow se ejecuta en verde en un push de prueba (una vez el repo esté en GitHub).

## Grupo 1 — H1 Registro

- [ ] **T1.1** — Backend: `MailService` (interfaz + implementación de desarrollo que loguea el email en consola) con plantillas para: verificación, reenvío, reset de contraseña.
  *Verificación:* test unitario que renderiza cada plantilla con datos de ejemplo sin lanzar error.
- [ ] **T1.2** — Backend: `POST /auth/register` — DTO validado, hash argon2id, crear `User` en `PENDING_VERIFICATION`, crear `EmailToken(VERIFY_EMAIL, exp=24h)`, enviar email.
  *Verificación (tests, spec §2 H1):* registro válido → 201 y usuario en BD; email duplicado → error sin filtrar existencia; contraseña débil → rechazada por el servidor aunque se salte el cliente.
- [ ] **T1.3** — Frontend: formulario de registro con validación de política de contraseña en cliente (mínimo 10 caracteres, letra + número) y manejo de los errores del backend.
  *Verificación:* prueba manual/E2E — registro exitoso muestra pantalla "revisa tu email"; email duplicado muestra el error correspondiente.

## Grupo 2 — H2 Verificación de email

- [ ] **T2.1** — Backend: `GET /auth/verify-email?token=` y `POST /auth/resend-verification` (rate-limited).
  *Verificación (spec H2):* token válido activa la cuenta; token caducado o ya usado da error específico; reenvío genera un token nuevo e invalida el anterior.
- [ ] **T2.2** — Backend: guard `RequireActiveUser` reutilizable — bloquea cualquier ruta futura de datos económicos si `status != ACTIVE` (no hay rutas económicas aún; se deja listo para las specs 002+).
  *Verificación:* test unitario del guard con usuario ACTIVE / PENDING_VERIFICATION / DISABLED.
- [ ] **T2.3** — Frontend: página de aterrizaje del enlace de verificación + aviso persistente "verifica tu email" con botón de reenvío cuando la cuenta no está activa.
  *Verificación:* prueba manual — enlace válido, caducado y ya usado muestran mensajes distintos.

## Grupo 3 — H4 Login y sesiones

- [ ] **T3.1** — Backend: `POST /auth/login` — verifica credenciales, gestiona `failedLoginCount`/`lockedUntil`, emite access token (15 min) + refresh token (cookie httpOnly, 30 días) y crea `Session`.
  *Verificación (spec H4):* credenciales correctas → tokens válidos; incorrectas → error genérico; 5 fallos en 15 min → cuenta bloqueada con mensaje sin filtrar existencia.
- [ ] **T3.2** — Backend: `POST /auth/refresh` con rotación de refresh token; reutilización de un token ya rotado revoca **todas** las sesiones del usuario (plan §7).
  *Verificación:* test que reutiliza un refresh token viejo y comprueba que todas las `Session` quedan `revokedAt` no nulo.
- [ ] **T3.3** — Backend: `POST /auth/logout` (revoca la sesión actual) y `AuthGuard` global que extrae `userId` del access token para toda ruta protegida.
  *Verificación:* logout invalida esa sesión; una petición con token de sesión revocada devuelve 401.
- [ ] **T3.4** — Backend: test de contrato de aislamiento (constitution §2 / plan §3) — un usuario A nunca puede leer/revocar `Session` o `EmailToken` de un usuario B.
  *Verificación:* suite de tests de integración dedicada, corre en CI, se referencia desde specs futuras como plantilla obligatoria.
- [ ] **T3.5** — Frontend: formulario de login, almacenamiento del access token en memoria (no localStorage), refresco automático transparente vía `/auth/refresh`, logout.
  *Verificación:* prueba manual — sesión persiste al recargar la página (gracias al refresh), logout limpia el estado.

## Grupo 4 — H3 Login con Google

- [ ] **T4.1** — Backend: estrategia OAuth de Google (`GET /auth/google`, `GET /auth/google/callback`), lógica de creación/vinculación de cuenta (plan §5).
  *Verificación (spec H3):* email nuevo → cuenta creada y ACTIVE; email ya existente por contraseña → se vincula sin duplicar usuario.
- [ ] **T4.2** — Frontend: botón "Continuar con Google" en login y registro.
  *Verificación:* prueba manual del flujo completo contra un proyecto OAuth de pruebas.

## Grupo 5 — H5 Recuperación de contraseña

- [ ] **T5.1** — Backend: `POST /auth/forgot-password` (siempre 200) y `POST /auth/reset-password` (token de 1h, revoca todas las sesiones al usarse).
  *Verificación (spec H5):* email inexistente responde igual que uno existente; token de otro usuario falla; tras reset, sesiones antiguas dejan de funcionar.
- [ ] **T5.2** — Frontend: páginas "olvidé mi contraseña" y "restablecer contraseña".
  *Verificación:* prueba manual del flujo end-to-end con el email de desarrollo (T1.1).

## Grupo 6 — H6 Gestión de sesiones activas

- [ ] **T6.1** — Backend: `GET /users/me/sessions` y `DELETE /users/me/sessions/:id` (solo sobre sesiones propias).
  *Verificación:* intentar borrar el id de una sesión de otro usuario devuelve 404 (no 403, para no confirmar que existe).
- [ ] **T6.2** — Frontend: página "Dispositivos y sesiones" con botón de cierre remoto.
  *Verificación:* prueba manual con dos navegadores/sesiones simultáneas.

## Grupo 7 — H7 Perfil

- [ ] **T7.1** — Backend: `GET/PATCH /users/me`, `POST /users/me/change-password` (requiere contraseña actual).
  *Verificación:* cambiar contraseña sin la actual correcta falla; con la correcta, funciona y (opcional) cierra otras sesiones.
- [ ] **T7.2** — Frontend: página de perfil (nombre, moneda, idioma, cambio de contraseña).
  *Verificación:* prueba manual.

## Grupo 8 — H8 Exportar y eliminar cuenta (RGPD)

- [ ] **T8.1** — Backend: `GET /users/me/export` — genera JSON con perfil + (placeholder de) datos económicos para cuando existan.
  *Verificación:* el JSON exportado incluye todos los campos del perfil y es válido.
- [ ] **T8.2** — Backend: `DELETE /users/me` — requiere reconfirmar contraseña, borrado inmediato en cascada.
  *Verificación (spec H8):* borra `User` y, por cascada, `Session`/`OAuthAccount`/`EmailToken`; `AuditLog.userId` queda `null` (no se borra el log).
- [ ] **T8.3** — Frontend: sección "Mi cuenta" con exportar datos y eliminar cuenta (modal de confirmación explícita).
  *Verificación:* prueba manual — el modal deja claro que es inmediato e irreversible antes de confirmar.

## Grupo 9 — Auditoría y cierre de la spec

- [ ] **T9.1** — Backend: registrar en `AuditLog` los eventos clave (`login_success`, `login_failed`, `password_reset`, `account_deleted`, `session_revoked`).
  *Verificación:* cada endpoint relevante añade su entrada; test que comprueba al menos un caso de cada evento.
- [ ] **T9.2** — Checklist de cierre: repasar `spec.md` historia por historia (H1–H8) y marcar cada criterio de aceptación como cubierto por al menos un test automático o, si es solo de UI, una verificación manual documentada.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo (los grupos 4–8 pueden reordenarse entre sí si prefieres priorizar Google antes que perfil, por ejemplo, pero dentro de un grupo el orden importa). Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").
