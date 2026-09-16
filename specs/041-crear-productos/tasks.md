# Tasks — Spec 041 (Crear productos desde el listado)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — `ProductsService`: extraer `assertNoDuplicateName(userId, name, excludeId?)` de `update()` y reutilizarlo; nuevo `create(userId, name)` (plan.md §1). `ProductsController`: `POST /products` + `CreateProductDto`. Tests e2e: crea un producto; nombre duplicado (normalizado) → 409 sin `duplicateProductId`; `update()` sigue funcionando igual tras la extracción (regresión).

## Grupo 2 — Frontend

- **T2.1** — `api/groceries.ts`: `createProduct(name)`.
- **T2.2** — `ProductsPage.tsx`: formulario "Crear producto" (nombre + sección opcional de precio inicial: supermercado existente/nuevo, fecha, unidad, precio), flujo de dos llamadas (`createProduct` + `confirmReceiptImport` si hay precio), errores por separado, producto nuevo añadido al listado sin recargar (plan.md §3).
  Tests: crear solo con nombre; crear con precio completo (verifica que se llama a `confirmReceiptImport` con los datos correctos); nombre duplicado muestra el aviso y no llama a `confirmReceiptImport`; fallo de `confirmReceiptImport` muestra su propio aviso y el producto igualmente aparece en el listado; precio a medio rellenar (p. ej. solo fecha) bloquea el envío con un aviso de "todo o nada" (criterio 5).

## Grupo 3 — Cierre

- **T3.1** — Checklist de cierre H1.
- **T3.2** — `npm run lint`, `tsc -b`/`tsc --noEmit`, `npm test`/`npm run test:e2e` en verde. Verificación manual real: crear un producto sin precio (comprobar que su detalle se comporta como "sin tickets todavía", spec 037), crear otro con precio inicial (comprobar que aparece en el historial de tickets, en las estadísticas del producto y en el simulador de cesta como cualquier otro precio real), e intentar crear uno con un nombre ya existente.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 041 (T3.1)

### H1 — Crear un producto nuevo desde el listado

- [x] Criterio 1 (formulario con nombre + precio inicial opcional): `ProductsPage.test.tsx` (11 tests) + verificado manualmente (producto "Pasta" creado con Lidl, 01/10/2026, 1.35€/unidad).
- [x] Criterio 2 (duplicado normalizado bloqueado, aviso claro): `groceries.e2e-spec.ts` — "un nombre ya usado (normalizado) → 409..."; `ProductsPage.test.tsx` — "nombre duplicado muestra el aviso..."; verificado manualmente ("arroz" contra "Arroz" ya existente → "Ya tienes un producto con ese nombre.", sin duplicado creado).
- [x] Criterio 3 (aparece en el listado sin recargar): `ProductsPage.test.tsx`, todos los tests de creación; verificado manualmente.
- [x] Criterio 4 (sin precio, se crea igual, detalle como spec 037 H1 criterio 5): verificado manualmente — producto "Arroz" sin precio, su detalle mostró "Todavía no tienes ningún ticket con este producto." (mensaje ya existente, sin cambios).
- [x] Criterio 5 (precio/supermercado/fecha todo o nada): `ProductsPage.test.tsx` — "precio a medio rellenar bloquea el envío...".
- [x] Criterio 6 (fallo del precio no deshace el producto, aviso aparte): `ProductsPage.test.tsx` — "si falla el precio inicial, el producto igualmente queda creado...".

### Resultado del cierre

Sin huecos encontrados. **Verificación manual adicional, no pedida explícitamente por ningún criterio pero relevante**: el ticket sintético del precio inicial se comprobó también desde `/tickets/:id` (el ticket real) — aparece editable y borrable exactamente igual que un ticket importado de verdad (mismo `ReceiptDetailPage`, sin ninguna marca especial de "sintético"), confirmando que plan.md §2 ("reutiliza `POST /receipt-import/confirm` tal cual") funciona de extremo a extremo, no solo a nivel de API.

### T3.2 — Verificación final

Backend: `oxlint`/`tsc --noEmit` en verde (único warning preexistente y no relacionado). 259 unitarios + 632/632 e2e en verde (`--no-file-parallelism`).

Frontend: `tsc -b` en verde. `oxlint` sin warnings nuevos (los 9 existentes, ya documentados en cierres anteriores). 600/601 en verde (`--no-file-parallelism`) — único fallo, `WealthPage.test.tsx`, mismo test flaky preexistente ya documentado.

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `diego.prueba.041@example.com` creado, activado y eliminado al terminar): "Arroz" creado sin precio (su detalle se comportó como un producto sin tickets, sin cambios); "Pasta" creado con precio inicial (Lidl nuevo, 01/10/2026, 1.35€/unidad) — su detalle mostró estadísticas y precio más reciente exactamente como cualquier producto con tickets reales, y el ticket generado se pudo abrir, editar y borrar desde `/tickets/:id` igual que uno importado; "arroz" (mismo nombre normalizado que "Arroz") → bloqueado con el aviso esperado, sin duplicado creado.

Con esto, **spec 041 queda cerrada**.
