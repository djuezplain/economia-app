# Plan — Spec 029 (Dividendos)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: dos tablas nuevas, **una por tipo de posición** — `stockDividends` (junto a `stockValuations`) y `fundDividends` (junto a `fundValuations`) — mismo criterio de no compartir tabla entre tipos de activo que ya usan `stockPurchases`/`fundPurchases`/`cryptoPurchases`, cada uno con su propia tabla en vez de una tabla `dividends` genérica con un `assetType` discriminador.

```ts
export const stockDividends = pgTable(
  'stock_dividends',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // `onDelete: 'cascade'`: H1 criterio 4 de spec 020 ya pide que borrar la
    // acción se lleve su historial por delante — dividendos incluidos.
    stockId: uuid('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
    // H1 criterio 2/3 (spec 029): importe neto, siempre positivo, hasta dos
    // decimales — `IsMoneyAmount`, reutilizado tal cual.
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    // % de retención, editable, 19.00 por defecto — precision(5,2) permite
    // hasta 999.99 aunque el rango válido (`IsRetentionPercent`) sea [0, 100).
    retentionPercent: numeric('retention_percent', { precision: 5, scale: 2 }).notNull().default('19.00'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_dividends_stock_idx').on(table.stockId), index('stock_dividends_stock_date_idx').on(table.stockId, table.date)],
);

export const fundDividends = pgTable(
  'fund_dividends',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: uuid('fund_id').notNull().references(() => funds.id, { onDelete: 'cascade' }),
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    retentionPercent: numeric('retention_percent', { precision: 5, scale: 2 }).notNull().default('19.00'),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fund_dividends_fund_idx').on(table.fundId), index('fund_dividends_fund_date_idx').on(table.fundId, table.date)],
);
```

Ninguna de las dos lleva `userId` propio — aislamiento vía `stocks.userId`/`funds.userId` (normalizado), mismo criterio que `stockPurchases`/`fundPurchases`/`stockValuations`/`fundValuations`.

Migración `CREATE TABLE` pura (`drizzle-kit generate`, siguiente número tras `0022`) — sin datos previos que preservar, mismo criterio que spec 024.

## 2. Validación

- `netAmount`: `IsMoneyAmount`, ya existente, reutilizado tal cual (mismo criterio que `pensionPlanContributions.amount`).
- `retentionPercent`: decorador nuevo `IsRetentionPercent` (`backend/src/common/is-retention-percent.decorator.ts`), mismo patrón que `IsMoneyAmount` — string, hasta dos decimales, pero rango `[0, 100)` en vez de "siempre positivo": `/^\d{1,2}(\.\d{1,2})?$/` y `Number(value) >= 0 && Number(value) < 100`. Se descarta reutilizar `IsMoneyAmount` porque su regla ("positivo, sin límite superior") no impide 100 ni cifras de varios dígitos enteros sin sentido para un porcentaje — regla de negocio distinta, decorador propio, mismo criterio que `IsSharePrice` frente a `IsMoneyAmount` (spec 020 §3.sexies).
- `date`: `IsDateString`, igual que el resto de historiales.

## 3. Endpoints

Cuatro recursos nuevos (dos por tipo de posición), mismo patrón que `stock-purchases`/`fund-purchases`:

- `GET/POST /stock-dividends`, `PATCH/DELETE /stock-dividends/:id`.
- `GET/POST /fund-dividends`, `PATCH/DELETE /fund-dividends/:id`.

`StockDividendsService`/`FundDividendsService`: mismo patrón que `StockPurchasesService`/`FundPurchasesService` — inyectan `StocksService`/`FundsService` y reutilizan su `findOwnOrThrow()` para el alta (404 si `stockId`/`fundId` no es una posición propia) y un `findOwnOrThrow()` propio (busca el dividendo, luego valida la posición padre) para editar/eliminar. `list()` devuelve los dividendos de todas las posiciones propias del usuario, ordenados de más reciente a más antiguo (mismo criterio que `PensionPlanContributionsService.list()`).

`WealthModule`: añade los dos controllers/services nuevos a las listas existentes.

## 4. Cálculos

