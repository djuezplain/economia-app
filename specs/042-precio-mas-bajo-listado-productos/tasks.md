# Tasks — Spec 042 (Precio más bajo reciente en el listado de productos)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — `ProductsService.search()` calcula `lowestRecentPrice` por producto (plan.md §1); `ProductSummary`/`ProductLowestPrice` nuevos. Tests e2e: producto con precios en 2+ supermercados (se queda con el más bajo de los más recientes, no el histórico más bajo); producto en un único supermercado; producto sin ningún ticket → `null`; varias fechas en el mismo supermercado (se usa la más reciente); aislamiento por usuario.

## Grupo 2 — Frontend

- **T2.1** — `api/groceries.ts`: `Product` gana `lowestRecentPrice`.
- **T2.2** — `ProductsPage.tsx`: cada fila muestra el precio y supermercado, o "—" sin datos.
  Tests: fila con precio muestra precio + supermercado; fila sin datos muestra "—"; búsqueda sigue funcionando igual (regresión).

## Grupo 3 — Cierre

- **T3.1** — Checklist de cierre H1.
- **T3.2** — `npm run lint`, `tsc -b`/`tsc --noEmit`, `npm test`/`npm run test:e2e` en verde. Verificación manual real: un producto comprado en 2 supermercados con precios y fechas distintas, comprobar a mano cuál de los dos "precio más reciente" es el más bajo y que coincide con lo mostrado.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 042 (T3.1)

### H1 — Ver el precio más barato reciente en el listado

- [x] Criterio 1 (precio + supermercado junto a cada producto): `groceries.e2e-spec.ts` (4 tests) + `ProductsPage.test.tsx` + verificado manualmente.
- [x] Criterio 2 (sin tickets → "—", sin datos vacíos sin explicar): `groceries.e2e-spec.ts` — "un producto sin ningún ticket → null"; `ProductsPage.test.tsx` — "sin datos de precio, muestra..."; verificado manualmente ("Queso" → "—").
- [x] Criterio 3 (un único supermercado, ese es el resultado): `groceries.e2e-spec.ts` — "con un único supermercado..."; verificado manualmente ("Pan", solo Mercadona).
- [x] Criterio 4 (sin cambios en el comportamiento de búsqueda): tests ya existentes de spec 034 (búsqueda por nombre) siguen en verde sin modificar.

### Resultado del cierre

Sin huecos encontrados. El criterio más delicado de esta spec (más bajo de los **recientes**, no el histórico) se verificó explícitamente tanto en test (`groceries.e2e-spec.ts` — "se queda con el más bajo de los PRECIOS MÁS RECIENTES") como a mano contra datos reales: "Leche" con un precio antiguo de 0.50€ en Mercadona (ya no relevante) y precios más recientes de 1.50€ (Mercadona) y 1.10€ (Carrefour) mostró correctamente 1.10€ (Carrefour), no 0.50€.

### T3.2 — Verificación final

Backend: `oxlint`/`tsc --noEmit` en verde (único warning preexistente y no relacionado). 259 unitarios + 636/636 e2e en verde (`--no-file-parallelism`).

Frontend: `tsc -b` en verde. `oxlint` sin warnings nuevos (los 9 existentes, ya documentados en cierres anteriores). 602/603 en verde (`--no-file-parallelism`) — único fallo, `WealthPage.test.tsx`, mismo test flaky preexistente ya documentado.

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `diego.prueba.042@example.com` creado, activado y eliminado al terminar): "Leche" con precio antiguo bajo en Mercadona (0.50€, enero) y precios más recientes en Mercadona (1.50€, marzo) y Carrefour (1.10€, abril) → mostró "1.100 € (Carrefour)", confirmando que usa el más bajo de los recientes y no el histórico; "Pan" solo en Mercadona → "0.900 € (Mercadona)"; "Queso" sin ningún ticket → "—".

Con esto, **spec 042 queda cerrada**.
