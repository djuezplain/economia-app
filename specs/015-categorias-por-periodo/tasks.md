# Tasks — Spec 015 (Categorías con comparativa de periodo)

**Fase:** 3 de 4

## Grupo 1 — Cálculos puros (backend)

- **T1.1** — `categoryComparison()` en `dashboard.calculations.ts` (reutiliza `periodRanges`, `percentChange`, `groupByCategory` ya existentes; no las modifica). Tests unitarios en `dashboard.calculations.spec.ts`: varias categorías con importes distintos en ambos periodos (orden desc por `total`), categoría nueva (`previousTotal` 0 → `change: null`), categoría con el mismo importe en ambos periodos (`change: "0.00"`), categoría con movimientos solo en el periodo anterior (no aparece en el resultado), lista vacía cuando no hay movimientos del `type` pedido en el periodo actual.

## Grupo 2 — Endpoint

- **T2.1** — `DashboardCategoryComparisonQueryDto` (`period` restringido a `month`/`year`, `type` a `INCOME`/`EXPENSE`), `DashboardService.categoryComparison()`, `GET /dashboard/category-comparison` en el controlador. Tests e2e en `dashboard-category-comparison.e2e-spec.ts` (fichero nuevo): 401 sin auth, aislamiento por usuario (categoría de otro usuario nunca aparece), cálculo con fechas fijas y `period=month` (mes cerrado, para no depender de la fecha del test), categoría nueva (`change: null` en la respuesta real), 400 con `period=week`.

## Grupo 3 — Frontend

- **T3.1** — `getCategoryComparison` + tipos `CategoryComparisonEntry`/`CategoryComparisonSummary` en `api/dashboard.ts`.
- **T3.2** — Sección "Categorías por periodo" en `DashboardPage.tsx`, colocada entre "Comparativa temporal" y "Análisis estacional": selectores `.seg` de tipo (Gastos/Ingresos) e intervalo (Mes actual/Año actual), lista con barra de 8px por categoría (reutilizando el patrón visual de "Gastos por categoría"), etiqueta de variación por categoría (`categoryChangeTag`, envoltorio de `changeTag` con "nuevo"/"= 0.00%"), aviso cuando no hay categorías con movimientos en el periodo.
- **T3.3** — Tests en `DashboardPage.test.tsx`: mock de `getCategoryComparison` en los tests existentes que ya renderizan el dashboard autenticado; tests nuevos para la sección (categorías y variación mostradas, cambio de tipo, cambio de intervalo, "nuevo" cuando `change` es `null`, aviso sin categorías, no se llama sin sesión/sin conexión).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) en verde; revisión manual en el navegador de Mes actual/Año actual × Gastos/Ingresos, incluida una categoría nueva y una con variación negativa.
