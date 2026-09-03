# Tasks — Spec 014 (Análisis estacional)

**Fase:** 3 de 4

## Grupo 1 — Cálculos puros (backend)

- **T1.1** — `Season`, `SEASON_MONTHS`, `seasonRangeForYear`, `clippedDaysInRange`, `seasonalDays`, `bucketBySeason`, `absoluteDifference`, `seasonalSummary` en `dashboard.calculations.ts`. Tests unitarios en `dashboard.calculations.spec.ts`: reparto por estación con movimientos de varios años (histórico), recorte de días en `scope='year'` (estación futura dentro del año → 0 días) y en `scope='historic'` (recorte por `firstTransactionDate` a mitad de estación, y suma a través de varios años), empate de totales → sin comparación, base 0 en la peor estación → sin comparación, y las 4 estaciones a `"0.00"`.

## Grupo 2 — Endpoint

- **T2.1** — `DashboardSeasonalQueryDto`, `DashboardService.seasonal()`, `GET /dashboard/seasonal` en el controlador. Tests e2e: 401, aislamiento por usuario, `scope=year` con fechas fijas, `scope=historic` con movimientos de 2 años en la misma estación (se suman), 400 si `scope=year` sin `year` válido, caso sin comparación posible (una sola estación con movimientos).

## Grupo 3 — Frontend

- **T3.1** — `getSeasonal` + tipos `Season`/`SeasonEntry`/`SeasonalSummary` en `api/dashboard.ts`.
- **T3.2** — Sección "Análisis estacional" en `DashboardPage.tsx` (selectores de tipo/alcance con año condicional, 4 tarjetas con barra de magnitud y etiqueta mejor/peor, texto-resumen o aviso) + estilos nuevos en `index.css` si `.bar`/`.tag`/`.card` no cubren algo (revisar antes de añadir clases nuevas).
- **T3.3** — Tests en `DashboardPage.test.tsx`: mock de `getSeasonal` en los tests existentes que ya renderizan el dashboard autenticado; tests nuevos para la sección (valores por estación, etiqueta mejor/peor y su color según tipo, aviso sin comparación, cambio de tipo/alcance, año condicional al elegir "Año concreto", no se llama sin sesión/sin conexión).

## Grupo 4 — Cierre

- **T4.1** — `npm test` (backend y frontend) en verde; revisión manual en el navegador de los 2 alcances × 2 tipos, incluido un usuario con histórico en varios años.
