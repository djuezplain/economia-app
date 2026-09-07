import { pgTable, uuid, varchar, boolean, timestamp, jsonb, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

/**
 * Spec 026: forma persistida del resultado de una ejecución (manual o
 * automática) de la importación desde Google Sheets — estructuralmente
 * igual a `ImportConfirmResult` (import.service.ts), pero definida aquí de
 * forma independiente para no acoplar el esquema de base de datos a un tipo
 * de la capa de servicio.
 */
export interface GoogleSheetsImportRunResult {
  income: { importedCount: number; invalid: { rowNumber: number; reason: string }[]; skippedDuplicateCount: number; updatedAmountCount: number };
  expense: { importedCount: number; invalid: { rowNumber: number; reason: string }[]; skippedDuplicateCount: number; updatedAmountCount: number };
  categoriesCreated: string[];
}

/**
 * H1 (spec 026): configuración de importación desde Google Sheets, una fila
 * por usuario (1:1, `userId` único). `lastRunAt`/`lastRunResult`/
 * `lastRunError` se sobrescriben en cada ejecución — H3 criterio 3 solo pide
 * ver la última, no un histórico (plan.md §1).
 */
export const googleSheetsImportConfigs = pgTable('google_sheets_import_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  spreadsheetId: varchar('spreadsheet_id', { length: 200 }).notNull(),
  autoImportEnabled: boolean('auto_import_enabled').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  // `null` mientras no se ha ejecutado nunca, o si la última ejecución falló
  // antes de poder clasificar nada (ver `lastRunError`).
  lastRunResult: jsonb('last_run_result').$type<GoogleSheetsImportRunResult | null>(),
  lastRunError: text('last_run_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const googleSheetsImportConfigsRelations = relations(googleSheetsImportConfigs, ({ one }) => ({
  user: one(users, { fields: [googleSheetsImportConfigs.userId], references: [users.id] }),
}));
