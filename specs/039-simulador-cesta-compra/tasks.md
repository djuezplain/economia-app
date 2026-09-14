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

---

## Checklist de cierre — spec 039 (T4.1)

### H1 — Crear y mantener listas de la compra

- [x] Criterio 1 (nombre + productos del catálogo, buscador): `ShoppingListDetailPage.test.tsx` — "añadir un producto excluye los ya presentes..."; buscador reutiliza `searchProducts` (mismo endpoint/UI que `ProductsPage`).
- [x] Criterio 2 (crear/renombrar/borrar lista, añadir/quitar productos): `ShoppingListsPage.test.tsx` (crear, borrar) + `ShoppingListDetailPage.test.tsx` (renombrar, añadir, quitar) + `shopping-lists.e2e-spec.ts` (16 tests, CRUD completo + aislamiento).
- [x] Criterio 3 (varias listas a la vez): sin límite en el modelo ni en el listado; verificado manualmente (una lista creada, listado la muestra junto a la posibilidad de crear más).
- [x] Criterio 4 (sin producto repetido): índice único `shopping_list_items_list_product_unique` + 409 (`shopping-lists.e2e-spec.ts` — "el mismo producto dos veces → 409"), y el buscador de añadir ya excluye los presentes.
- [x] Criterio 5 (sin cantidades): ningún campo de cantidad en el modelo, DTOs ni UI.

### H2 — Generar la simulación de una lista

- [x] Criterio 1 (más barato, cesta única): `basket-simulation.calculations.test.ts` + verificado manualmente (Mercadona 3.60€ con Leche/Pan/Huevos reales).
- [x] Criterio 2 (más caro, cesta única): mismo test + verificación manual (Carrefour 3.90€).
- [x] Criterio 3 (mixta más barata + ahorro importe/%): `basket-simulation.calculations.test.ts` + `ShoppingListDetailPage.test.tsx` ("muestra los cuatro bloques...") + verificación manual (3.40€, ahorra 0.20€/5.6%). **Hueco real encontrado en este cierre**: el cálculo del ahorro existía pero no se mostraba en la UI — corregido (commit `fix: mostrar el ahorro/diferencia...`).
- [x] Criterio 4 (mixta con menos súpers + diferencia frente a criterio 3): mismos tests + verificación manual (1 supermercado, 3.60€, "cuesta 0.20€ más"). Mismo hueco que el criterio 3, corregido en el mismo commit.
- [x] Criterio 5 (ningún súper cubre todo → aviso, mixtas se siguen mostrando): `basket-simulation.calculations.test.ts` ("sin ningún supermercado que cubra..."); UI: `!simulation.cheapestSingle` con `cheapestMixed` no nulo.
- [x] Criterio 6 (único candidato → mismo resultado en ambos): `basket-simulation.calculations.test.ts` — "con un único candidato...".
- [x] Criterio 7 (producto sin datos → excluido + aviso; todos sin datos → aviso distinto de "no hay suficiente información"): `basket-simulation.calculations.test.ts` + `ShoppingListDetailPage.test.tsx` (2 tests) + verificación manual (Queso sin ticket). **Segundo hueco encontrado en este cierre**: con todos los productos sin datos, no se mostraba ningún aviso (silencio, no error) — corregido (commit `fix: avisar explícitamente...`).
- [x] Criterio 8 (se calcula al vuelo, sin histórico guardado): sin tabla ni endpoint de histórico de simulaciones; `handleGenerate` recalcula desde cero en cada pulsación de "Generar".

### Interacción con spec 038 (fusión de productos)

- [x] Un producto fusionado no desaparece en silencio de las listas que lo tenían: `groceries.e2e-spec.ts` — 2 tests nuevos (reasignación simple y deduplicación cuando la lista ya tenía al superviviente).

### Resultado del cierre

Dos huecos reales encontrados y corregidos (ver arriba, ambos en la sección "Simulación" de `ShoppingListDetailPage`): faltaba mostrar el ahorro/diferencia entre opciones (H2 criterios 3-4), y faltaba el aviso de "no hay suficiente información" cuando ningún producto de la lista tiene datos (H2 criterio 7). Sin más huecos encontrados tras contrastar `spec.md` criterio por criterio.

### T4.2 — Verificación final

Backend: `oxlint` y `tsc -p tsconfig.build.json --noEmit` en verde (sin warnings nuevos — el único warning de `oxlint` es preexistente en `dashboard.e2e-spec.ts`, no relacionado). 259 unitarios en verde. 619/619 e2e en verde (`--no-file-parallelism`; en paralelo total fallan en bloque por contención de recursos locales contra el mismo Postgres compartido, no por el cambio — confirmado ejecutando los ficheros nuevos en aislado y luego la suite completa secuencial).

Frontend: `tsc -b` (no `tsc --noEmit`, ver nota de memoria) en verde. `oxlint` en verde. 590/591 en verde (`--no-file-parallelism`) — el único fallo es `WealthPage.test.tsx` (flaky preexistente, ya documentado en el cierre de spec 037; confirmado en aislado que pasa por sí solo).

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `diego.prueba.039@example.com` creado, activado y eliminado al terminar): supermercados Mercadona/Carrefour, productos Leche/Pan/Huevos con precios en ambos (y un cuarto producto, Queso, sin ningún ticket). Lista "Compra semanal" creada desde la UI con los 4 productos. Al generar:

- Más barato: Mercadona — 3.60€ (1.00+0.80+1.80, calculado a mano).
- Más caro: Carrefour — 3.90€ (1.50+0.70+1.70).
- Mixta más barata: 3.40€ en 2 supermercados (Leche en Mercadona, Pan y Huevos en Carrefour) — "Ahorras 0.20€ (5.6%) frente a la cesta única más barata."
- Mixta con menos súpers: 3.60€ en 1 supermercado (Mercadona, coincide con la cesta única más barata) — "Cuesta 0.20€ más que la opción mixta más barata."
- Queso: "Sin datos de precio para: Queso. No cuentan en los totales."

Todos los números coinciden exactamente con el cálculo manual. Quitar un producto de la lista funcionó correctamente en la UI real.

Con esto, **spec 039 queda cerrada**.
