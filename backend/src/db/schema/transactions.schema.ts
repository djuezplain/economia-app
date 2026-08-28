import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  timestamp,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';

// --- Enums --------------------------------------------------------------

export const movementTypeEnum = pgEnum('movement_type', ['INCOME', 'EXPENSE']);

// spec 002, plan.md §1: enum fijo, no editable por el usuario como las
// categorías — `spec.md` §4 lista estos como "iniciales" sin pedir que sean
// editables (a diferencia de las categorías, que sí lo dice explícitamente).
export const paymentMethodEnum = pgEnum('payment_method', [
  'CARD',
  'DIRECT_DEBIT',
  'CASH',
  'TRANSFER',
]);

// --- Tables (ver specs/002-movimientos-dashboard/plan.md §1) ------------

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: movementTypeEnum('type').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    // Autorreferencia para subcategorías (H3, spec 002) — dos niveles como
    // mucho; el límite de profundidad se aplica en `CategoriesService`, no
    // aquí (el esquema no lo impide por sí solo). `onDelete: 'restrict'`:
    // borrar una categoría que todavía tiene subcategorías debe fallar de
    // forma explícita (409 en el servicio), no arrastrarlas en cascada.
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    // Marca las categorías creadas automáticamente al registrarse (spec.md
    // §4/§6 decisión 4) — no cambia ningún comportamiento, es informativo
    // (el usuario puede renombrarlas o borrarlas igual que las suyas).
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('categories_user_type_idx').on(table.userId, table.type)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: movementTypeEnum('type').notNull(),
    // Tipo `date` de Postgres, no `timestamp`: un movimiento no tiene hora,
    // solo día (igual que en el Excel origen) — evita líos de zona horaria
    // al agrupar por mes (plan.md §1).
    date: date('date').notNull(),
    // `onDelete: 'restrict'` en ambas FKs a `categories`: borrar una
    // categoría con movimientos asociados debe fallar (409), no arrastrar ni
    // huérfanar el movimiento en silencio.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    subcategoryId: uuid('subcategory_id').references(() => categories.id, {
      onDelete: 'restrict',
    }), // solo EXPENSE
    concept: varchar('concept', { length: 255 }).notNull(),
    merchant: varchar('merchant', { length: 255 }), // solo EXPENSE, texto libre (no es una entidad propia todavía — ver plan.md §1)
    // `numeric`, nunca float/double: es dinero. Drizzle lo devuelve como
    // `string` en JS a propósito, para no perder precisión al convertir a
    // `number` — las funciones de cálculo (grupo 3) parsean con una
    // librería decimal, no con `parseFloat` directo (plan.md §1, §4).
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method'), // solo EXPENSE
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_user_date_idx').on(table.userId, table.date),
    index('transactions_user_type_date_idx').on(table.userId, table.type, table.date),
    index('transactions_user_category_idx').on(table.userId, table.categoryId),
  ],
);

// --- Relations (para queries con `with: {...}`) --------------------------

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  transactions: many(transactions, { relationName: 'category' }),
  subcategoryTransactions: many(transactions, { relationName: 'subcategory' }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
    relationName: 'category',
  }),
  subcategory: one(categories, {
    fields: [transactions.subcategoryId],
    references: [categories.id],
    relationName: 'subcategory',
  }),
}));
