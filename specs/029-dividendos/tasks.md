# Tasks — Spec 029 (Dividendos)

**Fase:** 3 de 4

## Grupo 1 — Esquema, validación y migración

- **T1.1** — `stockDividends`/`fundDividends` en `wealth.schema.ts` (plan.md §1). Decorador nuevo `IsRetentionPercent` (`backend/src/common/is-retention-percent.decorator.ts`, plan.md §2) + test unitario (acepta 0/19/99.99, rechaza 100, negativos, más de 2 decimales). Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `grossDividend`/`totalDividends` en `wealth.calculations.ts` (plan.md §4) + tests unitarios (neto+retención → bruto correcto, retención 0 → bruto=neto, suma de varios dividendos).
- **T2.2** — `StockDividendsController`/`Service` + DTOs (`create-`/`update-stock-dividend.dto.ts`), mismo patrón que `StockPurchasesController`/`Service` — inyecta `StocksService`, reutiliza `findOwnOrThrow()`. Tests e2e: 401, aislamiento por usuario, crear/editar/borrar, 404 al crear sobre una acción ajena, 404 al editar/borrar un dividendo ajeno, borrar la acción borra en cascada sus dividendos, `retentionPercent` por defecto 19.00 si no se envía.
- **T2.3** — `FundDividendsController`/`Service` + DTOs, mismo patrón que T2.2 pero sobre `FundsService`/`funds`. Tests e2e equivalentes.
- **T2.4** — `WealthModule` actualizado (los cuatro controllers/services nuevos añadidos a las listas existentes).

## Grupo 3 — Frontend

- **T3.1** — `api/stock-dividends.ts`, `api/fund-dividends.ts` (plan.md §5).
- **T3.2** — `WealthPage.tsx`: tercer historial "Dividendos" anidado dentro de cada tarjeta de acción y de fondo (alta/edición/borrado, Importe neto + % Retención precargado a 19 + Fecha con hoy por defecto, Bruto calculado y mostrado en cada fila, total de dividendos de la posición). `stockDividendsTotal`/`fundDividendsTotal` (plan.md §5).
- **T3.3** — `WealthPage.tsx`: nueva tarjeta "💰 Dividendos cobrados" (desglose Acciones/Fondos Inversión), separada de la tarjeta "Total" de patrimonio — sin sumarse a ella.
- **T3.4** — `WealthPage.test.tsx` actualizado: alta/edición/borrado de un dividendo en Acciones y en Fondos, cálculo de bruto, total por posición, total agregado de la nueva tarjeta, y verificación explícita de que ese total **no** se cuela en la tarjeta "Total" de patrimonio existente.

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend), `tsc -b` (backend y frontend, no `tsc --noEmit`) en verde. Revisión manual en el navegador: añadir varios dividendos a una acción y a un fondo (con y sin cambiar el % de retención), comprobar el bruto calculado, editar y borrar un dividendo sin afectar a los demás ni a compras/valoraciones de la misma posición, borrar una acción/fondo borra también sus dividendos, la tarjeta "💰 Dividendos cobrados" suma correctamente y la tarjeta "Total" de patrimonio no cambia al añadir dividendos.
