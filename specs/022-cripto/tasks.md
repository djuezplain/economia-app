# Tasks — Spec 022 (Cripto)

**Fase:** 3 de 4

## Grupo 1 — Esquema y migración

- **T1.1** — `cryptos`/`cryptoPurchases`/`cryptoValuations` en `wealth.schema.ts`. Migración generada con `drizzle-kit generate` (`CREATE TABLE` puro, sin datos que preservar), aplicada a los entornos local (dev y test).

## Grupo 2 — Backend

- **T2.1** — `IsCryptoQuantity`/`IsCryptoPrice` (`backend/src/common/`). `totalCryptoQuantity`/`totalCryptoCost` en `wealth.calculations.ts` + tests unitarios.
- **T2.2** — `CryptosController`/`Service` + DTOs: CRUD con unicidad `exchange`+`crypto` por usuario (409), `remove()` en cascada. Tests e2e: 401, aislamiento, crear/editar/borrar, 409 en duplicado (incluido al editar), 404 sobre una posición ajena.
- **T2.3** — `CryptoPurchasesController`/`Service` + DTOs, mismo patrón que `StockPurchasesService`. Tests e2e equivalentes, incluida la cobertura de 8 decimales en cantidad y precio de compra.
- **T2.4** — `CryptoValuationsController`/`Service` + DTOs, mismo patrón con `date`. Tests e2e equivalentes (orden descendente, precio siempre positivo, 8 decimales).
- **T2.5** — `WealthModule` actualizado (nuevos controllers/services añadidos a la lista existente).

## Grupo 3 — Frontend

- **T3.1** — `api/cryptos.ts`, `api/crypto-purchases.ts`, `api/crypto-valuations.ts`.
- **T3.2** — `WealthPage.tsx`: nueva sección "Cripto" (alta/edición/borrado de la posición, con historial de compras e historial de valoraciones anidados, alta en un solo paso, % de ganancia/pérdida). Tarjeta "Total" ampliada con el tercer sumando. `Cripto` retirado de `PLACEHOLDER_SECTIONS`.
- **T3.3** — `WealthPage.test.tsx` actualizado: nuevo bloque "Cripto" con cobertura equivalente al de "Acciones", y actualización del test de "7 categorías"/tarjeta "Total" a las 3 categorías con datos.

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) y `tsc -b` (frontend) / `tsc -b`(backend) en verde. Revisión manual en el navegador: alta de una posición, varias compras a precios distintos, varias valoraciones fechadas (incluida una con precio por debajo de 1 céntimo), totales calculados correctos, intento de duplicar la posición (409 visible), edición/borrado a los tres niveles, borrar una posición borra también sus dos historiales, y la tarjeta "Total" incluye Cripto.
