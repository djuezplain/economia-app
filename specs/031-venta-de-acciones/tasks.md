# Tasks — Spec 031 (Venta de acciones)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `stockSales` en `wealth.schema.ts` + relaciones (plan.md §1). Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `StockSalesController`/`Service` + DTOs, mismo patrón que `StockPurchasesController`/`Service`. Validación "no vender más de lo que queda en cartera" en `create()`/`update()` (plan.md §2, `BadRequestException`). Tests e2e: 401, aislamiento, crear/editar/borrar, 404 sobre una acción ajena, 400 al vender más de lo disponible (alta y edición), venta exacta del total disponible (límite, debe permitirse).
- **T2.2** — `StockPurchasesService.update()`/`remove()`: comprobación añadida (plan.md §2) — no aplica si el `stockId` no tiene ninguna venta (fast path). Tests e2e: editar/borrar una compra sin ventas (sin cambios de comportamiento), editar una compra reduciendo la cantidad por debajo de lo ya vendido → 400 sin aplicar el cambio, borrar una compra cuyas acciones ya se vendieron → 400 sin borrarla.
- **T2.3** — `WealthModule` actualizado (`StockSalesController`/`Service` añadidos).

## Grupo 3 — Frontend

- **T3.1** — `api/stock-sales.ts` (plan.md §5).
- **T3.2** — `fifoPositionState`/`totalRealizedGainLoss` en `WealthPage.tsx` (plan.md §4).
- **T3.3** — Sustituir `totalShares(stockPurchases)`/`totalCost(stockPurchases)` por `fifoPositionState(...).heldShares`/`.heldCost` en la tarjeta de cada acción y en `gainLossNet`/`gainLossGross` (spec 030) — plan.md §4.1.
- **T3.4** — `stocksTotal()` con parámetro `sales` nuevo (todas sus llamadas actualizadas); `stocksHeldCost()` nueva, sustituyendo a `totalCost(purchases)` para Acciones en `contributionVsValueData`/`profitabilityData` (spec 028) y en el agregado de spec 030.
- **T3.5** — Cuarto historial "Ventas" en cada tarjeta de acción (alta/edición/borrado, ganancia/pérdida por venta en verde/rojo) + "Ganancia/pérdida realizada" en `card-meta` — plan.md §5. `reloadStockSales()` añadido al `Promise.all` de `handleDeleteStock`.

## Grupo 4 — Tests y cierre

- **T4.1** — `WealthPage.test.tsx`: alta/edición/borrado de una venta, ganancia/pérdida de una venta calculada por FIFO (caso con varias compras a precios distintos), "acciones en cartera"/"coste total" bajando tras una venta parcial, posición vendida al 100% (sin coste/valor/% no realizado, con historial intacto), error 400 mostrado si se intenta vender de más, y que Total/spec 028/spec 030 reflejan lo que queda en cartera tras una venta. Verificar que los tests ya existentes de Acciones (spec 020/029/030) siguen en verde.
- **T4.2** — `npm test` (backend y frontend) y `tsc -b` (ambos) en verde. Revisión manual en el navegador: comprar en dos lotes a precios distintos, vender una cantidad que cruce ambos lotes, comprobar la ganancia/pérdida FIFO a mano, intentar vender de más (error visible), editar una compra anterior para dejar una venta sin cobertura (error visible, sin aplicar el cambio).
