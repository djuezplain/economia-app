import { pgTable, uuid, varchar, smallint, boolean, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

// Spec 032 H5, plan.md §11.1.
export const scheduleFrequencyEnum = pgEnum('schedule_frequency', ['DAILY', 'WEEKLY', 'MONTHLY']);
export const scheduleDestinationEnum = pgEnum('schedule_destination', ['LOCAL', 'DRIVE']);

/**
 * Spec 032 H5, plan.md §11.1: configuración de exportación programada, una
 * fila por usuario (`userId` único, upsert al guardar) — mismo criterio que
 * `googleSheetsImportConfigs` (spec 026) y `googleDriveConnections` (H4):
 * una única configuración activa, nunca varias programaciones simultáneas.
 */
export const scheduledExports = pgTable('scheduled_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  frequency: scheduleFrequencyEnum('frequency').notNull(),
  // 0 (domingo) - 6 (sábado); obligatorio solo si frequency = WEEKLY (DTO).
  dayOfWeek: smallint('day_of_week'),
  // 1-28; obligatorio solo si frequency = MONTHLY (DTO) — nunca 29-31
  // (plan.md §11.7 decisión 3: evita la ambigüedad de un mes sin ese día).
  dayOfMonth: smallint('day_of_month'),
  // "HH:mm", zona horaria del servidor (spec.md §3 decisión 9). `varchar`,
  // no el tipo `time` de Postgres — se compara como string ya formateado
  // igual (`scheduled-exports.due.ts`), sin añadir ese tipo solo para esto.
  timeOfDay: varchar('time_of_day', { length: 5 }).notNull(),
  destination: scheduleDestinationEnum('destination').notNull(),
  // Solo si destination = LOCAL: subcarpeta opcional dentro de la carpeta
  // propia del usuario (`local-export-path.util.ts`) — nunca una ruta
  // absoluta ni con `..`, saneada al guardar y al usar (defensa en
  // profundidad, constitution §2).
  localSubfolder: varchar('local_subfolder', { length: 100 }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  // `null` = la última ejecución fue bien (o no se ha ejecutado nunca).
  lastRunError: text('last_run_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledExportsRelations = relations(scheduledExports, ({ one }) => ({
  user: one(users, { fields: [scheduledExports.userId], references: [users.id] }),
}));
