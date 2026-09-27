# Tasks — Spec 044 (Venta de fondos de inversión)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `fundSales` en `wealth.schema.ts` + relaciones (plan.md §1). Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `FundSalesController`/`Service` + DTOs, mismo patrón que `StockSalesController`/`Service` (spec 031). Validación "no vender más de lo que queda en cartera" en `create()`/`update()` (plan.md §2, `BadRequestException`). Tests e2e: 401, aislamiento, crear/editar/borrar, 404 sobre un fondo ajeno, 400 al vender más de lo disponible (alta y edición), venta exacta del total disponible (límite, debe permitirse).
- **T2.2** — `FundPurchasesService.update()`/`remove()`: comprobación `assertSalesStillCovered` añadida (plan.md §2) — no aplica si el `fundId` no tiene ninguna venta (fast path). Tests e2e: editar/borrar una compra sin ventas (sin cambios de comportamiento), editar una compra reduciendo la cantidad por debajo de lo ya vendido → 400 sin aplicar el cambio, borrar una compra cuyas participaciones ya se vendieron → 400 sin borrarla.
- **T2.3** — `WealthModule` actualizado (`FundSalesController`/`Service` añadidos).

## Grupo 3 — Frontend

- **T3.1** — `api/fund-sales.ts` (plan.md §5).
- **T3.2** — `fund-shared.ts` nuevo: `fifoPositionState`/`isFundPositionClosed`/`totalRealizedGainLoss`/`fundsTotal` (plan.md §4) — mismo contenido que `stock-shared.ts` adaptado a `Fund`/`FundPurchase`/`FundSale`/`FundValuation`.
- **T3.3** — Sustituir `totalShares(fundPurchases)`/`totalCost(fundPurchases)` por `fifoPositionState(...).heldShares`/`.heldCost` en la tarjeta de cada fondo y en `gainLossNet`/`gainLossGross` (spec 030) — plan.md §4.1.
- **T3.4** — `fundsTotal()` con parámetro `sales` nuevo (todas sus llamadas actualizadas); `fundsHeldCost()` nueva, sustituyendo a `totalCost(purchases)` para Fondos en `contributionVsValueData`/`profitabilityData` (spec 028) y en el agregado de spec 030.
- **T3.5** — Cuarto historial "Ventas" en cada tarjeta de fondo (alta/edición/borrado, ganancia/pérdida por venta en verde/rojo) + "Ganancia/pérdida realizada" en `card-meta` — plan.md §5. `reloadFundSales()` añadido al `Promise.all` de `handleDeleteFund`.

## Grupo 4 — Tests y cierre

- **T4.1** — `fund-shared.test.ts` nuevo: mismos casos que `stock-shared.test.ts` (FIFO con varias compras a precios distintos, empate de fecha con `createdAt` como desempate, posición cerrada al 100%).
- **T4.2** — `WealthPage.test.tsx`: alta/edición/borrado de una venta de fondo, ganancia/pérdida de una venta calculada por FIFO, "participaciones en cartera"/"coste total" bajando tras una venta parcial, fondo vendido al 100% (sin coste/valor/% no realizado, con historial intacto), error 400 mostrado si se intenta vender de más, y que Total/spec 028/spec 030 reflejan lo que queda en cartera tras una venta. Verificar que los tests ya existentes de Fondos (spec 021/029/030) y de Acciones (spec 031) siguen en verde.
- **T4.3** — `npm test` (backend y frontend) y `tsc -b` (ambos) en verde. Revisión manual en el navegador: comprar en dos lotes a precios distintos, vender una cantidad que cruce ambos lotes, comprobar la ganancia/pérdida FIFO a mano, intentar vender de más (error visible), editar una compra anterior para dejar una venta sin cobertura (error visible, sin aplicar el cambio).

---

## Checklist de cierre — spec 044

### H1 — Registrar cada venta de un fondo

- [x] Criterio 1 (mismos campos que una compra, hasta 8 decimales, fecha de hoy por defecto): `CreateFundSaleDto`/`UpdateFundSaleDto` reutilizan `IsShareCount`/`IsSharePrice`; formulario con `todayIso()` por defecto. Verificado en `fund-sales.e2e-spec.ts` y manualmente.
- [x] Criterio 2 (no vender más de lo que queda en cartera): `FundSalesService.assertEnoughSharesHeld` — 400 con mensaje claro; tests e2e de alta y edición, incluida la venta exacta del límite (permitida).
- [x] Criterio 3 (cualquier número de ventas): sin restricción de cantidad — cubierto implícitamente por el resto de tests.
- [x] Criterio 4 (editar/eliminar una venta sin afectar a las demás; editar/eliminar una compra que deje una venta sin cobertura → error): `FundSalesService.update()`/`remove()` y `FundPurchasesService.assertSalesStillCovered()` — tests e2e en ambos ficheros.
- [x] Criterio 5 (aislamiento por usuario): `findOwnOrThrow()` vía `FundsService`; test e2e de 404 sobre un fondo ajeno en los tres verbos (crear/editar/borrar).

