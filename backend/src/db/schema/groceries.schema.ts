import { pgTable, uuid, varchar, numeric, date, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth.schema.js';

// --- Tables ----------------------------------------------------------------

/**
 * Spec 034, H3: un supermercado es un catálogo abierto por usuario —
 * mismo patrón que `bankAccounts`/`stocks` (spec 019/020). Diego lo crea la
 * primera vez que aparece en un ticket (detectado de la cabecera o a mano);
 * sin unicidad a nivel SQL, se valida por nombre normalizado en el service
 * si hiciera falta, igual criterio que el resto de catálogos abiertos.
 */
export const supermarkets = pgTable(
  'supermarkets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('supermarkets_user_idx').on(table.userId)],
);

/**
 * Spec 034, H4: un producto es el eje de la comparativa de precios —
 * agrupa las líneas de distintos tickets/supermercados que Diego ha
 * emparejado manualmente (plan.md §8, sin fusión automática de nombres
 * parecidos-no-idénticos).
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('products_user_idx').on(table.userId)],
);

/**
 * Spec 034, H1-H3, H5: un ticket importado. `printedTotal` es el total tal
 * como lo leyó el OCR — puramente informativo (plan.md §1: la prueba real
 * de spec.md §1 demostró que es justo la línea con más riesgo de salir mal,
 * p. ej. por un pliegue del papel), nunca se valida contra la suma de
 * líneas ni bloquea nada. No se guarda la foto original (spec.md §4,
 * decisión 4).
 */
export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // `cascade`, no `restrict` — bug real encontrado al implementar T4.2:
    // `receipts.userId`/`supermarkets.userId` cascadean ambos directamente
    // desde `users` (un solo salto), pero `receiptLines.productId` referencia
    // `products` a través de un salto adicional (`receipts` → `receiptLines`).
    // Con `restrict` aquí, borrar un usuario con tickets ya guardados fallaba
    // de verdad contra Postgres real (reproducido en `psql`): la cascada
    // `users → supermarkets` podía intentar borrar un supermercado antes de
    // que la cascada de dos saltos `users → receipts → receiptLines` hubiera
    // borrado el ticket que aún lo referenciaba — el orden entre ramas de
    // cascada de distinta profundidad no está garantizado. `transactions.
    // categoryId` sí puede ser `restrict` con `categories.userId` en cascada
    // porque ambas referencian a `users` con un único salto (mismo nivel);
    // esa garantía no se cumple aquí. Sin ninguna funcionalidad de borrar un
    // supermercado en esta spec, `cascade` no cambia ningún comportamiento
    // visible hoy, solo hace segura la baja de cuenta (RGPD, spec 001 H8).
    supermarketId: uuid('supermarket_id')
      .notNull()
      .references(() => supermarkets.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    printedTotal: numeric('printed_total', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('receipts_user_date_idx').on(table.userId, table.date)],
);

/**
 * Spec 034, H2, H4: una línea de ticket ya revisada y corregida por Diego
 * (plan.md §1) — nunca lo que el OCR reconoció en crudo. `pricePerUnit` es
 * el campo que usa la comparativa de H4 (precio por unidad o por kg según
 * `unit`, plan.md H4 criterio 4); `amount` es el importe de la línea tal
 * como sale impreso, se usa solo para el aviso de H2 criterio 3
 * (`linesTotal` vs. `receipts.printedTotal`), no para la comparativa.
 * Sin `userId` propio: el aislamiento por usuario pasa siempre por
 * `receipts.userId` (mismo criterio que `bankAccountBalances`, spec 019).
 */
export const receiptLines = pgTable(
  'receipt_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'cascade' }),
    // `cascade`, mismo motivo que `receipts.supermarketId` arriba (bug real
    // de orden de cascada entre ramas de distinta profundidad, no solo
    // teórico — reproducido contra Postgres real antes de corregirlo).
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    description: varchar('description', { length: 200 }).notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
    unit: varchar('unit', { length: 10 }).notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 10, scale: 3 }).notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('receipt_lines_receipt_idx').on(table.receiptId),
    index('receipt_lines_product_idx').on(table.productId),
  ],
);
