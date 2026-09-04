# Plan — Spec 020 (Acciones únicas)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: `stockEntries` (spec 018) se sustituye por tres tablas — `bankAccounts`/`bankAccountBalances` (spec 019) no se tocan.

```ts
export const stocks = pgTable('stocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  custodyBank: varchar('custody_bank', { length: 100 }).notNull(),
  stock: varchar('stock', { length: 150 }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('stocks_user_idx').on(table.userId)]);
// H1 criterio 2: "misma acción dos veces" se valida en StocksService.create()/update()
// (409), no con una constraint SQL — mismo criterio que bankAccounts (spec 019).

export const stockPurchases = pgTable('stock_purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar la acción se lleve
  // su historial de compras por delante.
  stockId: uuid('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  shareCount: numeric('share_count', { precision: 14, scale: 4 }).notNull(),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
  // H2 criterio 1 (revisión, §3.bis de spec.md): añadida tras la primera
  // implementación — simétrica con `stockValuations.date`.
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [
  index('stock_purchases_stock_idx').on(table.stockId),
  index('stock_purchases_stock_date_idx').on(table.stockId, table.date),
]);

export const stockValuations = pgTable('stock_valuations', {
  id: uuid('id').defaultRandom().primaryKey(),
  stockId: uuid('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
  valuation: numeric('valuation', { precision: 12, scale: 2 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('stock_valuations_stock_date_idx').on(table.stockId, table.date)]);
```

Ni `stockPurchases` ni `stockValuations` llevan `userId` propio — el aislamiento por usuario pasa siempre por `stocks.userId` (mismo criterio normalizado que `bankAccountBalances`, spec 019).

`purchaseValue` (Precio de compra × Número de acciones, H2 criterio 3) y los totales de la posición (H2 criterio 4: nº de acciones y coste total, sumando todas las compras) **no se guardan** — se calculan en `wealth.calculations.ts` (backend, ya existe `purchaseValue`; se añade `totalShares`/`totalCost` sobre una lista de compras) y en el frontend al listar.

## 2. Migración (preservar datos ya desplegados, decisión 3)

Mismo patrón que spec 019 (T1.1 de esa spec): `drizzle-kit generate` no puede resolver en este entorno si un cambio de esquema es un rename (necesita TTY) — se genera en dos pasos: 1) añadir `stocks`/`stock_purchases`/`stock_valuations` (con `stockEntries` aún presente en el esquema, para que el diff sea un ADD puro), 2) retirar `stockEntries` del esquema y generar un segundo `DROP TABLE` puro. Entre el `CREATE` y el `DROP`, se edita a mano el SQL generado en el primer paso para insertar:

```sql
INSERT INTO stocks (id, user_id, custody_bank, stock, created_at, updated_at)
SELECT gen_random_uuid(), user_id, custody_bank, stock, min(created_at), max(updated_at)
FROM stock_entries
GROUP BY user_id, custody_bank, stock;

INSERT INTO stock_purchases (id, stock_id, share_count, purchase_price, created_at, updated_at)
SELECT gen_random_uuid(), s.id, e.share_count, e.purchase_price, e.created_at, e.updated_at
FROM stock_entries e
JOIN stocks s ON s.user_id = e.user_id AND s.custody_bank = e.custody_bank AND s.stock = e.stock;

INSERT INTO stock_valuations (id, stock_id, valuation, date, created_at, updated_at)
SELECT gen_random_uuid(), s.id, e.current_valuation, e.created_at::date, e.created_at, e.updated_at
FROM stock_entries e
JOIN stocks s ON s.user_id = e.user_id AND s.custody_bank = e.custody_bank AND s.stock = e.stock;
```

(Cada fila de spec 018 se convierte en una acción, una compra y una valoración — su `current_valuation` pasa a ser la primera/única entrada de ese historial, fechada con el día en que se creó la fila original.)

## 3. Validación

