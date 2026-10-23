import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  timestamp,
  boolean,
  smallint,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './auth.schema.js';
import { categories, movementTypeEnum, paymentMethodEnum, transactions } from './transactions.schema.js';

// Spec 047 (movimientos recurrentes), plan.md §1. Ampliado en spec 049
// (avisos, importes variables y conciliación), plan.md §1.

export const recurringFrequencyEnum = pgEnum('recurring_frequency', ['MONTHLY', 'YEARLY']);
// Spec 049: `RECONCILED` = la ocurrencia se resolvió enlazándola a un
// movimiento que ya existía (normalmente traído por la importación), sin
// crear uno nuevo.
export const recurringResolutionStatusEnum = pgEnum('recurring_resolution_status', ['CONFIRMED', 'SKIPPED', 'RECONCILED']);

/**
 * Plantilla de un movimiento que se repite. Las ocurrencias NO se guardan:
 * se calculan a partir de `startDate`/`frequency` (`recurring.calculations.ts`).
 * El día de repetición sale de `startDate`.
 */
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: movementTypeEnum('type').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subcategoryId: uuid('subcategory_id').references(() => categories.id, { onDelete: 'restrict' }), // solo EXPENSE
    concept: varchar('concept', { length: 255 }).notNull(),
    merchant: varchar('merchant', { length: 255 }), // solo EXPENSE
    // En una plantilla de importe variable (spec 049 H2) es el importe
    // inicial: solo se usa mientras no haya ocurrencias resueltas.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method'), // solo EXPENSE
    frequency: recurringFrequencyEnum('frequency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    active: boolean('active').notNull().default(true),
    // Spec 049 H2: importe estimado a partir de las últimas ocurrencias resueltas.
    variableAmount: boolean('variable_amount').notNull().default(false),
    // Spec 049 H1: aviso por email N días antes de cada ocurrencia.
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderDaysBefore: smallint('reminder_days_before').notNull().default(2),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('recurring_transactions_user_idx').on(table.userId),
    check('recurring_transactions_reminder_days_check', sql`${table.reminderDaysBefore} BETWEEN 0 AND 7`),
  ],
);

/**
 * Una ocurrencia confirmada, omitida o conciliada. La clave primaria
 * compuesta es lo que hace idempotente `confirm`/`skip`/conciliar: una
 * segunda resolución de la misma fecha choca con la PK en vez de duplicar el
 * movimiento. `transactionId` pasa a `null` si el movimiento se borra después
 * (la resolución se conserva: esa ocurrencia ya no vuelve a salir como
 * pendiente).
 *
 * Spec 049: el índice único parcial sobre `transaction_id` garantiza que un
 * movimiento resuelve como mucho una ocurrencia, venga de confirmar o de
 * conciliar — la red de seguridad frente a carreras entre la importación
 * automática y una conciliación manual.
 */
export const recurringOccurrenceResolutions = pgTable(
  'recurring_occurrence_resolutions',
  {
    recurringId: uuid('recurring_id')
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    occurrenceDate: date('occurrence_date').notNull(),
    status: recurringResolutionStatusEnum('status').notNull(),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    // Spec 049 H3 criterio 5: distingue la conciliación automática de la manual.
    reconciledAutomatically: boolean('reconciled_automatically').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.recurringId, table.occurrenceDate] }),
    uniqueIndex('recurring_resolutions_transaction_uidx')
      .on(table.transactionId)
      .where(sql`${table.transactionId} IS NOT NULL`),
  ],
);

/**
 * Spec 049 H3 criterios 3 y 8: "este movimiento no corresponde a esta
 * ocurrencia". Sin esto, una sugerencia descartada volvería a salir en cada
 * consulta (las sugerencias se calculan al consultar, no se guardan).
 */
export const recurringReconciliationDismissals = pgTable(
  'recurring_reconciliation_dismissals',
  {
    recurringId: uuid('recurring_id')
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    occurrenceDate: date('occurrence_date').notNull(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.recurringId, table.occurrenceDate, table.transactionId] })],
);

/**
 * Spec 049 H1 criterio 4: registro de avisos enviados, para avisar una sola
 * vez por ocurrencia. Es un registro de operación, no un dato económico: no
 * se exporta (plan.md §3.6).
 */
export const recurringRemindersSent = pgTable(
  'recurring_reminders_sent',
  {
    recurringId: uuid('recurring_id')
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    occurrenceDate: date('occurrence_date').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.recurringId, table.occurrenceDate] })],
);

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one, many }) => ({
  user: one(users, { fields: [recurringTransactions.userId], references: [users.id] }),
  resolutions: many(recurringOccurrenceResolutions),
}));

export const recurringOccurrenceResolutionsRelations = relations(recurringOccurrenceResolutions, ({ one }) => ({
  recurring: one(recurringTransactions, {
    fields: [recurringOccurrenceResolutions.recurringId],
    references: [recurringTransactions.id],
  }),
}));
