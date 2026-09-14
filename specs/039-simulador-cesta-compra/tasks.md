# Tasks — Spec 039 (Simulador de cesta de la compra)

**Fase:** 3 de 4

## Grupo 1 — Backend: modelo y CRUD de listas

- **T1.1** — Schema (`shopping-lists.schema.ts`: `shoppingLists`, `shoppingListItems`, plan.md §1) + migración Drizzle (`0029`). Aplicada contra Postgres real.
- **T1.2** — `ShoppingListsModule`/`Service`/`Controller`/DTOs: `GET/POST /shopping-lists`, `GET/PATCH/DELETE /shopping-lists/:id` (plan.md §2). Registrado en `app.module.ts`. Tests e2e: CRUD básico + aislamiento por usuario (un usuario no ve/edita/borra listas de otro).
- **T1.3** — Items de lista: `POST /shopping-lists/:id/items`, `DELETE /shopping-lists/:id/items/:itemId`. Valida que el producto existe y es del usuario (404); 409 si ya está en la lista (`isUniqueViolation`). Tests e2e: añadir, quitar, duplicado → 409, producto de otro usuario → 404, aislamiento por usuario.
- **T1.4** — `ProductsService.merge()` gana la reasignación/desduplicación de `shoppingListItems` (plan.md §3). Test e2e: fusionar dos productos que están en la misma lista deja un único item (el superviviente); fusionar dos productos en listas distintas reasigna cada uno correctamente.

## Grupo 2 — Cálculo de la simulación (frontend, función pura)

- **T2.1** — `basket-simulation.calculations.ts` (`computeBasketSimulation`, plan.md §4). Tests unitarios cubriendo: precio más reciente por producto+súper con varias fechas; cesta única más barata/más cara con 2+ candidatos; ningún supermercado cubre todos los productos (`cheapestSingle`/`mostExpensiveSingle` = `null`); un único candidato (mismo resultado en ambos); mixta más barata con reparto en varios súpers; mixta con menos súpers eligiendo menos supermercados que la mixta más barata aunque cueste algo más; producto sin ningún precio histórico → `missingProducts`, excluido de todos los totales; todos los productos sin datos.

## Grupo 3 — Frontend: páginas

- **T3.1** — `api/shopping-lists.ts`: cliente de los 7 endpoints (plan.md §5).
- **T3.2** — `ShoppingListsPage.tsx` (ruta `/tickets/cesta`): listado de listas con nº de productos, crear, borrar. Entrada de navegación en `AppLayout.tsx`. Test: crear una lista y verla en el listado; borrar una lista.
- **T3.3** — `ShoppingListDetailPage.tsx` (ruta `/tickets/cesta/:id`): renombrar la lista; buscador de productos (reutilizando `searchProducts`, excluyendo los ya presentes) para añadir; quitar producto de la lista. Test: añadir y quitar un producto; un producto ya en la lista no aparece en el buscador de añadir.
- **T3.4** — Botón "Generar" en `ShoppingListDetailPage.tsx`: `Promise.all` de `getProductPrices` por item, `computeBasketSimulation`, y render de los cuatro bloques de resultado (cesta única más barata/más cara, mixta más barata, mixta con menos súpers) con su desglose por producto; aviso si `cheapestSingle` es `null` o si hay `missingProducts`. Test: con datos de precios simulados, se muestran los cuatro bloques con los totales correctos; con un producto sin datos, aparece el aviso y el producto no cuenta en los totales.

## Grupo 4 — Cierre

- **T4.1** — Checklist de cierre H1-H2 (contraste criterio por criterio contra `spec.md`).
- **T4.2** — `npm run lint`, `tsc -b` (⚠️ no `tsc --noEmit` en `frontend/`, ver nota de memoria), `npm test`/`npm run test:e2e` en verde. Verificación manual real: crear una lista con productos que tengan precios en 2+ supermercados (y al menos uno sin dato en alguno), generar la simulación, comprobar a mano los cuatro resultados contra los tickets reales importados.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.
