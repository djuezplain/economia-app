# Plan 001 — Autenticación y gestión de usuarios

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Implementa:** `spec.md` (todas las historias H1–H8)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos (Drizzle ORM / PostgreSQL)

> **Nota:** el plan se escribió originalmente con sintaxis Prisma; el ORM final es Drizzle (ver nota en `constitution.md` §3). El bloque siguiente es el diseño conceptual — las mismas tablas, columnas y relaciones — y ya está implementado tal cual en `backend/src/db/schema/auth.schema.ts`, que es la fuente de verdad.

```prisma
model User {
  id                String        @id @default(uuid())
  email             String        @unique
  passwordHash      String?       // null si el usuario solo usa Google
  name              String
  currency          String        @default("EUR")
  locale            String        @default("es")
  role              Role          @default(USER)
  status            UserStatus    @default(PENDING_VERIFICATION)
  failedLoginCount  Int           @default(0)
  lockedUntil       DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  oauthAccounts     OAuthAccount[]
  sessions          Session[]
  emailTokens       EmailToken[]
  auditLogs         AuditLog[]
}

enum Role { USER ADMIN }
enum UserStatus { PENDING_VERIFICATION ACTIVE DISABLED }

model OAuthAccount {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider       String   // "google"
  providerUserId String
  createdAt      DateTime @default(now())

  @@unique([provider, providerUserId])
}

model Session {
  id                String   @id @default(uuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokenHash  String   @unique
  userAgent         String?
  ipAddress         String?
  createdAt         DateTime @default(now())
  lastUsedAt        DateTime @default(now())
  expiresAt         DateTime
  revokedAt         DateTime?
}

model EmailToken {
  id         String       @id @default(uuid())
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String       @unique
  type       EmailTokenType
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime     @default(now())
}

enum EmailTokenType { VERIFY_EMAIL RESET_PASSWORD }

model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  action    String   // "login_success" | "login_failed" | "password_reset" | "account_deleted" | ...
  ipAddress String?
  createdAt DateTime @default(now())
}
```

Notas de diseño:
- `passwordHash` es nullable porque un usuario que se registró solo con Google no tiene contraseña propia (puede añadirla después vía "establecer contraseña", fuera de alcance de esta spec).
- Nunca se guarda el token de verificación/reset ni el refresh token en claro — se guarda su hash (SHA-256 basta, no necesita ser argon2 porque son aleatorios de alta entropía, no contraseñas elegidas por humanos).
- `Session` es la tabla que permite implementar H6 (listar/cerrar sesiones activas): cada login (password o Google) o refresh crea/actualiza una fila.

## 2. Endpoints (NestJS, prefijo `/api/auth`)

| Método y ruta | Público | Descripción |
|---|---|---|
| `POST /auth/register` | Sí | H1. Body: email, password, name. Crea usuario PENDING_VERIFICATION, envía email de verificación. |
| `GET /auth/verify-email?token=...` | Sí | H2. Marca cuenta ACTIVE si el token es válido y no ha caducado. |
| `POST /auth/resend-verification` | Sí (rate-limited) | H2. Reenvía email de verificación. |
| `GET /auth/google` | Sí | H3. Redirige a Google OAuth (Authorization Code + PKCE). |
| `GET /auth/google/callback` | Sí | H3. Recibe el código, crea/vincula cuenta, emite tokens. |
| `POST /auth/login` | Sí | H4. Body: email, password. Devuelve access token (15 min) + refresh token (30 días, httpOnly cookie). |
| `POST /auth/refresh` | Requiere refresh cookie | Rota el refresh token y emite nuevo access token. |
| `POST /auth/logout` | Autenticado | H6. Revoca la sesión (refresh token) actual. |
| `POST /auth/forgot-password` | Sí | H5. Siempre responde 200 igual, exista o no el email. |
| `POST /auth/reset-password` | Sí | H5. Body: token, nueva contraseña. Revoca todas las sesiones existentes. |
| `GET /users/me` | Autenticado | H7. Perfil propio. |
| `PATCH /users/me` | Autenticado | H7. Editar nombre/moneda/idioma. |
| `POST /users/me/change-password` | Autenticado | H7. Requiere contraseña actual. |
| `GET /users/me/sessions` | Autenticado | H6. Lista sesiones activas (sin exponer el hash del token). |
| `DELETE /users/me/sessions/:id` | Autenticado | H6. Revoca una sesión concreta. |
| `GET /users/me/export` | Autenticado | H8. Genera y descarga el JSON con todos los datos del usuario. |
| `DELETE /users/me` | Autenticado | H8. Requiere confirmar contraseña; borra el usuario y, en cascada (`onDelete: Cascade`), todo lo asociado. |

