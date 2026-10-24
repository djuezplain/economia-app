import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- Enums --------------------------------------------------------------

export const roleEnum = pgEnum('role', ['USER', 'ADMIN']);
export const userStatusEnum = pgEnum('user_status', [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'DISABLED',
]);
export const emailTokenTypeEnum = pgEnum('email_token_type', [
  'VERIFY_EMAIL',
  'RESET_PASSWORD',
]);
// Por qué se revocó una sesión (grupo 6, H6): distingue una rotación normal
// de refresh token (`ROTATED`) de un cierre de sesión legítimo iniciado por
// el propio usuario (`LOGOUT`, `USER_REVOKED`, `PASSWORD_RESET`,
// `PASSWORD_CHANGED`). Solo la reutilización de una sesión marcada `ROTATED`
// es señal real de robo — ver `SessionsService.rotate()` y la nota de
// implementación en constitution.md.
// `PASSWORD_RESET` (flujo "olvidé mi contraseña", sin sesión) y
// `PASSWORD_CHANGED` (grupo 7, H7: cambio de contraseña estando ya
// autenticado) se guardan como motivos distintos aunque el efecto inmediato
// sea el mismo (revocar todo) — son eventos distintos de cara a una futura
// auditoría (`audit_logs`, grupo 9).
export const sessionRevokedReasonEnum = pgEnum('session_revoked_reason', [
  'ROTATED',
  'LOGOUT',
  'USER_REVOKED',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'REUSE_DETECTED',
]);

// --- Tables (ver specs/001-auth/plan.md §1) ------------------------------

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'), // null si el usuario solo usa Google
  name: varchar('name', { length: 255 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  locale: varchar('locale', { length: 10 }).notNull().default('es'),
  role: roleEnum('role').notNull().default('USER'),
  status: userStatusEnum('status').notNull().default('PENDING_VERIFICATION'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  // Necesario para que el bloqueo cuente intentos "en 15 minutos" (spec H4,
  // criterio 3) y no solo "los últimos 5 acumulados alguna vez": si ha pasado
  // más de la ventana desde el último fallo, el contador se reinicia.
  lastFailedLoginAt: timestamp('last_failed_login_at', { withTimezone: true }),
  // Spec 049 H1 criterio 6: interruptor global de los avisos de recibos por
  // email. Con `false` no se envía ninguno, sin tocar la configuración de
  // cada plantilla.
  recurringReminderEmails: boolean('recurring_reminder_emails').notNull().default(true),
  // Spec 051 H5 criterio 4: interruptor de los avisos de garantía por email.
  warrantyReminderEmails: boolean('warranty_reminder_emails').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(), // "google"
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('oauth_provider_user_unique').on(table.provider, table.providerUserId)],
);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: sessionRevokedReasonEnum('revoked_reason'),
});

export const emailTokens = pgTable('email_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  type: emailTokenTypeEnum('type').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 64 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Relations (para queries con `with: {...}`) --------------------------

export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  sessions: many(sessions),
  emailTokens: many(emailTokens),
  auditLogs: many(auditLogs),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const emailTokensRelations = relations(emailTokens, ({ one }) => ({
  user: one(users, { fields: [emailTokens.userId], references: [users.id] }),
}));
