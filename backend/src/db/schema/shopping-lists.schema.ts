import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth.schema.js';
import { products } from './groceries.schema.js';

/**
 * Spec 039, plan.md §1: una lista de la compra que Diego arma con productos
 * de su catálogo ya existente (`products`, spec 034/036) para simular en qué
 * supermercado le sale más barata — mismo patrón de catálogo abierto por
 * usuario que `supermarkets`/`products`.
 */
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shopping_lists_user_idx').on(table.userId)],
);

/**
 * Spec 039, plan.md §1: un producto dentro de una lista de la compra. Sin
 * `userId` propio — el aislamiento pasa por `shoppingLists.userId`, mismo
 * criterio que `receiptLines` vs. `receipts.userId`.
 *
 * `productId` es `cascade`, no `restrict` — mismo motivo ya documentado en
 * `receiptLines.productId` (`groceries.schema.ts`, spec 034 T4.2): `users →
 * products` y `users → shoppingLists → shoppingListItems` son dos ramas de
 * distinta profundidad desde `users`, y el orden entre ramas de un `DELETE
 * FROM users` en cascada no está garantizado por Postgres.
 *
 * Índice único `(shoppingListId, productId)`: una lista no puede tener el
 * mismo producto repetido (spec.md H1 criterio 4), a nivel de base de datos.
 */
export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shoppingListId: uuid('shopping_list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shopping_list_items_list_idx').on(table.shoppingListId),
    uniqueIndex('shopping_list_items_list_product_unique').on(table.shoppingListId, table.productId),
  ],
);
