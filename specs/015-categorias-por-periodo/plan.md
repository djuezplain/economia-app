# Plan — Spec 015 (Categorías con comparativa de periodo)

**Fase:** 2 de 4

## 1. Modelo de datos

Sin cambios de esquema — reutiliza `transactions` (spec 002) tal cual. No hace falta migración.

## 2. Cálculos puros (`backend/src/dashboard/dashboard.calculations.ts`)

Se añade una única función nueva, reutilizando al máximo lo que ya existe de spec 013 en vez de duplicarlo:

- **`periodRanges(period, now)`** (spec 013, ya existe) se reutiliza tal cual para calcular los rangos "actual"/"anterior" recortados al mismo nº de días — decisión 4 de spec.md. Esta spec solo permite `period: 'month' | 'year'` (un subconjunto de `ComparisonPeriod`; la validación de que no se acepte `'week'`/`'quarter'` vive en el DTO, no aquí, para no partir el tipo existente en dos).
- **`percentChange`** (spec 013, ya existe) se reutiliza tal cual para el `change` de cada categoría — devuelve `null` si la base (importe de la categoría en el periodo anterior) es 0, que es exactamente el criterio de "categoría nueva" de H3 criterio 3 (decisión 6 de spec.md): como una categoría solo entra en la lista si su importe del periodo ACTUAL es > 0 (H2 criterio 1), un `change === null` en esta función solo puede significar "no había nada en el periodo anterior", nunca un 0/0 ambiguo.
- **`groupByCategory`** (`transactions.calculations.ts`, ya existe) se reutiliza tal cual, ya filtrado por `type` antes de llamarla — mismo patrón que ya usa `month()` (`groupByCategory(items.filter(t => t.type === 'EXPENSE'))`).

Nueva función:

```ts
export interface CategoryComparisonEntry {
  categoryId: string;
  total: string;
  previousTotal: string;
  change: string | null; // null = categoría nueva este periodo (previousTotal era 0) — H3 criterio 3
}

export function categoryComparison(
  currentTransactions: Array<{ categoryId: string; type: MovementType; amount: string }>,
  previousTransactions: Array<{ categoryId: string; type: MovementType; amount: string }>,
  type: MovementType,
): CategoryComparisonEntry[]
```

- Agrupa `currentTransactions` (ya filtradas por `type`) con `groupByCategory` — esto por sí solo cubre H2 criterio 1 (solo categorías con movimientos del periodo actual, ninguna a "0 €") porque `groupByCategory` nunca produce una entrada para una categoría sin movimientos en el array que recibe.
- Agrupa `previousTransactions` (mismo filtro) en un `Map<categoryId, total>` para buscar el importe anterior de cada categoría actual; si una categoría no aparece ahí, su `previousTotal` es `"0.00"`.
- `change = percentChange(entry.total, previousTotal)` por cada categoría.
- Ordena de mayor a menor `total` (`Decimal`, mismo criterio de comparación exacta que ya usa `seasonalSummary` en vez de `parseFloat`) — H2 criterio 3.
- Una categoría con movimientos en `previousTransactions` pero ausente de `currentTransactions` nunca aparece en el resultado (Fuera de alcance de spec.md) — es una consecuencia directa de partir de `groupByCategory(currentTransactions...)`, no necesita código adicional.

Función pura, sin acceso a BD. Tests unitarios (`dashboard.calculations.spec.ts`): varias categorías con importes distintos en ambos periodos (orden correcto y `change` con signo), categoría nueva (`previousTotal` 0 → `change: null`), categoría con el mismo importe en ambos periodos (`change: "0.00"`), categoría con movimientos solo en el periodo anterior (no aparece en el resultado), y lista vacía cuando `currentTransactions` no tiene movimientos del `type` pedido.

## 3. Endpoint

`GET /dashboard/category-comparison?period=month|year&type=INCOME|EXPENSE`

- Mismo guard que el resto de `/dashboard`: `@UseGuards(AuthGuard, RequireActiveUserGuard)`.
- DTO nuevo (`dto/dashboard-category-comparison-query.dto.ts`): `period`/`type` opcionales, `@IsIn(['month', 'year'])` / `@IsIn(['INCOME', 'EXPENSE'])` — mismo patrón que `DashboardComparisonQueryDto`, pero `period` restringido a `month`/`year` (decisión 2 de spec.md: sin semana ni trimestre aquí). Por defecto en el servicio: `'month'`/`'EXPENSE'`.
- `DashboardService.categoryComparison(userId, period, type, now)`:
  1. `periodRanges(period, now)` (reutilizada de spec 013).
  2. Dos consultas a `transactions` en paralelo (rango actual, rango anterior), filtrando por `userId` + `date` — mismo patrón exacto que `comparison()` (spec 013), sin filtrar `type` en SQL (se filtra en las funciones puras).
  3. `periodTotal = sumByType(currentItems, type)`, `previousPeriodTotal = sumByType(previousItems, type)` (ya existe, `transactions.calculations.ts`) — para que el frontend calcule el peso relativo de cada categoría sin tener que sumarlas él mismo (mismo dato que ya expone `MonthSummary.expense` para el desglose de "Gastos por categoría" de hoy).
  4. `categoryComparison(currentItems, previousItems, type)`.