## 3. Autorización y aislamiento (constitution §2)

- Un `AuthGuard` global extrae `userId` del access token (JWT) y lo inyecta en el `request context`.
- **Regla de implementación no negociable**: ningún repositorio/servicio de datos económicos (a implementar en specs futuras) acepta una query sin `userId` explícito; no existe un método "buscar por id" sin `userId` en la firma. Esto se decide aquí porque todo el resto de specs lo heredan.
- Tests de contrato obligatorios en esta spec (aunque los datos económicos aún no existan): un test de integración que verifica que `/users/me`, `/users/me/sessions`, etc. de un usuario A nunca devuelven ni permiten operar sobre recursos de un usuario B (probado con `Session` y `EmailToken`, las únicas entidades con dueño que existen ya en esta spec).

## 4. Seguridad — decisiones concretas

- Hash de contraseña: **argon2id**, parámetros por defecto de la librería `argon2` de Node (memoryCost 19456, timeCost 2, parallelism 1) — se revisan si el hosting elegido tiene restricciones de memoria.
- JWT access token: 15 minutos, firmado HS256 con secreto de al menos 32 bytes en variable de entorno.
- Refresh token: valor aleatorio de 32 bytes (no JWT), se entrega como cookie `httpOnly`, `secure`, `sameSite=lax`; se guarda solo su hash SHA-256 en `Session.refreshTokenHash`; rotación en cada uso (se invalida el anterior al emitir uno nuevo) para detectar robo de token (si se reutiliza uno ya rotado, se revocan todas las sesiones del usuario).
- Bloqueo de cuenta: contador `failedLoginCount` + `lockedUntil` en `User`; se resetea el contador tras un login correcto.
- Rate limiting a nivel de endpoint (no solo por cuenta) en `/auth/login`, `/auth/forgot-password`, `/auth/resend-verification` para evitar abuso (p. ej. `@nestjs/throttler`).
- CORS restringido al dominio del frontend. CSRF no aplica a la API si se usa header `Authorization: Bearer` para el access token; la cookie de refresh solo se envía al endpoint `/auth/refresh` (`Path=/api/auth/refresh`) para reducir superficie CSRF.

## 5. Flujo Google OAuth (H3)

1. Frontend redirige a `GET /auth/google`.
2. Backend (Passport `google-oauth20` o librería equivalente para NestJS) redirige a Google con `scope=email profile`.
3. Google redirige a `/auth/google/callback` con el código.
4. Backend intercambia el código por el perfil de Google (email, sub).
5. Si existe `OAuthAccount(provider=google, providerUserId=sub)` → login directo.
6. Si no existe pero sí existe `User.email` igual → se crea el `OAuthAccount` vinculado a ese usuario (H3, criterio 2).
7. Si no existe ningún usuario con ese email → se crea `User` (status ACTIVE, sin passwordHash) + `OAuthAccount`.
8. Se emiten access + refresh token igual que en login normal.

## 6. Emails transaccionales

- Se abstrae detrás de un `MailService` (interfaz), con una implementación inicial simple (p. ej. Resend o SMTP) — proveedor concreto a elegir en la tarea de implementación, no bloquea el resto del plan.
- Plantillas necesarias: verificación de email, reenvío de verificación, recuperación de contraseña, aviso de eliminación de cuenta.

## 7. Casos límite a cubrir con tests

- Registro con email ya existente (con y sin verificar).
- Verificación con token caducado / ya usado.
- Login con cuenta bloqueada (mensaje correcto, sin filtrar existencia).
- Reset de contraseña con token de otro usuario (debe fallar).
- Reutilización de un refresh token ya rotado (debe revocar todas las sesiones).
- Registro por Google reutilizando email de una cuenta por contraseña (se vincula, no se duplica — H3 criterio 2).
- Borrado de cuenta: verificar que las tablas relacionadas (`Session`, `OAuthAccount`, `EmailToken`, `AuditLog.userId`) quedan coherentes tras el `onDelete`.

## 8. Fuera de este plan

- 2FA, Apple/Microsoft login, panel de administración: confirmado fuera de alcance en `spec.md` §5 y §6.

---
**Siguiente paso:** revisar este plan (modelo de datos, endpoints, decisiones de seguridad) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
