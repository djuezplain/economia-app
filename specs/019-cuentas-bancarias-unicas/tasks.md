# Tasks — Spec 019 (Cuentas bancarias únicas)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `bankAccounts`/`bankAccountBalances` en `wealth.schema.ts` (sustituyen a `bankAccountEntries`). Migración generada + editada a mano para preservar los datos ya desplegados (plan.md §2), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — Elimina `BankAccountEntriesController`/`Service`/DTOs/e2e-spec de spec 018 por completo.
- **T2.2** — `BankAccountsController`/`Service` + DTOs: CRUD con unicidad `bank`+`accountNumber` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar hacia un duplicado), 404 sobre una cuenta ajena.
- **T2.3** — `BankAccountBalancesController`/`Service` + DTOs: CRUD, `create()` valida que `bankAccountId` es propio (404 si no). Tests e2e: 401, aislamiento (a través de la cuenta), CRUD feliz, orden descendente por fecha, `euros` negativo, 404 al crear sobre una cuenta ajena.
- **T2.4** — `WealthModule` actualizado (nuevos controllers/services, quita los de spec 018).

## Grupo 3 — Frontend

- **T3.1** — `api/bank-accounts.ts`, `api/bank-account-balances.ts` (sustituyen a `api/bank-account-entries.ts`, que se elimina).
- **T3.2** — `WealthPage.tsx`, sección "Cuentas Bancarias" reescrita: lista de cuentas (alta/edición/borrado), cada una con su historial de saldos anidado (alta/edición/borrado) y el saldo más reciente visible en la cabecera de la cuenta.
- **T3.3** — `WealthPage.test.tsx` actualizado a las nuevas dos entidades (cuenta + saldo).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc --noEmit` en ambos, en verde. Revisión manual en el navegador: alta de una cuenta, alta de varias entradas de saldo dentro de ella, intento de duplicar la cuenta (409 visible), edición y borrado a los dos niveles, y que borrar una cuenta borra también su historial.
