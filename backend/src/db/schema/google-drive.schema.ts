import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

/**
 * Spec 032 H4, plan.md §9.2: conexión de un usuario con su Google Drive
 * (una fila por usuario, `userId` único) para poder subir ahí el fichero de
 * exportación (H1). Nunca se guarda el access token (de corta vida, se pide
 * uno nuevo a Google en cada export con el refresh token); el refresh token
 * se guarda cifrado (`secret-encryption.util.ts`), nunca en claro.
 *
 * `folderId` se resuelve de forma perezosa en cada export (`GoogleDriveService.ensureFolder`),
 * no al conectar — queda `null` hasta el primer export correcto, y se
 * resetea a `null` en cada reconexión (plan.md §9.5 paso 2) para que un
 * export posterior la reencuentre o la recree si hiciera falta.
 */
export const googleDriveConnections = pgTable('google_drive_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  folderId: varchar('folder_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const googleDriveConnectionsRelations = relations(googleDriveConnections, ({ one }) => ({
  user: one(users, { fields: [googleDriveConnections.userId], references: [users.id] }),
}));