### H2 — Ver la ganancia o pérdida de cada venta

- [x] Criterio 1 (FIFO por orden cronológico real de todos los movimientos): `fifoPositionState` en `fund-shared.ts`, idéntica a la de Acciones (mismo desempate por `createdAt`, no por orden de entrada); test unitario en `fund-shared.test.ts` con compras del mismo día en orden invertido.
- [x] Criterio 2 (ganancia = venta − coste FIFO, calculada, nunca guardada): confirmado en `fund-shared.ts`; verificado manualmente (4×30 − 4×20 = 40,00 €).
- [x] Criterio 3 (verde/rojo según signo): mismo patrón visual que Acciones; verificado manualmente (+40,00 € en verde).
- [x] Criterio 4 (ganancia/pérdida realizada total de la posición): `totalRealizedGainLoss` en el `card-meta` del fondo; verificado manualmente.
- [x] Criterio 5 (sin impuestos): el bloque "Cálculo de impuestos" no se ha tocado — sigue exclusivo de Acciones.

### H3 — Número de participaciones y coste reflejan lo que queda en cartera

- [x] Criterio 1/2 ("en cartera" vía FIFO, no total histórico): sustituido `totalShares(fundPurchaseHistory)`/`totalCost(fundPurchaseHistory)` por `fifoPositionState(...).heldShares`/`.heldCost` en toda la tarjeta de fondo.
- [x] Criterio 3 (% no realizado con la misma fórmula, partiendo de lo que queda en cartera): `gainLossPercent`/`gainLossPercentWithDividends` alimentados con `fifoState`.
- [x] Criterio 4 (posición 100% vendida: sin coste/valor/% no realizado, historial intacto): cubierto por el split de posiciones abiertas/cerradas (`isFundPositionClosed`) + tests unitarios y de `WealthPage.test.tsx`.
- [x] Criterio 5 (agregados — Total, Composición, Aportado vs. valor actual, Rentabilidad por categoría, rentabilidad con dividendos): `fundsTotal`/`fundsHeldCost` actualizados y usados en todos los puntos; **verificado manualmente en el navegador** (ver abajo).

### Resultado del cierre

Sin huecos encontrados.

### Verificación final

**Backend**: `tsc -b` en verde. 259/259 tests unitarios. 102/102 en los ficheros e2e de fondos y acciones (`--no-file-parallelism`). Resto de la suite e2e en verde salvo un fallo preexistente y no relacionado (`goals-progress.e2e-spec.ts`) — confirmado con `git stash` que reproduce igual en la rama base, sin esta spec.

**Frontend**: `tsc -b` en verde. 610/613 en la suite completa — los 3 fallos son: dos preexistentes y no relacionados (`SyncStatusPanel.test.tsx`, aislamiento entre tests en paralelo, pasa en solitario) y uno preexistente dependiente de la fecha del sistema (`WealthPage.test.tsx`, prueba de "Liquidez") — confirmado con `git stash` que ambos reproducen igual en la rama base; quedan anotados como tareas aparte, no relacionados con esta spec.

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `prueba-fondos-venta@example.com`, creado, activado y eliminado al terminar): creado un fondo "Vanguard Global · MyInvestor" con una compra (10 participaciones a 20,00 €) y una valoración (25,00 €/participación, +25,00 %). Al vender 4 participaciones a 30,00 €, la tarjeta pasó a mostrar "6.00000000 participaciones en cartera · Coste total: 120,00 €" y "Ganancia/pérdida realizada: 40,00 €", con la venta en el historial mostrando "+40,00 €" en verde. La tarjeta "Aportado vs. valor actual" y "Rentabilidad por categoría" (spec 028) reflejaron automáticamente el coste en cartera (120,00 € aportado, 150,00 € valor actual, +25,0 % de rentabilidad) sin ningún cambio adicional necesario.

Con esto, **spec 044 queda cerrada**.
