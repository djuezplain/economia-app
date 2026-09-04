# Tasks — Spec 020 (Acciones únicas)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `stocks`/`stockPurchases`/`stockValuations` en `wealth.schema.ts` (sustituyen a `stockEntries`). Migración generada en dos pasos + editada a mano para preservar los datos ya desplegados (plan.md §2), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — Elimina `StockEntriesController`/`Service`/DTOs/e2e-spec de spec 018 por completo. `totalShares`/`totalCost` en `wealth.calculations.ts` + tests.
- **T2.2** — `StocksController`/`Service` + DTOs: CRUD con unicidad `custodyBank`+`stock` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar), 404 sobre una acción ajena.
- **T2.3** — `StockPurchasesController`/`Service` + DTOs, mismo patrón que `BankAccountBalancesService` (spec 019) sin `date`. Tests e2e equivalentes.
- **T2.4** — `StockValuationsController`/`Service` + DTOs, mismo patrón con `date`. Tests e2e equivalentes (orden descendente, `valuation` siempre positivo).
- **T2.5** — `WealthModule` actualizado (nuevos controllers/services, quita los de spec 018 — `bank-accounts`/`bank-account-balances` sin cambios).

## Grupo 3 — Frontend

- **T3.1** — `api/stocks.ts`, `api/stock-purchases.ts`, `api/stock-valuations.ts` (sustituyen a `api/stock-entries.ts`, que se elimina).
- **T3.2** — `WealthPage.tsx`, sección "Acciones" reescrita: lista de acciones (alta/edición/borrado), cada una con nº total de acciones + coste total calculados, valoración más reciente visible, e historial de compras e historial de valoraciones anidados (alta/edición/borrado en cada uno).
- **T3.3** — `WealthPage.test.tsx` actualizado a las tres entidades nuevas (acción + compra + valoración).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc -b`/`tsc --noEmit` en verde. Revisión manual en el navegador: alta de una acción, varias compras a precios distintos, varias valoraciones fechadas, totales calculados correctos, intento de duplicar la acción (409 visible), edición/borrado a los tres niveles, y que borrar una acción borra también sus dos historiales.
