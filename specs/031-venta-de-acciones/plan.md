# Plan — Spec 031 (Venta de acciones)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/wealth.schema.ts`: una tabla nueva, `stockSales`, junto a `stockPurchases`/`stockDividends` — mismos campos y misma precisión que una compra (H1 criterio 1: hasta 8 decimales en cantidad y precio, `IsShareCount`/`IsSharePrice` reutilizados, ningún decorador nuevo).

```ts
export const stockSales = pgTable(
  'stock_sales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stockId: uuid('stock_id').notNull().references(() => stocks.id, { onDelete: 'cascade' }),
    shareCount: numeric('share_count', { precision: 18, scale: 8 }).notNull(),
    salePrice: numeric('sale_price', { precision: 18, scale: 8 }).notNull(),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('stock_sales_stock_idx').on(table.stockId), index('stock_sales_stock_date_idx').on(table.stockId, table.date)],
);
```

Sin `userId` propio (aislamiento vía `stocks.userId`), mismo criterio que `stockPurchases`/`stockDividends`. Relación `stocksRelations.sales: many(stockSales)` + `stockSalesRelations`. Migración `CREATE TABLE` pura (siguiente número tras `0023`).

## 2. Validación — "no vender más de lo que queda en cartera" (H1 criterio 2/4)

**Solo el total importa, no el orden cronológico** (spec.md H1 criterio 2: "sin tener en cuenta la fecha de la venta") — así que la validación de escritura es una simple resta de sumas, no una simulación FIFO completa (esa sí hace falta para el cálculo de ganancia/pérdida por venta, pero es un cálculo de lectura, ver §4). Reutiliza `totalShares` (`wealth.calculations.ts`, ya genérica sobre `{ shareCount: string }[]`, sirve igual para compras que para ventas):

```ts
const purchased = new Decimal(totalShares(purchasesOfThisStock));
const alreadySold = new Decimal(totalShares(salesOfThisStock.filter((s) => s.id !== excludeSaleId)));
const held = purchased.minus(alreadySold);
if (new Decimal(shareCountBeingSold).greaterThan(held)) {
  throw new BadRequestException(`No puedes vender ${shareCountBeingSold} acciones: solo quedan ${held} en cartera.`);
}
```

- `StockSalesService.create()`/`update()`: aplican esta comprobación (en `update()`, `excludeSaleId` es la propia venta que se edita — no se compara contra sí misma).
- `StockSalesService.remove()`: no necesita la comprobación — eliminar una venta nunca deja "menos cartera", solo puede aumentarla.
- `StockPurchasesService.update()`/`remove()` (H1 criterio 4, "editar/eliminar una compra anterior"): antes de aplicar el cambio, si el `stockId` tiene alguna venta (`stockSales.findMany`, salta la comprobación entera si no hay ninguna — caso común, sin coste extra), recalculan `purchased` con el cambio ya aplicado (nueva cantidad, o sin esa compra si se borra) y comprueban `totalShares(allSalesOfThisStock) <= purchased`; si no, `BadRequestException` y no se aplica el cambio.
- Todas usan `BadRequestException` (400) — es una validación de regla de negocio dependiente del estado actual, no una colisión de unicidad (que en esta app siempre es 409, p. ej. `StocksService`).

## 3. Endpoints

Un recurso nuevo, mismo patrón CRUD que `stock-purchases`: `GET/POST /stock-sales`, `PATCH/DELETE /stock-sales/:id`. `StockSalesController`/`StockSalesService` inyectan `StocksService` y reutilizan su `findOwnOrThrow()`, igual que `StockPurchasesService`. `WealthModule` añade el controller/service nuevo.

DTOs (`create-stock-sale.dto.ts`/`update-stock-sale.dto.ts`): mismos campos y decoradores que `create-stock-purchase.dto.ts` (`stockId`/`IsUUID`, `shareCount`/`IsShareCount`, `salePrice`/`IsSharePrice`, `date`/`IsDateString`).

## 4. Cálculos — simulación FIFO (solo frontend)

Igual que `gainLossPercent`/`totalDividends`/`grossDividend`, la ganancia/pérdida por venta y el "número de acciones en cartera" son **cálculos de lectura, nunca guardados** — viven solo en `WealthPage.tsx`, no en `wealth.calculations.ts` del backend (que no los necesita: la única validación de backend, §2, es una resta de totales, no FIFO).