`shareCount`/`purchasePrice` reutilizan `IsShareCount`/`IsMoneyAmount` tal cual (ya existen, spec 018). `valuation` reutiliza `IsMoneyAmount` (siempre positivo, a diferencia de `euros` en cuentas bancarias — una posición no puede valer menos de 0).

## 4. Endpoints

Tres recursos, sustituyen a `/stock-entries` (spec 018) — se elimina ese controlador/servicio/DTOs por completo:

- `GET/POST /stocks`, `PATCH/DELETE /stocks/:id` (mismo patrón que `BankAccountsController`, spec 019).
- `GET/POST /stock-purchases`, `PATCH/DELETE /stock-purchases/:id` (mismo patrón que `BankAccountBalancesController`, sin `date`).
- `GET/POST /stock-valuations`, `PATCH/DELETE /stock-valuations/:id` (mismo patrón que `BankAccountBalancesController`, con `date`).

`StocksService`: `create()`/`update()` comprueban unicidad (`custodyBank`+`stock` por usuario, 409); `remove()` deja el `ON DELETE CASCADE` de las dos tablas hijas.
`StockPurchasesService`/`StockValuationsService`: inyectan `StocksService` y reutilizan su `findOwnOrThrow()` para comprobar propiedad antes de crear/editar/borrar — mismo patrón que `BankAccountBalancesService`.

## 5. Frontend

- `api/stocks.ts`, `api/stock-purchases.ts`, `api/stock-valuations.ts` — sustituyen a `api/stock-entries.ts` (se elimina).
- `WealthPage.tsx`, sección "Acciones" reescrita con el mismo patrón en dos niveles que "Cuentas Bancarias" (spec 019), pero con **dos** `<details>` anidados por acción en vez de uno: "Historial de compras" e "Historial de valoraciones", cada uno con su propia lista editable/borrable y su propio formulario de alta. La cabecera de la tarjeta de cada acción muestra: Acción · Banco Custodia, la valoración más reciente (o "Sin valoración"), y el nº total de acciones + coste total calculados sobre el historial de compras.
- Mismos `aria-label` distintivos en los 3 niveles de "Editar"/"Eliminar" (acción, compra, valoración) que ya lleva "Cuentas Bancarias" — con dos historiales anidados, "Editar" a secas sería ambiguo en tres sitios distintos, no en dos.

## 6. Fuera de este plan

- No se toca `bank-accounts`/`bank-account-balances` (spec 019) ni las 5 categorías sin implementar.

## 7. Revisión (§3.bis de spec.md): fecha de compra + alta en un solo paso

- Migración `0012_add_stock_purchases_date.sql`: añade `stock_purchases.date` (nullable, backfill con `created_at::date` para filas ya existentes, luego `NOT NULL`) + índice `stock_purchases_stock_date_idx` — mismo patrón en dos pasos que las migraciones que preservan datos (spec 019/020 §2), aquí porque `ADD COLUMN ... NOT NULL` sin default falla si la tabla ya tiene filas.
- `CreateStockPurchaseDto`/`UpdateStockPurchaseDto`: `date` con `IsDateString()` (obligatorio en create, opcional en update) — mismo patrón que `*StockValuationDto`.
- `StockPurchasesService.list()`: ordena por `[desc(date), desc(createdAt)]` en vez de solo `desc(createdAt)` — mismo criterio que `StockValuationsService.list()`.
- Frontend, `WealthPage.tsx`: el formulario "Añadir acción" (nivel superior) se amplía con Número de acciones, Precio de compra y Fecha de compra (hoy por defecto); al enviarlo, llama a `createStock()` y, con el id devuelto, a `createStockPurchase()` — dos llamadas encadenadas, un solo formulario. El formulario "Añadir compra" (dentro de la tarjeta de una acción ya creada, para compras siguientes) y el formulario de edición de una compra ganan el campo Fecha. Si `createStock()` tiene éxito pero `createStockPurchase()` falla, la acción queda creada (estado válido) y se muestra el error para que la compra se añada a mano desde su historial.
