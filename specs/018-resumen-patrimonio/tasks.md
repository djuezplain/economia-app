# Tasks — Spec 018 (Resumen Patrimonio)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `bankAccountEntries`/`stockEntries` en `db/schema/wealth.schema.ts`, exportadas desde `db/schema/index.ts`. Migración con `drizzle-kit generate` + aplicarla al entorno local (dev y test) para poder probar.

## Grupo 2 — Backend

- **T2.1** — `IsSignedMoneyAmount`, `IsShareCount` en `common/`. `wealth.calculations.ts` (`purchaseValue`) + test unitario.
- **T2.2** — `BankAccountEntriesController`/`Service` + DTOs (create/update), CRUD completo con aislamiento por usuario (`findOwnOrThrow`, 404 si no es propio). Tests e2e: 401 sin auth, aislamiento entre usuarios, CRUD feliz, `euros` negativo aceptado, orden descendente por fecha, 400 con datos inválidos.
- **T2.3** — `StockEntriesController`/`Service` + DTOs, mismo patrón. Tests e2e equivalentes (sin el caso de fecha, ya que `stockEntries` no la lleva).
- **T2.4** — `WealthModule` (`bank-account-entries` + `stock-entries`), registrado en `AppModule`.

## Grupo 3 — Frontend

- **T3.1** — `api/bank-account-entries.ts`, `api/stock-entries.ts`.
- **T3.2** — `WealthPage.tsx`: 7 secciones plegables con icono (spec.md decisión 3), Cuentas Bancarias y Acciones con lista + alta + edición in-line + borrado (mismo patrón que `GoalsPage.tsx` para presupuestos), las otras 5 con aviso "Próximamente.".
- **T3.3** — Ruta `/patrimonio` en `App.tsx`, entrada "Resumen Patrimonio" en `NAV_ITEMS` de `AppLayout.tsx`.
- **T3.4** — Tests de `WealthPage.tsx`: las 7 secciones minimizadas al entrar, alta/edición/borrado de una entrada de Cuentas Bancarias y de Acciones (con `Valor compra` calculado en pantalla, no editable), `Fecha` por defecto a hoy en el formulario de alta de Cuentas Bancarias, aviso de "Próximamente" en las 5 categorías sin implementar, aislamiento (sin sesión no llama a ninguna API).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc --noEmit` en ambos, en verde. Revisión manual en el navegador: crear/editar/eliminar entradas de las dos categorías, comprobar que `Valor compra` se recalcula solo, y que las 7 secciones se pliegan/despliegan de forma independiente.