```ts
/** H2 criterio 1/2 (spec 031): simula FIFO sobre TODOS los movimientos (compras y ventas) de una
 *  posición, ordenados cronológicamente (fecha; en caso de empate, compras antes que ventas — H1
 *  criterio 2, mismo día). Devuelve lo que queda en cartera (cantidad y coste FIFO) y la
 *  ganancia/pérdida de cada venta individual, indexada por su id. */
function fifoPositionState(
  purchases: Array<{ id: string; date: string; shareCount: string; purchasePrice: string; createdAt: string }>,
  sales: Array<{ id: string; date: string; shareCount: string; salePrice: string; createdAt: string }>,
): { heldShares: string; heldCost: string; realizedGainLossBySaleId: Record<string, string> } {
  const events = [
    ...purchases.map((p) => ({ type: 'buy' as const, date: p.date, createdAt: p.createdAt, id: p.id, qty: parseFloat(p.shareCount), price: parseFloat(p.purchasePrice) })),
    ...sales.map((s) => ({ type: 'sell' as const, date: s.date, createdAt: s.createdAt, id: s.id, qty: parseFloat(s.shareCount), price: parseFloat(s.salePrice) })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  const lots: Array<{ remaining: number; price: number }> = [];
  const realizedGainLossBySaleId: Record<string, string> = {};

  for (const event of events) {
    if (event.type === 'buy') {
      lots.push({ remaining: event.qty, price: event.price });
      continue;
    }
    let toConsume = event.qty;
    let costBasis = 0;
    while (toConsume > 0 && lots.length > 0) {
      const lot = lots[0];
      const consumed = Math.min(lot.remaining, toConsume);
      costBasis += consumed * lot.price;
      lot.remaining -= consumed;
      toConsume -= consumed;
      if (lot.remaining <= 0) lots.shift();
    }
    // toConsume > 0 aquí solo puede pasar con datos inconsistentes (p. ej. se borró una compra
    // después de registrar la venta, sin pasar por la validación de §2) — el coste de lo no
    // cubierto se trata como 0, degradando con gracia en vez de lanzar un error de renderizado.
    realizedGainLossBySaleId[event.id] = (event.qty * event.price - costBasis).toFixed(2);
  }

  return {
    heldShares: lots.reduce((sum, lot) => sum + lot.remaining, 0).toFixed(8),
    heldCost: lots.reduce((sum, lot) => sum + lot.remaining * lot.price, 0).toFixed(2),
    realizedGainLossBySaleId,
  };
}

/** H2 criterio 4: total de ganancia/pérdida realizada de una posición — suma de
 *  `realizedGainLossBySaleId` de su propio `fifoPositionState`. */
function totalRealizedGainLoss(fifoState: { realizedGainLossBySaleId: Record<string, string> }): string {
  return Object.values(fifoState.realizedGainLossBySaleId).reduce((sum, v) => sum + parseFloat(v), 0).toFixed(2);
}
```

**Revisión durante la implementación:** la primera versión desempataba el mismo día/tipo con `a.type === b.type ? 0 : ...`, dejando que `Array.prototype.sort` (estable) conservara el orden de `purchases`/`sales` de entrada como desempate implícito. Encontrado con datos reales al probar la spec a mano: `StockPurchasesService.list()` (H2, spec 020) devuelve las compras por fecha **descendente** (la más reciente primero, para la UI) — así que, con dos compras del mismo día, ese orden de entrada es el inverso del orden real de compra, y el "empate a 0" acababa consumiendo primero la compra más reciente en vez de la más antigua (FIFO invertido en silencio, solo en empates de fecha). Corregido añadiendo `createdAt` (momento real de alta de cada compra/venta) como tercer criterio de desempate, independiente del orden del array de entrada — cubierto por un test de regresión en `WealthPage.test.tsx` que alimenta las compras en el mismo orden [más reciente, más antigua] que sirve la API real.

### 4.1 Sustituye a `totalShares(stockPurchases)`/`totalCost(stockPurchases)` en Acciones

`totalShares`/`totalCost` **no se tocan** (siguen siendo compras-brutas, tal cual, para Fondos/Cripto — spec.md §2, "solo Acciones"). En su lugar, todo punto de `WealthPage.tsx` que hoy calcula el número de acciones/coste de una posición **de Acciones** a partir de `totalShares(stockPurchases)`/`totalCost(stockPurchases)` pasa a usar `fifoPositionState(stockPurchases, stockSalesOfThatStock).heldShares`/`.heldCost` (H3 criterios 1-3):

- Tarjeta de cada acción (título, `card-amount`, `card-meta`, `gainLoss`) — spec 020 H3.
- `gainLossNet`/`gainLossGross` de esa misma tarjeta (spec 030 H1).
- `stocksTotal()`: añade un parámetro `sales: StockSale[]` y usa `fifoPositionState(...).heldShares` en vez de `totalShares(stockPurchases)` — se actualizan todas sus llamadas (tarjeta "Total", `compositionData`, `profitabilityData`/spec 030 agregado).
- Dos funciones nuevas de agregado, mismo patrón que `stocksTotal`: `stocksHeldCost(stocks, purchases, sales)` (suma `heldCost` de cada posición — sustituye a `totalCost(purchases)` para Acciones en `contributionVsValueData`/H4 y `profitabilityData`/H5 de spec 028, y en el agregado de spec 030).

`purchases`/`Historial de compras` de cada acción **no cambia** — sigue listando cada compra tal cual (H1 no toca compras, spec.md §2).

## 5. Frontend — UI

- `api/stock-sales.ts` — mismo patrón que `api/stock-purchases.ts` (`StockSale`, `CreateStockSaleInput`, `UpdateStockSaleInput`, `list/create/update/delete`).
- `WealthPage.tsx`: estado (`stockSaleList`, formularios, errores...) y `reloadStockSales()` — mismo patrón que `stockDividendList`/spec 029 (un `useEffect` de carga más).
- Dentro de cada tarjeta de acción: **cuarto historial "Ventas"** (después de "Dividendos"), mismo patrón visual (alta con Fecha de hoy por defecto, cada venta editable/eliminable, ganancia/pérdida de cada venta en verde/rojo). Errores de validación de §2 (400) se muestran igual que cualquier otro `ApiError` ya manejado (p. ej. `createDividendError`).
- `card-meta` de la posición: "X acciones en cartera" / "Coste total" pasan a usar `fifoPositionState(...)` (§4.1); se añade "Ganancia/pérdida realizada: ±Z €" (H2 criterio 4) junto a "Dividendos cobrados" ya existente.
- `handleDeleteStock`: al borrar la acción (cascada de la FK), añade `reloadStockSales()` al `Promise.all` ya existente — mismo criterio que `reloadStockDividends()` (spec 029).

## 6. Fuera de este plan

- Fondos Inversión, Cripto y el resto de categorías — sin cambios (spec.md §2).
- Cualquier cálculo de impuestos sobre la ganancia de una venta — spec.md §2.
- No se generaliza `fifoPositionState` para Fondos/Cripto — es específica de Acciones, mismo criterio que el resto de esta spec.
