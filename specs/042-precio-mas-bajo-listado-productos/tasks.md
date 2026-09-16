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
