import { pgTable, uuid, varchar, numeric, date, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

// --- Tables ----------------------------------------------------------------

/**
 * H1 (spec 019): una cuenta bancaria (banco + número de cuenta) es una
 * entidad única por usuario — sustituye al histórico plano de spec 018
 * (`bankAccountEntries`, retirada). "Misma cuenta dos veces" se valida en
 * `BankAccountsService.create()`/`update()` (409), no con una constraint SQL
 * — mismo criterio que `savingsGoals` (goals.schema.ts).
 */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bank: varchar('bank', { length: 100 }).notNull(),
    accountNumber: varchar('account_number', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_accounts_user_idx').on(table.userId)],
);

/**
 * H2 (spec 019): historial de "fotos" del saldo de una cuenta — muchas por
 * cuenta, ninguna es la cuenta en sí (a diferencia de spec 018, donde banco
 * + número de cuenta se repetían en cada fila). Sin `userId` propio: el
 * aislamiento por usuario pasa siempre por `bankAccounts.userId` (normalizado).
 */
export const bankAccountBalances = pgTable(
  'bank_account_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'` (a diferencia de `transactions.category_id`, que
    // es `restrict`): H1 criterio 4 pide explícitamente que borrar la cuenta
    // se lleve su historial por delante, no que lo bloquee.
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'cascade' }),
    // H2 criterio 3: a diferencia de `transactions.amount`, admite negativo
    // (un descubierto) — validado con `IsSignedMoneyAmount`, no `IsMoneyAmount`.
    euros: numeric('euros', { precision: 12, scale: 2 }).notNull(),
    // `date`, no `timestamp` — mismo criterio que `transactions.date` (spec
    // 002): un dato sin hora, solo día.
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_account_balances_account_date_idx').on(table.bankAccountId, table.date)],
);

/**
 * H3 (spec 018): historial de compras de acciones — igual que
 * `bankAccountBalances`, varias filas de la misma acción son varias compras
 * distintas, no una sola posición que se sobrescribe. Sin `date` propia
 * (spec.md H3 no la pide). Sin cambios en spec 019 (plan.md §5).
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

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
  balances: many(bankAccountBalances),
}));

export const bankAccountBalancesRelations = relations(bankAccountBalances, ({ one }) => ({
  bankAccount: one(bankAccounts, { fields: [bankAccountBalances.bankAccountId], references: [bankAccounts.id] }),
}));

export const stockEntriesRelations = relations(stockEntries, ({ one }) => ({
  user: one(users, { fields: [stockEntries.userId], references: [users.id] }),
}));
