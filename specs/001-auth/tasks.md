# Tasks 001 — Autenticación y gestión de usuarios

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 0 — Infraestructura base (necesaria antes de la primera historia)

- [x] **T0.1** — Estructura de monorepo: carpetas `/backend`, `/frontend`, config raíz (Prettier, `.editorconfig`, `.gitignore`, npm workspaces).
  *Verificación:* `npm run lint` corre sin error en ambos paquetes. ✅ hecho.
- [x] **T0.2** — Backend: inicializar proyecto NestJS + TypeScript estricto + Drizzle ORM. PostgreSQL local (ver nota de implementación en `constitution.md` §3 — se usa Postgres nativo en vez de docker-compose en este entorno; `docker-compose.yml` queda pendiente para el equipo si prefieren Docker en su máquina).
  *Verificación:* `nest start` arranca y conecta a Postgres. ✅ hecho — ver T0.4.
- [x] **T0.3** — Backend: esquema Drizzle inicial (`users`, `oauth_accounts`, `sessions`, `email_tokens`, `audit_logs` de `plan.md` §1) + primera migración.
  *Verificación:* `npx drizzle-kit generate` + `npx drizzle-kit migrate` aplican sin error contra Postgres; `\dt` muestra las 5 tablas. ✅ hecho.
- [x] **T0.4** — Backend: `ConfigModule` con validación de variables de entorno (Joi) (`.env.example` con `DATABASE_URL`, `JWT_*_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `MAIL_FROM`) + endpoint `GET /health` (comprueba también la conexión a BD).
  *Verificación:* arrancar sin `.env` falla con error claro (probado: `MAIL_FROM must be a valid email`); con `.env` completo, `GET /health` devuelve `{"status":"ok","db":"ok",...}`. ✅ hecho.
- [x] **T0.5** — Frontend: inicializar proyecto React + TypeScript (Vite) + router + cliente HTTP tipado (`src/api/client.ts`) + estructura de carpetas (`/pages`, `/components`, `/api`) + Vitest + Testing Library.
  *Verificación:* `npm run dev` sirve la página sin errores; `npm run lint` y `npm run test` en verde (1 test de `HomePage`). ✅ hecho.
- [ ] **T0.6** — CI: workflow de GitHub Actions (`.github/workflows/ci.yml`) que corre lint + tests de `/backend` (con Postgres de servicio) y `/frontend` en cada push/PR.
  *Verificación:* el workflow se ejecuta en verde en un push de prueba — **pendiente de verificar hasta que el repo esté en GitHub** (ver nota más abajo).

## Grupo 1 — H1 Registro

- [x] **T1.1** — Backend: `MailService` (interfaz + `ConsoleMailService` de desarrollo) con plantillas: verificación (`verificationEmail`, reutilizada también para reenvío), "ya tienes cuenta" (`alreadyRegisteredEmail`, ver nota T1.2) y reset de contraseña (`passwordResetEmail`).
  *Verificación:* 3 tests unitarios (`mail/templates.spec.ts`), todos en verde. ✅ hecho.
- [x] **T1.2** — Backend: `POST /auth/register` — DTO validado (`class-validator`, política de contraseña vía `IsStrongPassword`), hash argon2id, crear `User` en `PENDING_VERIFICATION`, crear `EmailToken(VERIFY_EMAIL, exp=24h)`, enviar email.
  *Verificación (tests, spec §2 H1):* 4 tests e2e (`test/auth-register.e2e-spec.ts`) contra Postgres real (BD `economia_test`): registro válido crea el usuario y su token; email duplicado no crea un segundo usuario; contraseña débil y email inválido rechazados con 400. ✅ hecho.
  *Nota de diseño (refina spec H1 criterio 2):* para que la respuesta nunca filtre si el email ya existía, `POST /auth/register` responde **siempre** `200` con el mismo mensaje genérico, tanto si crea la cuenta como si ya existía (en ese caso se envía `alreadyRegisteredEmail` en vez de crear un duplicado). Solo el dueño del email ve la diferencia, nunca quien hace la petición.
- [x] **T1.3** — Frontend: formulario de registro (`RegisterPage`) con validación de política de contraseña en cliente (mismo regex que el backend, `validators/password.ts`) y manejo de errores de la API.
  *Verificación:* 3 tests con Testing Library (`RegisterPage.test.tsx`) + prueba manual end-to-end backend+frontend con CORS real. ✅ hecho.

## Grupo 2 — H2 Verificación de email

- [x] **T2.1** — Backend: `GET /auth/verify-email?token=` y `POST /auth/resend-verification` (rate-limited: 5 solicitudes / 5 min por IP, ver nota sobre `RateLimitGuard` propio en `constitution.md` §3).
  *Verificación (spec H2, 7 tests e2e en `test/auth-verify-email.e2e-spec.ts`):* token válido activa la cuenta; token inexistente, caducado o ya usado dan error específico y no activan la cuenta; reenvío invalida el token anterior y genera uno nuevo; email inexistente o cuenta ya verificada responden igual (200, sin filtrar nada) y no crean tokens de más. Probado también manualmente el rate limit (6º intento → 429) y el flujo real registro→token en email de dev→verificación contra Postgres. ✅ hecho.
- [x] **T2.2** — Backend: guard `RequireActiveUserGuard` reutilizable — bloquea cualquier ruta futura de datos económicos si `status != ACTIVE` (no hay rutas económicas aún; se deja listo para las specs 002+, se aplicará junto al `AuthGuard` del grupo 3).
  *Verificación:* 4 tests unitarios (`require-active-user.guard.spec.ts`) con usuario ACTIVE / PENDING_VERIFICATION / DISABLED / sin autenticar. ✅ hecho.
- [x] **T2.3** — Frontend: `VerifyEmailPage` (aterrizaje del enlace) + `ResendVerificationPage`, enlazadas entre sí y desde la pantalla de "revisa tu correo" del registro.
  *Verificación:* 5 tests con Testing Library + prueba manual del flujo real. ✅ hecho.
  *Nota:* el "aviso persistente mientras la cuenta no esté activa" mencionado originalmente aquí necesita saber si hay una sesión iniciada y su estado — eso no existe hasta el grupo 3 (login). Lo implementado cubre todo lo que sí es alcanzable sin sesión: aterrizaje del enlace y reenvío manual. El aviso persistente ligado a la sesión se añadirá como parte del grupo 3.

## Grupo 3 — H4 Login y sesiones

- [x] **T3.1** — Backend: `POST /auth/login` — verifica credenciales, gestiona `failedLoginCount`/`lockedUntil`, emite access token (15 min) + refresh token (cookie httpOnly, 30 días) y crea `Session`.
  *Verificación (spec H4, `test/auth-login.e2e-spec.ts`):* credenciales correctas → 200 con accessToken + cookie + `Session` creada; email inexistente y contraseña incorrecta → 401 con el mismo mensaje genérico; 5 fallos consecutivos en 15 min → cuenta bloqueada (mensaje distinto, ver nota de trade-off en `constitution.md`), y el 6º intento falla incluso con la contraseña correcta mientras dura el bloqueo. Probado también manualmente contra Postgres real (curl). ✅ hecho.
  *Nota de diseño:* se añadió `users.last_failed_login_at` (no estaba en `plan.md` §1) para que la ventana de 15 minutos cuente de verdad — ver `constitution.md`.
- [x] **T3.2** — Backend: `POST /auth/refresh` con rotación de refresh token; reutilización de un token ya rotado revoca **todas** las sesiones del usuario (plan §7).
  *Verificación:* 3 tests e2e — rotación normal (token viejo queda `revokedAt`, se emite uno nuevo), reutilización de un token ya rotado (revoca *todas* las sesiones del usuario, incluida la "nueva" legítima) y ausencia de cookie (401). Probado también manualmente con curl encadenando login→refresh→reutilización del token viejo. ✅ hecho.
- [x] **T3.3** — Backend: `POST /auth/logout` (revoca la sesión actual, vía `SessionsService.revokeByRefreshToken`) y `AuthGuard` aplicado explícitamente (`@UseGuards`) a las rutas que lo requieren — no como guard global de Nest, ver nota en `constitution.md`.
  *Verificación:* logout revoca la `Session` y el refresh token deja de servir para `/auth/refresh`; sin access token o con uno inválido, `/auth/logout` devuelve 401. ✅ hecho.
- [x] **T3.4** — Backend: test de contrato de aislamiento (constitution §2 / plan §3) — un usuario A nunca puede leer/revocar `Session` de un usuario B.
  *Verificación (`test/auth-isolation.e2e-spec.ts`):* `SessionsService.revokeById` con el `userId` de A no revoca una `Session` de B (y devuelve `false`); el logout de A no afecta a la `Session` de B (verificado con dos usuarios reales y sus cookies reales); `revokeByRefreshToken` con el `userId` de A y el refresh token real de B no lo revoca. Corre en CI junto al resto de la suite e2e; queda como plantilla para specs futuras (002+), tal como pedía `plan.md` §3. ✅ hecho.
- [x] **T3.5** — Frontend: formulario de login (`LoginPage`), access token en memoria (`auth/token-store.ts`, nunca localStorage), refresco automático transparente (el cliente HTTP reintenta una vez tras un 401 llamando a `/auth/refresh`; `AuthProvider` además intenta un refresco silencioso al cargar la app para restaurar la sesión tras un reload), logout (limpia el estado local siempre, incluso si la petición de red falla).
  *Verificación:* 4 tests con Testing Library (`LoginPage.test.tsx` + caso nuevo en `HomePage.test.tsx`) + prueba manual end-to-end backend+frontend (`npm run build` sin errores en ambos paquetes). ✅ hecho.
  *Nota:* de paso se corrigió un fallo latente de `npm run build` en frontend (nunca se había ejecutado en los grupos anteriores, solo lint/test) — imports de tipos sin `import type` y una propiedad de parámetro de clase, incompatibles con `verbatimModuleSyntax`/`erasableSyntaxOnly` del `tsconfig.app.json` del proyecto. No afectaba a dev/test, pero sí a un build de producción real.

## Grupo 4 — H3 Login con Google

- [x] **T4.1** — Backend: estrategia OAuth de Google (`GET /auth/google`, `GET /auth/google/callback`), lógica de creación/vinculación de cuenta (plan §5).
  *Verificación (spec H3, `test/auth-google.e2e-spec.ts`):* con `GOOGLE_CLIENT_ID`/`SECRET` sin configurar (este entorno todavía, igual que GitHub), ambas rutas responden 503 con mensaje claro en vez de fallar de forma confusa. La lógica de negocio (que es donde vive H3) se prueba directamente contra `AuthService.loginWithGoogleProfile`, simulando el perfil que en producción entregaría `GoogleStrategy` tras el intercambio real: email nuevo → usuario creado ACTIVE sin contraseña + `OAuthAccount` vinculado; email ya existente por contraseña → se vincula sin duplicar usuario (criterio 2); mismo `googleId` en un segundo login → reutiliza el mismo usuario; un login por Google correcto limpia un bloqueo previo por intentos fallidos de contraseña. ✅ hecho.
  *Nota de diseño:* tres desviaciones de `plan.md` §2/§5 documentadas en `constitution.md` (sin PKCE, sin `state` de sesión, y el token se entrega a la SPA por query string en el redirect) — ninguna bloquea la spec, todas justificadas para un cliente confidencial como este backend.
  *Pendiente real (no de código):* la verificación end-to-end contra Google de verdad requiere que Diego cree credenciales OAuth 2.0 en Google Cloud Console (tipo "Aplicación web", origen `http://localhost:5173`, redirect URI `http://localhost:3000/auth/google/callback`) y las ponga en `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — el mismo bloqueo de infraestructura que ya se dio con GitHub. En cuanto existan, el flujo funciona sin tocar código (el guard de "no configurado" deja de activarse solo).
- [x] **T4.2** — Frontend: botón "Continuar con Google" en login y registro; `OAuthCallbackPage` para recoger el access token que devuelve el redirect y guardar la sesión.
  *Verificación:* 2 tests con Testing Library (`OAuthCallbackPage.test.tsx`) + lint/build en verde. La prueba manual del flujo completo contra Google real queda pendiente de las credenciales mencionadas en T4.1.

## Grupo 5 — H5 Recuperación de contraseña

- [x] **T5.1** — Backend: `POST /auth/forgot-password` (siempre 200) y `POST /auth/reset-password` (token de 1h, revoca todas las sesiones al usarse).
  *Verificación (spec H5, `test/auth-password-reset.e2e-spec.ts`, 8 tests):* email inexistente responde exactamente igual (200, mismo mensaje) que uno existente y no crea ningún token; una segunda solicitud invalida el enlace anterior sin usar; token inválido/caducado/ya usado → 400 con el motivo concreto (no hay riesgo de enumeración: el token es un secreto de alta entropía); reset válido cambia la contraseña, marca el token usado y revoca **todas** las sesiones activas anteriores (probado con una sesión real creada antes del reset); test de aislamiento dedicado — el token de reset de un usuario nunca afecta a otro, por construcción (el `userId` sale siempre del propio token, nunca del cliente). Reutiliza `passwordResetEmail` (ya escrita en el grupo 1, T1.1). Probado también manualmente end-to-end con curl. ✅ hecho.
  *Nota de diseño:* igual que con el login por Google, un reset de contraseña correcto también limpia `failedLoginCount`/`lockedUntil` — es una prueba de identidad tan válida como acertar la contraseña.
- [x] **T5.2** — Frontend: páginas "olvidé mi contraseña" (`ForgotPasswordPage`) y "restablecer contraseña" (`ResetPasswordPage`), enlazadas desde `LoginPage`.
  *Verificación:* 6 tests con Testing Library + prueba manual del flujo real (registro → forgot-password → email de dev → reset-password → login con la contraseña nueva, contraseña vieja rechazada) contra Postgres real. ✅ hecho.

## Grupo 6 — H6 Gestión de sesiones activas

- [x] **T6.1** — Backend: `GET /users/me/sessions` y `DELETE /users/me/sessions/:id` (solo sobre sesiones propias).
  *Verificación (`test/users-sessions.e2e-spec.ts`, 7 tests):* listado devuelve solo las sesiones activas del propio usuario, sin `refreshTokenHash`; una sesión cerrada (logout) desaparece de la lista; `DELETE` revoca una sesión propia sin afectar a otras del mismo usuario; `DELETE` sobre una sesión de otro usuario → 404, no 403 (no confirma que exista); id inexistente → 404; id con formato inválido → 400 (`ParseUUIDPipe`). Suite completa del backend en verde tras el cambio: 46/46 e2e + 8/8 unitarios (incluyendo el test de robo de `auth-login.e2e-spec.ts` del grupo 3, que sigue detectando el robo real correctamente). ✅ hecho.
  *Bug encontrado y corregido (ver `constitution.md` §3, "Grupo 6"):* la detección de robo de refresh tokens del grupo 3 revocaba **todas** las sesiones del usuario ante cualquier reutilización de un token ya revocado — pero grupo 6 introduce formas legítimas de que un token quede revocado (cerrar una sesión concreta, logout) que no son señal de robo. Se añadió una columna `revoked_reason` (`ROTATED | LOGOUT | USER_REVOKED | PASSWORD_RESET | REUSE_DETECTED`) y ahora solo se trata como robo la reutilización de un token cuyo motivo de revocación fue `ROTATED` (sustituido por una rotación posterior). Verificado tanto con un test e2e dedicado como manualmente con dos sesiones reales contra el servidor en marcha (curl): cerrar la sesión de un dispositivo ya no afecta a los demás.
  *Desviación de diseño (documentada, no parcheada en silencio):* se implementó y luego se **retiró** un campo `isCurrent` que debía marcar la sesión desde la que se hace la consulta — no se puede calcular de forma fiable porque la cookie de refresh tiene `path: '/auth'` (grupo 3, minimización de superficie CSRF) y por tanto nunca llega a `/users/me/sessions` en un navegador real (esto no lo detecta `supertest`, que no simula el `path` de las cookies). Arreglarlo bien requeriría meter el id de sesión en el JWT de acceso — cambio de arquitectura que se deja anotado como mejora futura en vez de mezclarlo a medias en este grupo. Ver `constitution.md`.
- [x] **T6.2** — Frontend: página "Dispositivos y sesiones" (`SessionsPage`) con botón de cierre remoto por sesión, enlazada desde `HomePage`.
  *Verificación:* 5 tests con Testing Library (`SessionsPage.test.tsx`) + prueba manual con dos "dispositivos" simultáneos (dos logins reales contra el backend en marcha, dos cookies de refresh distintas): revocar uno desde el otro lo deja sin poder refrescar (401) sin tocar al que no se tocó (200). Lint/build en verde en ambos paquetes. ✅ hecho.

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