`wealth.calculations.ts`, dos funciones nuevas, genéricas para ambos tipos de posición (mismo `{ netAmount, retentionPercent }`/`{ netAmount }`, sin necesidad de duplicar por stock/fund — mismo criterio que `purchaseValue`, ya compartida entre `stockPurchases`/`fundPurchases`):

```ts
/** H1 criterio 3 (spec 029): Bruto = Neto ÷ (1 − %Retención ÷ 100). Se calcula, no se guarda. */
export function grossDividend(netAmount: string, retentionPercent: string): string {
  return new Decimal(netAmount).dividedBy(new Decimal(1).minus(new Decimal(retentionPercent).dividedBy(100))).toFixed(2);
}

/** H2 criterio 1 (spec 029): total neto cobrado en dividendos de una posición (o de toda la cartera, H3). */
export function totalDividends(dividends: Array<{ netAmount: string }>): string {
  return dividends.reduce((sum, d) => sum.plus(d.netAmount), new Decimal(0)).toFixed(2);
}
```

`totalDividends` se reutiliza tanto para el total por posición (H2, sobre los dividendos de una sola acción/fondo) como para el total agregado (H3, sobre todos los `stockDividends` + todos los `fundDividends` del usuario) — mismo criterio que `totalContributions`, ya usada así en `pensionPlansTotal`.

## 5. Frontend

- `api/stock-dividends.ts`, `api/fund-dividends.ts` — mismo patrón que `api/stock-purchases.ts` (interfaz `{ id, stockId/fundId, netAmount, retentionPercent, date, createdAt, updatedAt }`, `list/create/update/delete`).
- `WealthPage.tsx`, dentro de cada tarjeta de acción y de fondo: **tercer historial anidado "Dividendos"**, mismo patrón visual e interacción que "Compras"/"Valoraciones" ya existentes (lista ordenada de más reciente a más antiguo, formulario "Añadir dividendo" con Importe neto, % Retención — precargado a 19 — y Fecha con hoy por defecto, cada fila editable/eliminable con su propio `aria-label` distintivo). Cada fila muestra Neto y Bruto calculado (`grossDividend`). La tarjeta de la posición muestra su total de dividendos (`totalDividends`, H2) junto al resto de cifras ya existentes (coste total, valor actual, % ganancia/pérdida) — "Sin dividendos" si el historial está vacío, mismo criterio que "Sin valoración".
- Nuevas funciones `stockDividendsTotal(stocks, dividends)`/`fundDividendsTotal(funds, dividends)` (agrupan por posición y sólo cuentan las de acciones/fondos propios — mismo patrón defensivo que `stocksTotal`/`fundsTotal`, aunque aquí no hace falta "última entrada" sino la suma completa).
- Nueva tarjeta agregada "💰 Dividendos cobrados" (H3), calculada como `stockDividendsTotal + fundDividendsTotal`, con el desglose de los dos sumandos — se pinta junto a la tarjeta "Total" (mismo `canShowTotal`, ampliado con los datos de dividendos entre sus dependencias) pero **sin sumarse dentro de ella** (H3 criterio 4 de spec.md): variable y JSX separados de `canShowTotal`/la tarjeta "Total" actual, no una octava cláusula del mismo cálculo.
- `WealthPage.test.tsx` (o el fichero de test que corresponda): casos nuevos para alta/edición/borrado de un dividendo, cálculo de bruto, total por posición y total agregado, y que ese total agregado no se cuela en la tarjeta "Total" de patrimonio.

## 6. Fuera de este plan

- No se toca ninguna categoría ya implementada (Cuentas Bancarias, Cripto, Vehículos, Fondo Pensiones, Efectivo) ni compras/valoraciones de Acciones/Fondos.
- No se tocan las specs 027 (evolución del patrimonio) ni 028 (composición y rentabilidad) — el nuevo total de dividendos no entra en ninguno de sus cálculos, mismo criterio que spec.md §1, H3 criterio 4.
- No se toca el módulo de Movimientos/Ingresos — spec.md §2, decisión §3.1.
- No se generaliza `stockDividends`/`fundDividends` en una única tabla `dividends` con `assetType` — mismo criterio ya asentado en el proyecto (una tabla por tipo de activo) que `stockPurchases`/`fundPurchases`/`cryptoPurchases`.
