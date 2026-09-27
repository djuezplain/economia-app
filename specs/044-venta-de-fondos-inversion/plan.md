# Plan — Spec 044 (Venta de fondos de inversión)

**Fase:** 2 de 4

Mismo diseño que spec 031 (venta de acciones), aplicado a `funds`/`fundPurchases` en vez de `stocks`/`stockPurchases`. Se referencia esa spec como plantilla en cada sección; solo se detallan las diferencias reales (nombres).

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: una tabla nueva, `fundSales`, junto a `fundPurchases`/`fundDividends` — mismos campos y precisión que `stockSales` (spec 031 plan.md §1).

```ts
export const fundSales = pgTable(
  'fund_sales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: uuid('fund_id').notNull().references(() => funds.id, { onDelete: 'cascade' }),
    shareCount: numeric('share_count', { precision: 18, scale: 8 }).notNull(),
    salePrice: numeric('sale_price', { precision: 18, scale: 8 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('fund_sales_fund_idx').on(table.fundId), index('fund_sales_fund_date_idx').on(table.fundId, table.date)],
);
```

Sin `userId` propio (aislamiento vía `funds.userId`), mismo criterio que `fundPurchases`/`fundDividends`. Relación `fundsRelations.sales: many(fundSales)` + `fundSalesRelations`. Migración `CREATE TABLE` pura (siguiente número libre en `backend/drizzle/`).

## 2. Validación — "no vender más de lo que queda en cartera"

Idéntica a spec 031 plan.md §2, sobre `fundPurchases`/`fundSales`/`fundId` en vez de `stockPurchases`/`stockSales`/`stockId`:

- `FundSalesService.create()`/`update()`: resta de totales (`totalShares`, ya genérica) — sin FIFO (la fecha de la venta no importa para esta comprobación, solo el total).
- `FundSalesService.remove()`: sin comprobación (borrar una venta nunca reduce la cartera).
- `FundPurchasesService.update()`/`remove()`: misma comprobación `assertSalesStillCovered` que `StockPurchasesService` ganó en spec 031 (T2.2) — salta si el fondo no tiene ninguna venta.
- Todas usan `BadRequestException` (400), mismo criterio.

## 3. Endpoints

Un recurso nuevo, mismo patrón CRUD que `fund-purchases`/`stock-sales`: `GET/POST /fund-sales`, `PATCH/DELETE /fund-sales/:id`. `FundSalesController`/`FundSalesService` inyectan `FundsService` y reutilizan su `findOwnOrThrow()`, igual que `FundPurchasesService`. `WealthModule` añade el controller/service nuevo.

DTOs (`create-fund-sale.dto.ts`/`update-fund-sale.dto.ts`): mismos campos y decoradores que `create-stock-sale.dto.ts`/`update-stock-sale.dto.ts` (`fundId`/`IsUUID`, `shareCount`/`IsShareCount`, `salePrice`/`IsSharePrice`, `date`/`IsDateString`).

## 4. Cálculos — simulación FIFO (solo frontend)

`frontend/src/pages/stock-shared.ts` ya extrajo `fifoPositionState`/`isStockPositionClosed`/`totalRealizedGainLoss` con tipos **estructurales** (`Array<{ id, date, shareCount, purchasePrice|salePrice, createdAt }>`, no `Stock[]`/`StockSale[]` salvo en `stocksTotal`) — el propio comentario de cabecera del fichero ya deja anotado que estas funciones servían también a Fondos Inversión antes de esa extracción.

**Decisión: no reutilizar `stock-shared.ts` importándolo desde código de Fondos.** Mismo criterio que el resto de la app (`stocks`/`funds`/`cryptos`/`pensionPlans` duplican su esquema, servicios y DTOs casi al carácter en vez de generalizar sobre una entidad "posición" común — constitution.md, "tres líneas similares mejor que una abstracción prematura"). Se crea `frontend/src/pages/fund-shared.ts`, mismo contenido que `stock-shared.ts` adaptado a `Fund`/`FundPurchase`/`FundSale`/`FundValuation`:

- `fifoPositionState` (idéntica, solo renombrado el fichero de origen).
- `isFundPositionClosed` (equivalente a `isStockPositionClosed`).
- `totalRealizedGainLoss` (idéntica).
- `fundsTotal(funds, purchases, sales, valuations)`: mismo criterio que `stocksTotal` tras spec 031 — gana el parámetro `sales` y sustituye `totalShares(fundPurchases)` por `fifoPositionState(fundPurchases, fundSales).heldShares`.

`purchaseValue`/`currentValue`/`gainLossPercent`/`gainLossPercentWithDividends`/`totalDividends`/`grossDividend`/`totalGrossDividends` **no se duplican**: ya son genéricas (tipos estructurales) y `WealthPage.tsx` ya las importa una sola vez de `stock-shared.ts` para usarlas también con datos de Fondos (dividendos, spec 029/030) — se siguen importando de ahí tal cual, sin moverlas ni duplicarlas; solo el nombre del fichero (`stock-shared`) queda ya un poco impreciso, sin que afecte a esta spec.

### 4.1 Sustituye a `totalShares(fundPurchases)`/`totalCost(fundPurchases)` en Fondos Inversión

`totalShares`/`totalCost` (backend, `wealth.calculations.ts`) no se tocan — siguen siendo compras-brutas para Cripto (spec.md §2). En `WealthPage.tsx`, todo punto que hoy calcula el número de participaciones/coste de un fondo a partir de `totalShares(fundPurchases)`/`totalCost(fundPurchases)` pasa a usar `fifoPositionState(fundPurchases, fundSalesOfThatFund)` de `fund-shared.ts` (H3 criterios 1-3):

- Tarjeta de cada fondo (título, `card-amount`, `card-meta`, `gainLoss`) — spec 021 H3.
- `gainLossNet`/`gainLossGross` de esa misma tarjeta (spec 030 H1, ya aplicaba a Fondos).
- `fundsTotal()` (§4) — todas sus llamadas actualizadas (tarjeta "Total", `compositionData`, `profitabilityData`/spec 030 agregado).
- `fundsHeldCost(funds, purchases, sales)`, nueva, mismo patrón que `stocksHeldCost` (spec 031) — sustituye a `totalCost(purchases)` para Fondos en `contributionVsValueData`/H4 y `profitabilityData`/H5 (spec 028), y en el agregado de spec 030.

`purchases`/`Historial de compras` de cada fondo no cambia — sigue listando cada compra tal cual.

## 5. Frontend — UI

- `api/fund-sales.ts` — mismo patrón que `api/stock-sales.ts` (`FundSale`, `CreateFundSaleInput`, `UpdateFundSaleInput`, `list/create/update/delete`).
- `WealthPage.tsx`: estado (`fundSaleList`, formularios, errores...) y `reloadFundSales()` — mismo patrón que `stockSaleList`/spec 031, sobre Fondos.
- Dentro de cada tarjeta de fondo: **cuarto historial "Ventas"** (después de "Dividendos"), mismo patrón visual y textos que el de Acciones (H1: "Número de participaciones vendidas", "Precio de venta", "Fecha de venta" — mismas etiquetas ya usadas en compras de fondo, spec 021). Errores de validación (400) se muestran igual que cualquier otro `ApiError` ya manejado.
- `card-meta` del fondo: "X participaciones en cartera" / "Coste total" pasan a usar `fifoPositionState(...)` de `fund-shared.ts`; se añade "Ganancia/pérdida realizada: ±Z €" junto a "Dividendos cobrados" ya existente.
- `handleDeleteFund`: al borrar el fondo (cascada de la FK), añade `reloadFundSales()` al `Promise.all` ya existente.

## 6. Fuera de este plan

- Acciones (ya tiene venta, sin cambios), Cripto y el resto de categorías — sin cambios.
- Cualquier cálculo de impuestos sobre la ganancia de una venta.
- No se generaliza `fifoPositionState` en un fichero común a Acciones y Fondos — se duplica en `fund-shared.ts`, mismo criterio de "no abstracción prematura" que el resto de la app (§4).
