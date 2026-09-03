# Plan — Spec 013 (Comparativa temporal)

**Fase:** 2 de 4

## 1. Modelo de datos

Sin cambios de esquema — reutiliza `transactions` (spec 002) tal cual. No hace falta migración.

## 2. Cálculos puros (`backend/src/dashboard/dashboard.calculations.ts`)

Se añaden a este fichero (ya alberga la "matemática de periodos" del dashboard — `resolveDaysForMonth`, `daysInYear`, etc., ver su cabecera):

- `type ComparisonPeriod = 'week' | 'month' | 'quarter' | 'year'`
- `periodRanges(period, now)` → `{ currentStart, currentEnd, previousStart, previousEnd, days }` (fechas ISO `YYYY-MM-DD`). Algoritmo (H2):
  1. `currentStart` = inicio del periodo que contiene `now` (lunes de la semana ISO / día 1 del mes / día 1 del trimestre natural / 1 de enero).
  2. `elapsedDays` = días transcurridos desde `currentStart` hasta hoy, inclusive.
  3. `previousStart` = inicio del periodo inmediatamente anterior al que contiene `currentStart`.
  4. `totalPreviousDays` = nº total de días del periodo anterior completo.
  5. `days = min(elapsedDays, totalPreviousDays)` — el tramo que se compara en ambos lados.
  6. `currentEnd = currentStart + (days − 1)`, `previousEnd = previousStart + (days − 1)`.
- `periodLabel(period, startIso)` → etiqueta corta para la pastilla (`"Q3 2026"`, `"Septiembre 2026"`, `"Semana 36 · 2026"` [nº de semana ISO], `"2026"`).
- `comparisonMetrics(transactions, type, days)` → `{ count, total, averagePerDay }` sobre los movimientos ya cargados de un rango, filtrando por `type` (mismo patrón que `sumByType`/`groupByCategory`, reutiliza `sumAmounts`/`average` de `transactions.calculations.ts`).
- `percentChange(current, previous)` → `string | null` (variación firmada en %, `null` si `previous` es `"0"`/`0` — mismo criterio que `savingsPercent`).
- `comparisonChanges(current, previous)` → `{ count, total, averagePerDay }` (cada uno `string | null`), aplicando `percentChange` a los 3 pares de valores.

Todas son funciones puras, sin acceso a BD — mismo criterio que el resto del fichero. Tests unitarios en `dashboard.calculations.spec.ts` cubren: los 4 tipos de periodo, el recorte a "mismo tramo" cuando el periodo anterior es más corto (H2 criterio 2), y `percentChange` devolviendo `null` con base 0.

## 3. Endpoint

`GET /dashboard/comparison?period=week|month|quarter|year&type=INCOME|EXPENSE`

- Mismo guard que `/dashboard/month` y `/dashboard/year`: `@UseGuards(AuthGuard, RequireActiveUserGuard)`.
- DTO (`dto/dashboard-comparison-query.dto.ts`): `period`/`type` opcionales (`@IsIn(...)`), por defecto `'month'`/`'EXPENSE'` en el servicio — mismo patrón que `month`/`year` con su parámetro opcional.
- `DashboardService.comparison(userId, period, type, now)`:
  1. `periodRanges(period, now)`.
  2. Dos consultas a `transactions` (rango actual, rango anterior), filtrando por `userId` + `date` — igual que `month()`/`year()`, sin filtrar `type` en la query SQL (se filtra en la función pura, igual que `groupByCategory(items.filter(...))` ya hace en `month()`), para no duplicar el criterio de filtrado en dos sitios.
  3. `comparisonMetrics` sobre cada rango + `comparisonChanges`.
- Respuesta (`ComparisonSummary`):
  ```ts
  {
    period: ComparisonPeriod;
    type: 'INCOME' | 'EXPENSE';
    days: number;
    currentLabel: string;
    previousLabel: string;
    current: { count: number; total: string; averagePerDay: string };
    previous: { count: number; total: string; averagePerDay: string };
    changes: { count: string | null; total: string | null; averagePerDay: string | null };
  }
  ```

Tests e2e (`dashboard.e2e-spec.ts`): 401 sin auth, aislamiento por usuario, cálculo básico (mes cerrado, para no depender de la fecha del test), `previous = 0` → `changes` a `null`, y un caso de mes en curso con `days` truncado.

## 4. Frontend

- `frontend/src/api/dashboard.ts`: tipo `ComparisonSummary` (espejo del backend) + `getComparison(period?, type?)`.
- `DashboardPage.tsx`, nueva sección antes de "Resumen del mes" (o después de "Vista anual" — se coloca justo debajo del `<h1>`, como primer bloque, por ser la vista más "de un vistazo" del dashboard):
  - Título `<h2>Comparativa temporal</h2>`.
  - Selector de tipo: `.seg` con 2 opciones (Gastos/Ingresos) — mismo patrón que `MovementsListPage`/`MovementsSummaryPage`.
  - Selector de periodo: `.seg` con 4 opciones (Semana/Mes/Trimestre/Año).
  - Pastillas `currentLabel` **vs** `previousLabel` (`.tag.tag-accent` / texto "vs" / `.tag.tag-neutral`).
  - 3 tarjetas `.card` (nº de movimientos, importe total, media por día), cada una con: valor del periodo actual (`.card-amount`), "Anterior: {valor}" (`.card-meta`), y una etiqueta de variación (`.tag`) con flecha ↑/↓ y el %, o "sin datos" si `null`.
  - Color de la etiqueta de variación: **no** es "verde = sube" fijo — usa la misma semántica que `ProgressBar`/`GoalsPage` (spec 007/010, `direction: 'budget' | 'savings'`): en Gastos, subir es malo (`tag-accent-2`) y bajar es bueno (`tag-accent`); en Ingresos, al revés.
  - Texto-resumen (nueva clase `.callout`, no existía ninguna similar en `index.css`) con el mensaje de H3 criterio 3, construido a partir de `changes.total` y `changes.averagePerDay`.
  - Offline (spec 011, H6): esta sección solo carga con `isOnline` (como el resto del dashboard) — no se replica su cálculo en el modo offline, mismo motivo ya documentado en `DashboardPage.tsx` para `month()`/`year()`.

## 5. Fuera de este plan

- No se toca `dashboard.module.ts` (el servicio/controlador ya están registrados).
- No se toca ninguna spec anterior ni sus tests existentes salvo los mocks necesarios en `DashboardPage.test.tsx` para la nueva llamada a `getComparison` (spec 013 añade una tercera llamada en el mismo `useEffect`-por-endpoint que ya usan mes/año).
