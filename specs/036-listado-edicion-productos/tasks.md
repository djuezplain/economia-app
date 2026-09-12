# Tasks — Spec 036 (Listado y edición de productos)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — `ProductsService.getById()`/`update()` (plan.md §2), `UpdateProductDto`. `GET /products/:id` y `PATCH /products/:id` en `ProductsController` (plan.md §1).
  Tests e2e: `GET /products/:id` de otro usuario → 404; `PATCH` cambia el nombre; `PATCH` a un nombre que normalizado coincide con otro producto propio → 409, nada cambia; `PATCH` de otro usuario → 404; renombrar no cambia `receiptLines.description` de los tickets ya guardados.

## Grupo 2 — Frontend

- **T2.1** — `api/groceries.ts`: `getProduct(id)`, `updateProduct(id, name)`.
- **T2.2** — `ProductsPage.tsx` (sustituye a `ProductPricesPage.tsx`): listado con buscador, cada resultado enlaza a `/tickets/productos/:id`.
- **T2.3** — `ProductDetailPage.tsx`: nombre editable + tabla de precios (`GET /products/:id/prices`, sin cambios de criterio respecto a la que tenía `ProductPricesPage`). Ruta `/tickets/productos/:id` en `App.tsx`, nav actualizado a "Productos".
  Tests: listado filtra por búsqueda y enlaza a cada detalle; detalle muestra nombre y precios; editar el nombre y guardar llama a `updateProduct`; un 409 del backend se muestra sin perder el valor editado.

## Grupo 3 — Cierre

- **T3.1** — Checklist de cierre H1-H3.
- **T3.2** — `npm run lint`, `tsc -b`, `npm test`/`npm run test:e2e` en verde. Verificación manual: listar productos, entrar en el detalle, renombrar uno, comprobar que sus tickets ya guardados no cambian.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 036 (T3.1)

### H1 — Ver el listado de todos mis productos

- [x] Criterio 1 (todos, alfabético): `ProductsService.search()` ya ordenaba por nombre (spec 034); `ProductsPage.test.tsx` — "lista todos los productos al cargar...".
- [x] Criterio 2 (buscar filtra): `ProductsPage.test.tsx` — "buscar filtra la lista".

### H2 — Ver el detalle de un producto

- [x] Criterio 1 (nombre): `ProductDetailPage.test.tsx` — "muestra el nombre y la tabla de precios...".
- [x] Criterio 2 (precio por supermercado, ordenado): mismo test; lógica de `getPrices` sin cambios (spec 034).

### H3 — Editar el nombre de un producto

- [x] Criterio 1 (editable): `ProductDetailPage.test.tsx` — "editar el nombre y guardar llama a updateProduct".
- [x] Criterio 2 (409 si coincide normalizado, sin fusionar): `test/groceries.e2e-spec.ts` — "PATCH /products/:id a un nombre que coincide (normalizado)..."; `ProductDetailPage.test.tsx` — "un 409 del backend se muestra sin perder el valor editado".
- [x] Criterio 3 (no afecta a `description` de líneas ya guardadas): `test/groceries.e2e-spec.ts` — "PATCH /products/:id cambia el nombre, sin afectar a las líneas ya guardadas".

### Aislamiento

- [x] `GET`/`PATCH /products/:id` de otro usuario → 404, nada cambia: 2 tests dedicados.

### Resultado del cierre

Todos los criterios de H1-H3 cubiertos. Sin huecos encontrados.

### T3.2 — Verificación final

Backend: build/lint en verde; 232 unitarios + 578 e2e en verde. Encontrado y corregido durante el cierre: `groceries.e2e-spec.ts` superó los 20 `login()` del límite real de `POST /auth/login` al añadir los tests de esta spec — mismo patrón ya documentado en `RateLimitGuard.resetForTests()` (encontrado antes en `transactions.e2e-spec.ts`), corregido llamando a `resetForTests()` en el `beforeEach`.

Frontend: `tsc -b`/lint en verde (sin warnings nuevos); 547/548 tests en verde — el fallo restante es el mismo pre-existente y no relacionado ya documentado en cierres anteriores (`WealthPage.test.tsx`, fecha-dependiente).

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba creado y eliminado al terminar): listado con 2 productos, entré en "Chocolate Classic" (nombre editable + tabla de precios con Mercadona 1,30 €), lo renombré a "Chocolate Classic Corregido" y confirmé en `psql` que la línea del ticket ya guardado sigue con su descripción original (`CHOCOLATE CLASSIC`) — H3 criterio 3 verificado con datos reales, no solo en test.

Con esto, **spec 036 queda cerrada**.
