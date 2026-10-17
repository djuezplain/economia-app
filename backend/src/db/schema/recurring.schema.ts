import { pgTable, uuid, varchar, numeric, date, timestamp, boolean, pgEnum, index, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';
import { categories, movementTypeEnum, paymentMethodEnum, transactions } from './transactions.schema.js';

// Spec 047 (movimientos recurrentes), plan.md §1.

export const recurringFrequencyEnum = pgEnum('recurring_frequency', ['MONTHLY', 'YEARLY']);
export const recurringResolutionStatusEnum = pgEnum('recurring_resolution_status', ['CONFIRMED', 'SKIPPED']);

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
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method'), // solo EXPENSE
    frequency: recurringFrequencyEnum('frequency').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recurring_transactions_user_idx').on(table.userId)],
);

/**
 * Una ocurrencia confirmada u omitida. La clave primaria compuesta es lo que
 * hace idempotente `confirm`/`skip`: una segunda resolución de la misma fecha
 * choca con la PK en vez de duplicar el movimiento. `transactionId` pasa a
 * `null` si el movimiento confirmado se borra después (la resolución se
 * conserva: esa ocurrencia ya no vuelve a salir como pendiente).
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
