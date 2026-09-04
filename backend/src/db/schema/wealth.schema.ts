import { pgTable, uuid, varchar, numeric, date, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

// --- Tables (spec 018, plan.md §1) ---------------------------------------

/**
 * H2 (spec 018): historial de "fotos" del saldo de una cuenta bancaria, no
 * un valor único por cuenta — el mismo banco/número de cuenta puede
 * aparecer en varias filas con fechas distintas (decisión 1 de spec.md).
 */
export const bankAccountEntries = pgTable(
  'bank_account_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bank: varchar('bank', { length: 100 }).notNull(),
    accountNumber: varchar('account_number', { length: 50 }).notNull(),
    // H2 criterio 3: a diferencia de `transactions.amount`, admite negativo
    // (un descubierto) — validado con `IsSignedMoneyAmount`, no `IsMoneyAmount`.
    euros: numeric('euros', { precision: 12, scale: 2 }).notNull(),
    // `date`, no `timestamp` — mismo criterio que `transactions.date` (spec
    // 002): un dato sin hora, solo día.
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_account_entries_user_date_idx').on(table.userId, table.date)],
);

/**
 * H3 (spec 018): historial de compras de acciones — igual que
 * `bankAccountEntries`, varias filas de la misma acción son varias compras
 * distintas, no una sola posición que se sobrescribe. Sin `date` propia
 * (spec.md H3 no la pide, a diferencia de H2).
 */
export const stockEntries = pgTable(
  'stock_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    custodyBank: varchar('custody_bank', { length: 100 }).notNull(),
    stock: varchar('stock', { length: 150 }).notNull(),
    // H3 criterio 2: puede ser fraccionario (brokers modernos permiten
    // comprar "0.5 acciones") — precisión a 4 decimales, no 2.
    shareCount: numeric('share_count', { precision: 14, scale: 4 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    currentValuation: numeric('current_valuation', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_entries_user_idx').on(table.userId)],
);

// --- Relations ------------------------------------------------------------

export const bankAccountEntriesRelations = relations(bankAccountEntries, ({ one }) => ({
  user: one(users, { fields: [bankAccountEntries.userId], references: [users.id] }),
}));

export const stockEntriesRelations = relations(stockEntries, ({ one }) => ({
  user: one(users, { fields: [stockEntries.userId], references: [users.id] }),
}));
