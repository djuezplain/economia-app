# Tasks — Spec 024 (Fondo Pensiones)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `pensionPlans`/`pensionPlanContributions`/`pensionPlanValuations` en `wealth.schema.ts`. Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `totalContributions` en `wealth.calculations.ts` + test unitario.
- **T2.2** — `PensionPlansController`/`Service` + DTOs: CRUD con unicidad `managingEntity`+`plan` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar), 404 sobre una posición ajena.
- **T2.3** — `PensionPlanContributionsController`/`Service` + DTOs, mismo patrón que `CryptoPurchasesService` sin cantidad/precio. Tests e2e equivalentes.
- **T2.4** — `PensionPlanValuationsController`/`Service` + DTOs, mismo patrón con `date`. Tests e2e equivalentes (orden descendente, valor siempre positivo, 404 sobre una posición ajena).
- **T2.5** — `WealthModule` actualizado (nuevos controllers/services añadidos a la lista existente).

## Grupo 3 — Frontend

- **T3.1** — `api/pension-plans.ts`, `api/pension-plan-contributions.ts`, `api/pension-plan-valuations.ts`.
- **T3.2** — `WealthPage.tsx`: nueva sección "Fondo Pensiones" (alta/edición/borrado de la posición, con historial de aportaciones e historial de valoraciones anidados, alta en un solo paso, % de ganancia/pérdida). Tarjeta "Total" ampliada con el sexto sumando. `Fondo Pensiones` retirado de `PLACEHOLDER_SECTIONS`.
- **T3.3** — `WealthPage.test.tsx` actualizado: nuevo bloque "Fondo Pensiones" con cobertura equivalente al de "Cripto", y actualización del test de "7 categorías"/tarjeta "Total" a las 6 categorías con datos (solo Efectivo sin implementar).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend), `tsc -b` (backend y frontend) en verde. Revisión manual en el navegador: alta de una posición, varias aportaciones, varias valoraciones fechadas, % de ganancia/pérdida correcto (verde/rojo), intento de duplicar la posición (409 visible), edición/borrado a los tres niveles, borrar una posición borra también sus dos historiales, y la tarjeta "Total" incluye Fondo Pensiones.
