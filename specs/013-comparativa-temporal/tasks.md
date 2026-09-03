# Tasks — Spec 013 (Comparativa temporal)

**Fase:** 3 de 4

## Grupo 1 — Cálculos puros (backend)

- **T1.1** — `periodRanges`, `periodLabel` en `dashboard.calculations.ts` (semana ISO, mes, trimestre natural, año), con `percentChange`/`comparisonMetrics`/`comparisonChanges`. Tests unitarios en `dashboard.calculations.spec.ts`: los 4 periodos, recorte de tramo cuando el anterior es más corto, `percentChange` con base 0 → `null`.

## Grupo 2 — Endpoint

- **T2.1** — `DashboardComparisonQueryDto`, `DashboardService.comparison()`, `GET /dashboard/comparison` en el controlador. Tests e2e: 401, aislamiento por usuario, cálculo con fechas fijas (mes cerrado), `previous = 0` → `changes` `null`.

## Grupo 3 — Frontend

- **T3.1** — `getComparison` + tipo `ComparisonSummary` en `api/dashboard.ts`.
- **T3.2** — Sección "Comparativa temporal" en `DashboardPage.tsx` (selectores `.seg` de tipo/periodo, pastillas de periodo, 3 tarjetas con variación, texto-resumen) + estilos nuevos en `index.css` (`.callout`, ajustes de layout de la sección).
- **T3.3** — Tests en `DashboardPage.test.tsx`: mock de `getComparison` en los tests existentes que ya renderizan el dashboard autenticado; tests nuevos para la sección (valores mostrados, cambio de tipo, cambio de periodo, "sin datos" cuando `previous` es 0, no se llama sin sesión / sin conexión).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) en verde; revisión manual en el navegador de los 4 periodos × 2 tipos.
