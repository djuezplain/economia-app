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