- Respuesta (`CategoryComparisonSummary`):
  ```ts
  {
    period: 'month' | 'year';
    type: 'INCOME' | 'EXPENSE';
    days: number;
    currentLabel: string;    // periodLabel(period, ranges.currentStart), ya existe
    previousLabel: string;
    periodTotal: string;
    previousPeriodTotal: string;
    categories: CategoryComparisonEntry[]; // orden ya decidido por categoryComparison()
  }
  ```

Tests e2e — fichero nuevo `dashboard-category-comparison.e2e-spec.ts` (el `dashboard.e2e-spec.ts` existente ya tiene 500 líneas; mismo criterio que ya se planteó en spec 014 §3 para `seasonal`, aquí sí se separa): 401 sin auth, aislamiento por usuario (categoría de otro usuario nunca aparece), `period=month` con fechas fijas (mes cerrado, para no depender de la fecha del test), categoría nueva (`change: null`), 400 con `period` inválido (`week`).

## 4. Frontend

- `frontend/src/api/dashboard.ts`: tipos `CategoryComparisonEntry`, `CategoryComparisonSummary` (espejo del backend) + `getCategoryComparison(period?, type?)`.
- `DashboardPage.tsx`, nueva sección **"Categorías por periodo"**, colocada después de "Comparativa temporal" (spec 013) y antes de "Análisis estacional" (spec 014) — completa justo lo que spec 013 dejó fuera de alcance explícitamente ("Desglose por categoría dentro de la comparativa"), así que va inmediatamente después de ella.
  - Estado propio (`categoryComparisonType`, `categoryComparisonPeriod`, `categoryComparisonData`, `categoryComparisonError`), independiente del de "Comparativa temporal" y "Análisis estacional" — mismo criterio de independencia ya aplicado entre esas dos secciones (plan.md 014 §4).
  - Selector de tipo: `.seg` Gastos/Ingresos (por defecto Gastos) — mismo patrón que spec 013/014.
  - Selector de intervalo: `.seg` con 2 opciones, Mes actual/Año actual (por defecto Mes actual), reutilizando el tipo `ComparisonPeriod` ya existente pero restringido a estas dos (`Extract<ComparisonPeriod, 'month' | 'year'>`).
  - Si `categories.length === 0`: aviso `<p>Sin gastos/ingresos en este periodo.</p>` (texto según `type`) — H2 criterio 2, mismo patrón que ya usa "Gastos por categoría" ("Sin gastos en este mes").
  - Si hay categorías: lista `<ul>` reutilizando el patrón visual ya existente de "Gastos por categoría" (spec 010: `<li>` con nombre + importe + `.bar`/`.bar-fill` de 8px, ancho = `total / periodTotal * 100`, resuelto contra `categories` para el nombre igual que ya hace `byCategoryChartData`) — no se introduce un componente nuevo. A cada `<li>` se le añade la etiqueta de variación (H3 criterio 1): un `.tag` con el mismo criterio de color que `changeTag` (spec 013 §4: en Gastos subir es malo, en Ingresos al revés), mediante un envoltorio pequeño `categoryChangeTag(change, type)` que llama a `changeTag` pero sustituye su texto para `change === null` por **"nuevo"** en vez de "sin datos" (decisión 6 de spec.md: es una categoría sin importe el periodo anterior, no un fallo de datos) y por **"= 0.00%"** en vez de "· 0.00%" cuando `change === "0.00"` para que se lea como "igual" (H3 criterio 4) sin introducir un tercer texto distinto del ya usado en Comparativa temporal.
  - Offline (spec 011, H6): igual que el resto del dashboard, esta sección solo carga con `isOnline`.

## 5. Fuera de este plan

- No se toca `dashboard.module.ts` (servicio/controlador ya registrados).
- No se toca ninguna spec anterior ni sus tests existentes salvo los mocks necesarios en `DashboardPage.test.tsx` para la nueva llamada a `getCategoryComparison`.
- No se modifica `changeTag` en sí (spec 013): se envuelve con una función nueva y pequeña (`categoryChangeTag`) en vez de añadirle parámetros opcionales que no necesita "Comparativa temporal".
