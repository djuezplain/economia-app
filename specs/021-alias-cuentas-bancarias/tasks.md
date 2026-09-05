# Tasks — Spec 021 (Alias para cuentas bancarias)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — Columna `alias` (nullable) en `bankAccounts` (`wealth.schema.ts`). Migración generada con `drizzle-kit generate` y aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `CreateBankAccountDto`/`UpdateBankAccountDto`: campo `alias` opcional. `BankAccountsService.create()`/`update()` normalizan cadena vacía/espacios a `null`. Tests e2e actualizados/añadidos: crear con alias, crear sin alias, editar para añadir/quitar alias, y que el alias no interfiere con el 409 de duplicado (misma cuenta, alias distinto sigue dando 409; distinta cuenta, mismo alias no da 409).

## Grupo 3 — Frontend

- **T3.1** — `api/bank-accounts.ts`: `alias` en `BankAccount`/`BankAccountInput`.
- **T3.2** — `WealthPage.tsx`: campo "Alias" en alta y edición de cuenta; helper `accountLabel()`; card-title/card-meta muestran el alias cuando existe.
- **T3.3** — `WealthPage.test.tsx` actualizado: cubre alta con alias, y que se muestra en la lista.

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc -b` en frontend (`tsc --noEmit` no vale — ver nota de gotcha conocida) en verde. Revisión manual: crear cuenta con alias, editar para quitarlo, y que sigue funcionando el 409 de duplicado.
