# Tasks — Spec 025 (Efectivo)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `cashHoldings`/`cashBalances` en `wealth.schema.ts`. Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `CashHoldingsController`/`Service` + DTOs: CRUD con unicidad `location` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar), 404 sobre una ubicación ajena.
- **T2.2** — `CashBalancesController`/`Service` + DTOs, mismo patrón que `BankAccountBalancesService`. Tests e2e equivalentes (orden descendente, importe siempre positivo, 404 sobre una ubicación ajena).
- **T2.3** — `WealthModule` actualizado (nuevos controllers/services añadidos a la lista existente).

## Grupo 3 — Frontend

- **T3.1** — `api/cash-holdings.ts`, `api/cash-balances.ts`.
- **T3.2** — `WealthPage.tsx`: nueva sección "Efectivo" (alta/edición/borrado de la ubicación, con historial de importes anidado). Tarjeta "Total" ampliada con el séptimo sumando. `Efectivo` retirado de `PLACEHOLDER_SECTIONS` (queda vacío).
- **T3.3** — `WealthPage.test.tsx` actualizado: nuevo bloque "Efectivo" con cobertura equivalente al de "Cuentas Bancarias", y actualización del test de "7 categorías"/tarjeta "Total" a las 7 categorías con datos (0 sin implementar).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend), `tsc -b` (backend y frontend) en verde. Revisión manual en el navegador: alta de una ubicación, varias entradas fechadas, intento de duplicar la ubicación (409 visible), edición/borrado a los dos niveles, borrar una ubicación borra también su historial, y la tarjeta "Total" incluye Efectivo. Cierre de spec 018 (Resumen Patrimonio): las 7 categorías están implementadas.
