# Tasks — Spec 023 (Vehículos)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `vehicles`/`vehicleValuations` en `wealth.schema.ts`. Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro, sin datos que preservar), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `VehiclesController`/`Service` + DTOs: CRUD con unicidad `brandModel`+`plate` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar), 404 sobre un vehículo ajeno.
- **T2.2** — `VehicleValuationsController`/`Service` + DTOs, mismo patrón que `BankAccountBalancesService`. Tests e2e equivalentes (orden descendente, valor siempre positivo, 404 sobre un vehículo ajeno).
- **T2.3** — `WealthModule` actualizado (nuevos controllers/services añadidos a la lista existente).

## Grupo 3 — Frontend

- **T3.1** — `api/vehicles.ts`, `api/vehicle-valuations.ts`.
- **T3.2** — `WealthPage.tsx`: nueva sección "Vehículos" (alta/edición/borrado del vehículo, con historial de valoraciones anidado, % de ganancia/pérdida). Tarjeta "Total" ampliada con el quinto sumando. `Vehículos` retirado de `PLACEHOLDER_SECTIONS`.
- **T3.3** — `WealthPage.test.tsx` actualizado: nuevo bloque "Vehículos" con cobertura equivalente al de "Cuentas Bancarias", y actualización del test de "7 categorías"/tarjeta "Total" a las 5 categorías con datos.

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc -b` en verde (backend y frontend). Revisión manual en el navegador: alta de un vehículo, varias valoraciones fechadas, % de ganancia/pérdida correcto (verde/rojo), intento de duplicar el vehículo (409 visible), edición/borrado a los dos niveles, borrar un vehículo borra también su historial de valoraciones, y la tarjeta "Total" incluye Vehículos.
