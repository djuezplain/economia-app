# Plan — Spec 022 (Cripto)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: tres tablas nuevas, mismo patrón en tres niveles que `stocks`/`stockPurchases`/`stockValuations` (spec 020) — sin ninguna tabla previa que retirar (a diferencia de spec 020, que sustituía a `stockEntries` de spec 018).

```ts
export const cryptos = pgTable('cryptos', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  exchange: varchar('exchange', { length: 100 }).notNull(),
  crypto: varchar('crypto', { length: 150 }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('cryptos_user_idx').on(table.userId)]);
// H1 criterio 2: "misma posición dos veces" se valida en CryptosService.create()/update()
// (409), no con una constraint SQL — mismo criterio que stocks (spec 020).

export const cryptoPurchases = pgTable('crypto_purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  cryptoId: uuid('crypto_id').notNull().references(() => cryptos.id, { onDelete: 'cascade' }),
  // Precisión mayor que shareCount (numeric(18,8)): las cantidades de cripto
  // pueden tener muchos más dígitos enteros (p. ej. millones de unidades de
  // una memecoin) además de hasta 8 decimales (satoshi de BTC).
  quantity: numeric('quantity', { precision: 28, scale: 8 }).notNull(),
  purchasePrice: numeric('purchase_price', { precision: 18, scale: 8 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [
  index('crypto_purchases_crypto_idx').on(table.cryptoId),
  index('crypto_purchases_crypto_date_idx').on(table.cryptoId, table.date),
]);

export const cryptoValuations = pgTable('crypto_valuations', {
  id: uuid('id').defaultRandom().primaryKey(),
  cryptoId: uuid('crypto_id').notNull().references(() => cryptos.id, { onDelete: 'cascade' }),
  // 8 decimales, no 2 (a diferencia de stockValuations.pricePerShare) — spec.md
  // H3 criterio 2, decisión explícita con Diego.
  pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 8 }).notNull(),
  date: date('date').notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow(),
}, (table) => [index('crypto_valuations_crypto_date_idx').on(table.cryptoId, table.date)]);
```

Ni `cryptoPurchases` ni `cryptoValuations` llevan `userId` propio — aislamiento vía `cryptos.userId`, mismo criterio normalizado que `stockPurchases`/`stockValuations`.

Como no hay datos previos que preservar, la migración es un `CREATE TABLE` puro generado por `drizzle-kit generate` en un solo paso — no hace falta el truco en dos pasos que usó spec 020 §2 para migrar `stock_entries`.

## 2. Validación

Dos decoradores nuevos, mismo patrón que `IsShareCount`/`IsSharePrice` (regex + `registerDecorator`) pero con mensajes propios de Cripto (no reutilizar los de Acciones tal cual: el mensaje de error debe hablar de "cantidad"/"precio" de una criptomoneda, no de "acciones", aunque la validación —positivo, hasta 8 decimales— sea idéntica):

- `backend/src/common/is-crypto-quantity.decorator.ts` → `IsCryptoQuantity`, regex `^\d+(\.\d{1,8})?$`.
- `backend/src/common/is-crypto-price.decorator.ts` → `IsCryptoPrice`, mismo regex — usado tanto en `purchasePrice` (compra) como en `pricePerUnit` (valoración), ya que ambos son "un precio positivo con hasta 8 decimales" (spec.md H2 criterio 1 / H3 criterio 2).

## 3. Endpoints

Tres recursos nuevos, mismo patrón que `stocks`/`stock-purchases`/`stock-valuations`:

- `GET/POST /cryptos`, `PATCH/DELETE /cryptos/:id`.
- `GET/POST /crypto-purchases`, `PATCH/DELETE /crypto-purchases/:id`.
- `GET/POST /crypto-valuations`, `PATCH/DELETE /crypto-valuations/:id`.

`CryptosService`: `create()`/`update()` comprueban unicidad (`exchange`+`crypto` por usuario, 409); `remove()` deja el `ON DELETE CASCADE` de las dos tablas hijas. Mensajes de error en español propios de Cripto ("Ya tienes registrada esa criptomoneda (mismo exchange/wallet y criptomoneda). Añade la compra o valoración dentro de ella.", "Criptomoneda no encontrada.").
`CryptoPurchasesService`/`CryptoValuationsService`: inyectan `CryptosService` y reutilizan su `findOwnOrThrow()` — mismo patrón que `StockPurchasesService`/`StockValuationsService`.

`WealthModule`: añade los tres controllers/services nuevos a la lista existente.

## 4. Cálculos (`wealth.calculations.ts`)

`purchaseValue`/`currentValue` ya existentes son multiplicaciones genéricas (precio × cantidad) sin nada específico de acciones en su implementación — se reutilizan tal cual para Cripto, sin duplicarlas. Dos funciones nuevas, mismo patrón que `totalShares`/`totalCost` pero sobre el campo `quantity` de `cryptoPurchases`:

```ts
export function totalCryptoQuantity(purchases: Array<{ quantity: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(p.quantity), new Decimal(0)).toFixed(8);
}

export function totalCryptoCost(purchases: Array<{ quantity: string; purchasePrice: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(purchaseValue(p.purchasePrice, p.quantity)), new Decimal(0)).toFixed(2);
}
```

No se generaliza `totalShares`/`totalCost` para aceptar ambos nombres de campo (`shareCount`/`quantity`): tocar código ya en producción de spec 020 para ahorrarse dos funciones de tres líneas no compensa el riesgo, mismo criterio de "no tocar specs ya cerradas" que spec 020 aplicó a Cuentas Bancarias.

## 5. Frontend

- `api/cryptos.ts`, `api/crypto-purchases.ts`, `api/crypto-valuations.ts` — mismo patrón que `api/stocks.ts` y compañía.
- `WealthPage.tsx`: nueva sección "🪙 Cripto" con el mismo patrón en tres niveles que "Acciones" (posición → historial de compras + historial de valoraciones anidados), incluido el alta en un solo paso (posición + primera compra) y el % de ganancia/pérdida en el título. Se retira `Cripto` de `PLACEHOLDER_SECTIONS`.
- Tarjeta "Total": se añade un tercer sumando (`cryptosTotal`, mismo cálculo que `stocksTotal` pero sobre las tres listas de Cripto) y una tercera cláusula en `canShowTotal`.
- Mismos `aria-label` distintivos en los 3 niveles de "Editar"/"Eliminar" que ya lleva "Acciones".

## 6. Fuera de este plan

- No se toca `bank-accounts`/`bank-account-balances` (spec 019) ni `stocks`/`stock-purchases`/`stock-valuations` (spec 020).
- No se generaliza ningún cálculo o componente compartido entre Acciones y Cripto más allá de lo descrito en §4 (reutilizar `purchaseValue`/`currentValue` tal cual) — quedaría como deuda técnica a valorar si en el futuro se añade una cuarta categoría con la misma forma (p. ej. Fondos Inversión).
