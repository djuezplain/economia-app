# Tasks — Spec 040 (Filtros en el historial de tickets)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — `ListReceiptsQueryDto` (plan.md §1) + `ReceiptsController.list()` la acepta.
- **T1.2** — `ReceiptsService.list()` filtra por `supermarketId`/`dateFrom`/`dateTo` (condiciones SQL) y calcula `linesTotal` por ticket (plan.md §2); `ReceiptSummary` gana `linesTotal`. Tests e2e: filtro por supermercado, por rango de fechas (incluidos los límites), validación cruzada `dateFrom > dateTo` → 400, `linesTotal` correcto en la respuesta.
- **T1.3** — `ReceiptsService.list()` filtra por `productId` y por rango de importe (`amountMin`/`amountMax`, sobre `linesTotal`) (plan.md §2). Tests e2e: filtro por producto (ticket con y sin ese producto), filtro de importe (límites inclusive/exclusive según corresponda), validación cruzada `amountMin > amountMax` → 400, combinación de varios filtros a la vez (Y lógico), aislamiento por usuario con filtros.

## Grupo 2 — Frontend

- **T2.1** — `api/groceries.ts`: `ReceiptSummary` gana `linesTotal`; `listReceipts()` acepta filtros opcionales y construye el query string.
- **T2.2** — `ReceiptsPage.tsx`: sección "Filtros" (supermercado, producto, fechas, importe), recarga automática al cambiar cualquiera, botón "Limpiar filtros", columna "Suma de líneas" en la tabla, mensaje distinto para "sin tickets en absoluto" vs. "sin resultados con estos filtros".
  Tests: cada filtro por separado devuelve los tickets esperados (mock de `listReceipts`); combinar dos filtros llama a `listReceipts` con ambos; "Limpiar filtros" vuelve a listar sin filtros; sin resultados muestra el mensaje correcto; con historial vacío desde el principio sigue mostrando el mensaje ya existente.

## Grupo 3 — Cierre

- **T3.1** — Checklist de cierre H1 (contraste criterio por criterio).
- **T3.2** — `npm run lint`, `tsc -b`/`tsc --noEmit`, `npm test`/`npm run test:e2e` en verde. Verificación manual real: tickets de 2+ supermercados y fechas distintas, filtrar por cada campo por separado y combinados, comprobar a mano que los resultados son los esperados.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 040 (T3.1)

### H1 — Filtrar el historial de tickets

- [x] Criterio 1 (supermercado, desplegable, "todos" por defecto): `ReceiptsPage.test.tsx` — "filtrar por supermercado llama a listReceipts con el filtro"; verificado manualmente (Mercadona/Carrefour). Los supermercados del desplegable ya son solo los que tienen algún ticket, por construcción (`supermarkets` solo se crea al confirmar un ticket, spec 034 §3) — sin filtrado adicional necesario.
- [x] Criterio 2 (rango de fechas, ambos opcionales independientes): `groceries.e2e-spec.ts` — "filtra por rango de fechas, límites incluidos"; `dateFrom`/`dateTo` sin relación entre sí en el DTO ni en el servicio.
- [x] Criterio 3 (producto, tickets con al menos una línea de ese producto): `groceries.e2e-spec.ts` — "filtra por productId..."; verificado manualmente (filtro "Pan" excluyó el ticket que solo tenía Leche).
- [x] Criterio 4 (importe sobre la suma real de líneas, no `printedTotal`): `groceries.e2e-spec.ts` — "filtra por rango de importe sobre linesTotal..."; **verificado manualmente de forma explícita** con un ticket con `printedTotal` NULL (fallo de OCR simulado) — el filtro `amountMin=20` sí lo incluyó porque su `linesTotal` (25.00€) cumplía el rango, confirmando que el criterio más delicado de esta spec funciona de verdad contra datos reales, no solo en el test.
- [x] Criterio 5 (Y lógico): `groceries.e2e-spec.ts` — "combina varios filtros a la vez (Y lógico)"; verificado manualmente (Mercadona + Pan → solo el ticket que cumple ambos).
- [x] Criterio 6 (sin filtro, historial completo igual que hoy): sin cambios en el comportamiento por defecto (`query = {}`); verificado manualmente y en `ReceiptsPage.test.tsx` (test ya existente de spec 034).
- [x] Criterio 7 (mensaje claro sin resultados, distinto de "sin tickets en absoluto"): `ReceiptsPage.test.tsx` — dos tests distintos para cada mensaje; verificado manualmente (`amountMin=1000` → "No hay tickets con estos filtros.").
- [x] Criterio 8 (limpiar de golpe, sin recargar): `ReceiptsPage.test.tsx` — "Limpiar filtros" vuelve a listar sin ningún filtro"; verificado manualmente.

### Resultado del cierre

Sin huecos encontrados. Una desviación de `plan.md` documentada en su propio commit (T2.2): el plan asumía una `<table>` para la nueva columna "Suma de líneas", pero `ReceiptsPage` ya usa tarjetas (`.card`) desde un rediseño posterior a cuando se escribió el plan — se adaptó al layout real (`card-meta`) en vez de forzar una tabla que ya no existe en esa página.

### T3.2 — Verificación final

Backend: `oxlint`/`tsc --noEmit` en verde (único warning preexistente y no relacionado, `dashboard.e2e-spec.ts`). 259 unitarios + 628/628 e2e en verde (`--no-file-parallelism`; en paralelo total la suite falla en bloque por contención de recursos locales contra el mismo Postgres compartido, no por este cambio — mismo comportamiento ya documentado en el cierre de spec 039).

Frontend: `tsc -b` en verde. `oxlint` sin warnings nuevos (los 9 existentes son de un patrón ya presente en varios ficheros de la app, `react(set-state-in-effect)`, no relacionado con este cambio). 595/596 en verde (`--no-file-parallelism`) — el único fallo es `WealthPage.test.tsx`, mismo test flaky preexistente ya documentado en cierres anteriores.

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `diego.prueba.040@example.com` creado, activado y eliminado al terminar): 3 tickets — Mercadona 10-ene (Leche, 10€), Carrefour 10-feb (Pan, 25€, **`printedTotal` NULL a propósito**), Mercadona 10-mar (Leche+Pan, 50€). Filtro por Mercadona → 2 tickets correctos; combinado con producto "Pan" → solo el del 10-mar; importe mínimo 20€ → los dos tickets de 25€ y 50€, **incluyendo el de `printedTotal` NULL** (confirma que el filtro usa `linesTotal`, no el total impreso); importe mínimo 1000€ → "No hay tickets con estos filtros."; "Limpiar filtros" → vuelve a los 3 tickets.

Con esto, **spec 040 queda cerrada**.
