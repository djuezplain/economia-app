import { pgTable, uuid, varchar, numeric, date, timestamp, index, uniqueIndex, integer, smallint, char, customType, text, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.schema.js';
import { transactions } from './transactions.schema.js';

/**
 * Spec 048 plan.md §0 decisión 3: Drizzle 0.45 no trae `bytea`. El driver
 * `pg` ya devuelve `bytea` como `Buffer`, así que no hace falta convertir.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

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
 * líneas ni bloquea nada. Spec 048: la foto o el PDF original se guarda
 * en `receiptDocuments` (revierte la decisión 4 de la spec 034), y
 * `transactionId` enlaza el ticket con su movimiento (H3).
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
    // Spec 048 H3: como mucho un movimiento por ticket y un ticket por
    // movimiento (índice único parcial). Borrar el movimiento deja el ticket
    // sin enlace (`set null`); borrar el ticket se lleva el enlace con él.
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    /** Spec 051 H4: nota libre (hasta 2000 caracteres, validado en el DTO). */
    note: text('note'),
    /** Spec 051 H5: fin de la garantía del ticket entero. */
    warrantyUntil: date('warranty_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('receipts_user_date_idx').on(table.userId, table.date),
    uniqueIndex('receipts_transaction_uidx')
      .on(table.transactionId)
      .where(sql`${table.transactionId} IS NOT NULL`),
    // Spec 051 plan.md §0 decisión 1: búsqueda sin tildes ni mayúsculas, con palabras a medias.
    index('receipts_note_trgm_idx').using('gin', sql`immutable_unaccent(lower(${table.note})) gin_trgm_ops`),
    index('receipts_user_warranty_idx').on(table.userId, table.warrantyUntil),
  ],
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
    // Spec 048 H2 criterio 4: nullable — una línea sin emparejar con un
    // producto se guarda igual, pero no entra en la comparativa de precios.
    productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
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

/**
 * Spec 048 H1 (plan.md §1): la foto o el PDF original de un ticket. Tabla
 * propia para que los listados de tickets nunca carguen los binarios.
 * `receiptId` nulo = documento pendiente: subido en la vista previa de la
 * importación y todavía sin confirmar (plan.md §0 decisión 4); los que
 * nadie confirma se borran a las 24 horas. `userId` propio porque un
 * pendiente aún no tiene ticket por el que filtrar.
 */
export const receiptDocuments = pgTable(
  'receipt_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiptId: uuid('receipt_id').references(() => receipts.id, { onDelete: 'cascade' }),
    /** El tipo detectado por los primeros bytes, nunca el que declara el navegador. */
    mimeType: varchar('mime_type', { length: 50 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    /** Solo PDF. */
    pageCount: smallint('page_count'),
    content: bytea('content').notNull(),
    /** Spec 051 H3: el texto que reconoció el OCR de este documento. */
    ocrText: text('ocr_text'),
    /** Spec 051 H3: cuándo se leyó; `null` = nunca (distinto de "leído, sin texto"). */
    ocrReadAt: timestamp('ocr_read_at', { withTimezone: true }),
    /**
     * Spec 051 H6: miniatura JPEG de las imágenes (no de los PDF). `null` =
     * todavía no generada; 0 bytes = la imagen no se pudo leer (no se reintenta).
     */
    thumbnail: bytea('thumbnail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('receipt_documents_receipt_uidx')
      .on(table.receiptId)
      .where(sql`${table.receiptId} IS NOT NULL`),
    index('receipt_documents_user_receipt_idx').on(table.userId, table.receiptId),
    index('receipt_documents_ocr_trgm_idx').using('gin', sql`immutable_unaccent(lower(${table.ocrText})) gin_trgm_ops`),
  ],
);

/** Spec 051 plan.md §0 decisión 5: paleta fija, legible en tema claro y oscuro. */
export const RECEIPT_TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'] as const;
export type ReceiptTagColor = (typeof RECEIPT_TAG_COLORS)[number];

/**
 * Spec 051 H1: etiquetas libres de tickets, catálogo propio por usuario.
 * El nombre es único por usuario sin distinguir mayúsculas ni tildes.
 */
export const receiptTags = pgTable(
  'receipt_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    color: varchar('color', { length: 10 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('receipt_tags_user_name_uidx').on(table.userId, sql`immutable_unaccent(lower(${table.name}))`),
    check('receipt_tags_color_check', sql`${table.color} IS NULL OR ${table.color} IN ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple')`),
  ],
);

/** Spec 051 H1: etiquetas de cada ticket. Borrar el ticket o la etiqueta borra el enlace. */
export const receiptTagLinks = pgTable(
  'receipt_tag_links',
  {
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => receiptTags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.receiptId, table.tagId] }), index('receipt_tag_links_tag_idx').on(table.tagId)],
);

/**
 * Spec 051 H5 criterio 3: un aviso por ticket y fecha de garantía. Si la
 * fecha cambia, la nueva no está aquí y se vuelve a avisar.
 */
export const warrantyRemindersSent = pgTable(
  'warranty_reminders_sent',
  {
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => receipts.id, { onDelete: 'cascade' }),
    warrantyUntil: date('warranty_until').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.receiptId, table.warrantyUntil] })],
);
