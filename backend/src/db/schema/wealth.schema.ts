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
    // H1 (spec 021): apodo opcional para identificar la cuenta sin leer banco +
    // número de cuenta — no participa en la unicidad de `assertNotDuplicate()`.
    alias: varchar('alias', { length: 100 }),
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
 * H1 (spec 020): una acción (banco custodia + acción) es una entidad única
 * por usuario — sustituye al histórico plano de spec 018 (`stockEntries`,
 * retirada). "Misma acción dos veces" se valida en `StocksService.create()`/
 * `update()` (409), no con una constraint SQL — mismo criterio que
 * `bankAccounts` (spec 019).
 */
export const stocks = pgTable(
  'stocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    custodyBank: varchar('custody_bank', { length: 100 }).notNull(),
    stock: varchar('stock', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stocks_user_idx').on(table.userId)],
);

/**
 * H2 (spec 020): historial de compras de una acción — muchas por acción,
 * ninguna es la acción en sí. Sin `userId` propio: el aislamiento por
 * usuario pasa siempre por `stocks.userId` (normalizado, igual que
 * `bankAccountBalances`).
 */
export const stockPurchases = pgTable(
  'stock_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar la acción se
    // lleve su historial de compras por delante.
    stockId: uuid('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    // H2 criterio 1 (revisión): puede ser fraccionario (brokers modernos
    // permiten comprar "0.5 acciones") — precisión a 8 decimales, no 2, para
    // posiciones muy fraccionadas (cripto-acciones, fondos indexados
    // fraccionarios, etc.). `IsShareCount`/`IsSharePrice` validan lo mismo.
    shareCount: numeric('share_count', { precision: 18, scale: 8 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 18, scale: 8 }).notNull(),
    // H2 criterio 1 (revisión): fecha de la compra, con el día de hoy por
    // defecto — mismo criterio que `stockValuations.date`.
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_purchases_stock_idx').on(table.stockId), index('stock_purchases_stock_date_idx').on(table.stockId, table.date)],
);

/**
 * H3 (spec 020): historial de valoraciones de una acción — segundo
 * historial independiente del de compras (decisión 1 de spec.md), mismo
 * criterio que `bankAccountBalances` (spec 019) pero para el valor de la
 * posición en vez del saldo de una cuenta.
 */
export const stockValuations = pgTable(
  'stock_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stockId: uuid('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    // H3 criterio 1 (revisión, §3.ter de spec.md): precio por acción, no el
    // valor total de la posición — el valor total se calcula (precio ×
    // `totalShares`, `wealth.calculations.ts`), nunca se guarda, igual que
    // `purchaseValue`. A diferencia de `bankAccountBalances.euros`, siempre
    // positivo — `IsMoneyAmount`, no `IsSignedMoneyAmount`.
    pricePerShare: numeric('price_per_share', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_valuations_stock_date_idx').on(table.stockId, table.date)],
);

/**
 * H1 (spec 029): historial de dividendos cobrados de una acción — tercer
 * historial independiente, junto a compras y valoraciones (no afecta a
 * ninguno de los dos, H1 criterio 7 de spec.md). Sin `userId` propio: el
 * aislamiento por usuario pasa siempre por `stocks.userId`, mismo criterio
 * que `stockPurchases`/`stockValuations`.
 */
export const stockDividends = pgTable(
  'stock_dividends',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 de spec 020 ya pide que borrar la
    // acción se lleve su historial por delante — dividendos incluidos.
    stockId: uuid('stock_id')
      .notNull()
      .references(() => stocks.id, { onDelete: 'cascade' }),
    // H1 criterio 2/3 (spec 029): importe neto cobrado, siempre positivo,
    // hasta dos decimales — `IsMoneyAmount`, reutilizado tal cual.
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    // % de retención, editable, 19.00 por defecto (tipo habitual en España).
    // precision(5,2) permite hasta 999.99 aunque el rango válido
    // (`IsRetentionPercent`) sea [0, 100).
    retentionPercent: numeric('retention_percent', { precision: 5, scale: 2 }).notNull().default('19.00'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_dividends_stock_idx').on(table.stockId), index('stock_dividends_stock_date_idx').on(table.stockId, table.date)],
);

/**
 * H1 (spec 021): un fondo de inversión (banco custodia + fondo) es una
 * entidad única por usuario — mismo criterio que `stocks` (spec 020), del
 * que esta spec replica el modelo entero. "Mismo fondo dos veces" se valida
 * en `FundsService.create()`/`update()` (409), no con una constraint SQL.
 */
export const funds = pgTable(
  'funds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    custodyBank: varchar('custody_bank', { length: 100 }).notNull(),
    fund: varchar('fund', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('funds_user_idx').on(table.userId)],
);

/**
 * H2 (spec 021): historial de compras de un fondo — muchas por fondo,
 * ninguna es el fondo en sí. Sin `userId` propio: el aislamiento por usuario
 * pasa siempre por `funds.userId` (normalizado, igual que `stockPurchases`).
 */
export const fundPurchases = pgTable(
  'fund_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar el fondo se lleve
    // su historial de compras por delante.
    fundId: uuid('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    // Número de participaciones, con hasta 8 decimales — mismo criterio de
    // precisión que `stockPurchases.shareCount` (fondos indexados
    // fraccionarios). `IsShareCount`/`IsSharePrice` validan lo mismo.
    shareCount: numeric('share_count', { precision: 18, scale: 8 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 18, scale: 8 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fund_purchases_fund_idx').on(table.fundId), index('fund_purchases_fund_date_idx').on(table.fundId, table.date)],
);

/**
 * H3 (spec 021): historial de valoraciones de un fondo — segundo historial
 * independiente del de compras, mismo criterio que `stockValuations`.
 */
export const fundValuations = pgTable(
  'fund_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    // Valor liquidativo por participación, no el valor total de la posición
    // — el valor total se calcula (precio × `totalShares`,
    // `wealth.calculations.ts`), nunca se guarda. Siempre positivo —
    // `IsMoneyAmount`, no `IsSignedMoneyAmount`.
    pricePerShare: numeric('price_per_share', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fund_valuations_fund_date_idx').on(table.fundId, table.date)],
);

/**
 * H1 (spec 029): historial de dividendos cobrados de un fondo — mismo
 * criterio que `stockDividends`, misma forma pero sobre `funds`/`fundId`.
 */
export const fundDividends = pgTable(
  'fund_dividends',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: uuid('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    retentionPercent: numeric('retention_percent', { precision: 5, scale: 2 }).notNull().default('19.00'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fund_dividends_fund_idx').on(table.fundId), index('fund_dividends_fund_date_idx').on(table.fundId, table.date)],
);

/**
 * H1 (spec 022): una posición de cripto (exchange/wallet + criptomoneda) es
 * una entidad única por usuario — mismo patrón que `stocks` (spec 020), sin
 * ninguna tabla previa que sustituir (Cripto no tuvo implementación en spec
 * 018). "Misma posición dos veces" se valida en `CryptosService.create()`/
 * `update()` (409), no con una constraint SQL.
 */
export const cryptos = pgTable(
  'cryptos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exchange: varchar('exchange', { length: 100 }).notNull(),
    crypto: varchar('crypto', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('cryptos_user_idx').on(table.userId)],
);

/**
 * H2 (spec 022): historial de compras de una posición de cripto — muchas
 * por posición, ninguna es la posición en sí. Sin `userId` propio: el
 * aislamiento por usuario pasa siempre por `cryptos.userId` (normalizado,
 * mismo criterio que `stockPurchases`).
 */
export const cryptoPurchases = pgTable(
  'crypto_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar la posición se
    // lleve su historial de compras por delante.
    cryptoId: uuid('crypto_id')
      .notNull()
      .references(() => cryptos.id, { onDelete: 'cascade' }),
    // H2 criterio 1: precisión mayor que `stockPurchases.shareCount`
    // (numeric(18,8)) en la parte entera — una posición de cripto puede
    // tener muchos más dígitos enteros (p. ej. millones de unidades de una
    // memecoin), además de hasta 8 decimales (precisión del satoshi de BTC).
    quantity: numeric('quantity', { precision: 28, scale: 8 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 18, scale: 8 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('crypto_purchases_crypto_idx').on(table.cryptoId),
    index('crypto_purchases_crypto_date_idx').on(table.cryptoId, table.date),
  ],
);

/**
 * H3 (spec 022): historial de valoraciones de una posición de cripto —
 * segundo historial independiente del de compras, mismo patrón que
 * `stockValuations`.
 */
export const cryptoValuations = pgTable(
  'crypto_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cryptoId: uuid('crypto_id')
      .notNull()
      .references(() => cryptos.id, { onDelete: 'cascade' }),
    // H3 criterio 2: 8 decimales, no 2 como `stockValuations.pricePerShare`
    // — muchas altcoins cotizan por debajo de 1 céntimo (decisión explícita
    // con Diego, spec.md §3).
    pricePerUnit: numeric('price_per_unit', { precision: 18, scale: 8 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('crypto_valuations_crypto_date_idx').on(table.cryptoId, table.date)],
);

/**
 * H1 (spec 023): un vehículo (marca/modelo + matrícula) es una entidad única
 * por usuario — mismo patrón en dos niveles que `bankAccounts` (spec 019),
 * no el patrón en tres niveles de `stocks`/`cryptos`: un vehículo no tiene
 * "cantidad", así que no lleva historial de compras, solo precio y fecha de
 * compra fijados una vez (editables, no aditivos). "Mismo vehículo dos
 * veces" se valida en `VehiclesService.create()`/`update()` (409), no con
 * una constraint SQL.
 */
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    brandModel: varchar('brand_model', { length: 150 }).notNull(),
    plate: varchar('plate', { length: 20 }).notNull(),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
    purchaseDate: date('purchase_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vehicles_user_idx').on(table.userId)],
);

/**
 * H2 (spec 023): historial de valoraciones de un vehículo — muchas por
 * vehículo, ninguna es el vehículo en sí. Sin `userId` propio: el
 * aislamiento por usuario pasa siempre por `vehicles.userId` (normalizado,
 * mismo criterio que `bankAccountBalances`).
 */
export const vehicleValuations = pgTable(
  'vehicle_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar el vehículo se
    // lleve su historial de valoraciones por delante.
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    // H2 criterio 2: siempre positivo (`IsMoneyAmount`, no
    // `IsSignedMoneyAmount` como `bankAccountBalances.euros`) — un vehículo
    // no puede valer menos que 0.
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vehicle_valuations_vehicle_date_idx').on(table.vehicleId, table.date)],
);

/**
 * H1 (spec 024): un plan de pensiones (entidad gestora + plan) es una
 * entidad única por usuario — mismo patrón en tres niveles que `cryptos`
 * (spec 022), pero sin cantidad ni precio por unidad (decisión explícita
 * con Diego, spec.md §3): el ahorrador medio no ve "número de
 * participaciones" de su plan, solo cuánto ha aportado y cuánto vale ahora.
 * "Misma posición dos veces" se valida en `PensionPlansService.create()`/
 * `update()` (409), no con una constraint SQL.
 */
export const pensionPlans = pgTable(
  'pension_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    managingEntity: varchar('managing_entity', { length: 100 }).notNull(),
    plan: varchar('plan', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pension_plans_user_idx').on(table.userId)],
);

/**
 * H2 (spec 024): historial de aportaciones a un plan de pensiones — muchas
 * por posición, ninguna es la posición en sí. Sin `userId` propio: el
 * aislamiento por usuario pasa siempre por `pensionPlans.userId`
 * (normalizado, mismo criterio que `cryptoPurchases`).
 */
export const pensionPlanContributions = pgTable(
  'pension_plan_contributions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar la posición se
    // lleve su historial de aportaciones por delante.
    pensionPlanId: uuid('pension_plan_id')
      .notNull()
      .references(() => pensionPlans.id, { onDelete: 'cascade' }),
    // H2 criterio 2: importe directo (`IsMoneyAmount`) — a diferencia de
    // `cryptoPurchases`, no hay `quantity`/`purchasePrice` por separado.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('pension_plan_contributions_plan_idx').on(table.pensionPlanId),
    index('pension_plan_contributions_plan_date_idx').on(table.pensionPlanId, table.date),
  ],
);

/**
 * H3 (spec 024): historial de valoraciones de un plan de pensiones —
 * segundo historial independiente del de aportaciones, mismo patrón que
 * `cryptoValuations`.
 */
export const pensionPlanValuations = pgTable(
  'pension_plan_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pensionPlanId: uuid('pension_plan_id')
      .notNull()
      .references(() => pensionPlans.id, { onDelete: 'cascade' }),
    // H3 criterio 2: valor total directo, no precio por participación — no
    // se multiplica por ninguna cantidad (a diferencia de
    // `cryptoValuations.pricePerUnit`).
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pension_plan_valuations_plan_date_idx').on(table.pensionPlanId, table.date)],
);

/**
 * H1 (spec 025): una ubicación de efectivo (p. ej. "Cartera", "Caja
 * fuerte") es una entidad única por usuario — mismo patrón en dos niveles
 * que `bankAccounts` (spec 019), con un único campo identificativo en vez
 * de dos: el efectivo no tiene un identificador natural como banco +
 * número de cuenta. "Misma ubicación dos veces" se valida en
 * `CashHoldingsService.create()`/`update()` (409), no con una constraint SQL.
 */
export const cashHoldings = pgTable(
  'cash_holdings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    location: varchar('location', { length: 150 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('cash_holdings_user_idx').on(table.userId)],
);

/**
 * H2 (spec 025): historial de importes de una ubicación de efectivo —
 * muchas por ubicación, ninguna es la ubicación en sí. Sin `userId`
 * propio: el aislamiento por usuario pasa siempre por
 * `cashHoldings.userId` (normalizado, mismo criterio que `bankAccountBalances`).
 */
export const cashBalances = pgTable(
  'cash_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 pide que borrar la ubicación se
    // lleve su historial de importes por delante.
    cashHoldingId: uuid('cash_holding_id')
      .notNull()
      .references(() => cashHoldings.id, { onDelete: 'cascade' }),
    // H2 criterio 2: siempre positivo (`IsMoneyAmount`, no
    // `IsSignedMoneyAmount` como `bankAccountBalances.euros`) — el efectivo
    // físico no puede ser negativo.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('cash_balances_holding_date_idx').on(table.cashHoldingId, table.date)],
);

// --- Relations ------------------------------------------------------------

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
  balances: many(bankAccountBalances),
}));

export const bankAccountBalancesRelations = relations(bankAccountBalances, ({ one }) => ({
  bankAccount: one(bankAccounts, { fields: [bankAccountBalances.bankAccountId], references: [bankAccounts.id] }),
}));

export const stocksRelations = relations(stocks, ({ one, many }) => ({
  user: one(users, { fields: [stocks.userId], references: [users.id] }),
  purchases: many(stockPurchases),
  valuations: many(stockValuations),
  dividends: many(stockDividends),
}));

export const stockPurchasesRelations = relations(stockPurchases, ({ one }) => ({
  stock: one(stocks, { fields: [stockPurchases.stockId], references: [stocks.id] }),
}));

export const stockValuationsRelations = relations(stockValuations, ({ one }) => ({
  stock: one(stocks, { fields: [stockValuations.stockId], references: [stocks.id] }),
}));

export const stockDividendsRelations = relations(stockDividends, ({ one }) => ({
  stock: one(stocks, { fields: [stockDividends.stockId], references: [stocks.id] }),
}));

export const fundsRelations = relations(funds, ({ one, many }) => ({
  user: one(users, { fields: [funds.userId], references: [users.id] }),
  purchases: many(fundPurchases),
  valuations: many(fundValuations),
  dividends: many(fundDividends),
}));

export const fundPurchasesRelations = relations(fundPurchases, ({ one }) => ({
  fund: one(funds, { fields: [fundPurchases.fundId], references: [funds.id] }),
}));

export const fundValuationsRelations = relations(fundValuations, ({ one }) => ({
  fund: one(funds, { fields: [fundValuations.fundId], references: [funds.id] }),
}));

export const fundDividendsRelations = relations(fundDividends, ({ one }) => ({
  fund: one(funds, { fields: [fundDividends.fundId], references: [funds.id] }),
}));

export const cryptosRelations = relations(cryptos, ({ one, many }) => ({
  user: one(users, { fields: [cryptos.userId], references: [users.id] }),
  purchases: many(cryptoPurchases),
  valuations: many(cryptoValuations),
}));

export const cryptoPurchasesRelations = relations(cryptoPurchases, ({ one }) => ({
  crypto: one(cryptos, { fields: [cryptoPurchases.cryptoId], references: [cryptos.id] }),
}));

export const cryptoValuationsRelations = relations(cryptoValuations, ({ one }) => ({
  crypto: one(cryptos, { fields: [cryptoValuations.cryptoId], references: [cryptos.id] }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, { fields: [vehicles.userId], references: [users.id] }),
  valuations: many(vehicleValuations),
}));

export const vehicleValuationsRelations = relations(vehicleValuations, ({ one }) => ({
  vehicle: one(vehicles, { fields: [vehicleValuations.vehicleId], references: [vehicles.id] }),
}));

export const pensionPlansRelations = relations(pensionPlans, ({ one, many }) => ({
  user: one(users, { fields: [pensionPlans.userId], references: [users.id] }),
  contributions: many(pensionPlanContributions),
  valuations: many(pensionPlanValuations),
}));

export const pensionPlanContributionsRelations = relations(pensionPlanContributions, ({ one }) => ({
  pensionPlan: one(pensionPlans, { fields: [pensionPlanContributions.pensionPlanId], references: [pensionPlans.id] }),
}));

export const pensionPlanValuationsRelations = relations(pensionPlanValuations, ({ one }) => ({
  pensionPlan: one(pensionPlans, { fields: [pensionPlanValuations.pensionPlanId], references: [pensionPlans.id] }),
}));

export const cashHoldingsRelations = relations(cashHoldings, ({ one, many }) => ({
  user: one(users, { fields: [cashHoldings.userId], references: [users.id] }),
  balances: many(cashBalances),
}));

export const cashBalancesRelations = relations(cashBalances, ({ one }) => ({
  cashHolding: one(cashHoldings, { fields: [cashBalances.cashHoldingId], references: [cashHoldings.id] }),
}));
