# Plan — Spec 014 (Análisis estacional)

**Fase:** 2 de 4

## 1. Modelo de datos

Sin cambios de esquema — reutiliza `transactions` (spec 002) tal cual. No hace falta migración.

## 2. Cálculos puros (`backend/src/dashboard/dashboard.calculations.ts`)

Se añaden a este fichero, reutilizando lo que ya existe de spec 013 en vez de duplicarlo: `comparisonMetrics` (nº/total/media por día de un conjunto de movimientos ya filtrado, dado un `days`) y `percentChange` (variación firmada, `null` si la base es 0) encajan tal cual para esta spec.

- `type Season = 'winter' | 'spring' | 'summer' | 'autumn'` — orden canónico fijo en todo el módulo: `['winter', 'spring', 'summer', 'autumn']` (Invierno, Primavera, Verano, Otoño — mismo orden que la imagen de referencia; H2 criterio 1 exige que las 4 aparezcan siempre en el mismo orden).
- `SEASON_MONTHS: Record<Season, [number, number, number]>` — `winter: [12,1,2]`, `spring: [3,4,5]`, `summer: [6,7,8]`, `autumn: [9,10,11]` (decisión 2 de spec.md).
- `seasonRangeForYear(season, year)` → `{ start, end }`: los 3 meses de esa estación **dentro del año natural `year`** (decisión 4 — invierno de `year` es diciembre+enero+febrero, los tres de `year`, no diciembre de `year-1`). `end` usa el último día del tercer mes (`daysInMonth`, ya existe).
- `clippedDaysInRange(start, end, floor, ceiling)` → número de días de `[start, end]` que caen dentro de `[floor, ceiling]` (0 si el rango resultante es vacío, p. ej. una estación totalmente futura respecto a `ceiling`, o totalmente anterior a `floor`). Función genérica nueva, con la misma idea que ya usan `resolveDaysForMonth`/`resolveDaysForYear` (nunca contar días futuros) pero parametrizada para reutilizarla en los dos alcances:
  - **Alcance "Año concreto"** (H2 criterio 4): `floor = start` de la propia estación (sin recorte adicional por abajo), `ceiling = hoy`. Si la estación de ese año todavía no ha empezado, da 0 días (media "sin datos" — ver `average`, que ya devuelve `"0.00"` con `days <= 0`, spec 002).
  - **Alcance "Histórico"** (H2 criterio 3): por cada año natural desde el año del primer movimiento del usuario (`firstTransactionDate`) hasta el año de `now`, `floor = firstTransactionDate`, `ceiling = hoy` — se suman los días "recortados" de cada una de esas instancias anuales de la estación. Una instancia totalmente anterior al primer movimiento, o totalmente futura, aporta 0.
- `seasonalDays(season, scope, now, firstTransactionDate?)` → nº de días a usar como denominador de la media, aplicando lo anterior según `scope: { kind: 'year'; year: number } | { kind: 'historic'; firstTransactionDate: string }`.
- `bucketBySeason(transactions)` → `Record<Season, Array<T>>`: agrupa movimientos ya cargados por estación, mirando solo el mes de `date` (`date.slice(5,7)`) — nunca el año (el propio `scope`/consulta a BD ya se encarga de qué años entran).
- `absoluteDifference(a: string, b: string): string` → `|a − b|`, con `Decimal` (nueva, pequeña; no existía una versión "valor absoluto" de la resta que ya tiene `savingsAmount`, que es específica de ingreso-gasto).
- `seasonalSummary(transactions, type, scope, now, firstTransactionDate?)` → función pura que junta todo lo anterior: bucketea, calcula `comparisonMetrics` por estación con su `days`, y calcula la comparación mejor/peor (H3):
  - `best` = estación con mayor `total`; `worst` = estación con menor `total` (empate → gana la que aparece antes en el orden canónico, determinista).
  - Si `worst.total === "0.00"` o `best.total === worst.total` → **no hay comparación** (`null`) — H3 criterio 4: no se puede repartir "% de diferencia" contra una base 0, ni tiene sentido comparar si están empatadas (p. ej. las 4 a cero). Mismo criterio de "sin datos ante división por cero" que `percentChange`/`savingsPercent`.
  - Si no, `difference = absoluteDifference(best.total, worst.total)`, `percent = percentChange(best.total, worst.total)` (garantizado no-`null` en esta rama, porque `worst.total` ya no es 0).

Todas son funciones puras, sin acceso a BD — mismo criterio que el resto del fichero. Tests unitarios: reparto por estación con movimientos de varios años, recorte de días en las 2 estrategias de `scope` (incluida una estación aún no empezada dentro del año en curso, y el recorte por `firstTransactionDate` a mitad de una estación), empate de totales, base 0 en la peor estación, y las 4 estaciones a "0.00" con `comparison: null`.

## 3. Endpoint

`GET /dashboard/seasonal?type=INCOME|EXPENSE&scope=historic|year&year=YYYY`

- Mismo guard que el resto de `/dashboard`: `@UseGuards(AuthGuard, RequireActiveUserGuard)`.
- DTO (`dto/dashboard-seasonal-query.dto.ts`): `type`/`scope` opcionales (`@IsIn`, por defecto `'EXPENSE'`/`'historic'` en el servicio); `year` solo se valida (`@Matches(/^\d{4}$/)`) cuando `scope === 'year'` (`@ValidateIf`) — si `scope=year` y `year` falta o es inválido, 400.
- `DashboardService.seasonal(userId, type, scope, year, now = new Date())`:
  1. **`scope = 'year'`**: una única consulta a `transactions` con `date` entre `${year}-01-01` y `${year}-12-31` (mismo patrón que `year()` ya existente). `seasonalSummary(items, type, { kind: 'year', year }, now)`.
  2. **`scope = 'historic'`** (por defecto): una única consulta a `transactions` **sin filtro de fecha** (todo el histórico del usuario — sigue filtrando por `userId`, aislamiento innegociable, constitution §2). `firstTransactionDate` se calcula en JS como el mínimo de las fechas del propio resultado (no hace falta una segunda consulta `MIN(date)`: ya se ha traído todo el histórico). Si el usuario no tiene ningún movimiento, `firstTransactionDate` no importa (todas las estaciones quedan a 0 movimientos / `"0.00"` de todas formas). `seasonalSummary(items, type, { kind: 'historic', firstTransactionDate }, now)`.
- Respuesta (`SeasonalSummary`):
  ```ts
  interface SeasonEntry {
    season: 'winter' | 'spring' | 'summer' | 'autumn';
    count: number;
    total: string;
    averagePerDay: string;
  }
  interface SeasonalSummary {
    scope: 'historic' | 'year';
    year: number | null; // null si scope='historic'
    type: 'INCOME' | 'EXPENSE';
    seasons: SeasonEntry[]; // longitud 4, siempre en el orden winter/spring/summer/autumn
    comparison: { bestSeason: Season; worstSeason: Season; difference: string; percent: string } | null;
  }
  ```

Tests e2e (`dashboard.e2e-spec.ts`, o un fichero nuevo `dashboard-seasonal.e2e-spec.ts` si el existente ya es grande): 401 sin auth, aislamiento por usuario, `scope=year` con fechas fijas, `scope=historic` con movimientos de 2 años distintos en la misma estación (deben sumarse), 400 si `scope=year` sin `year`, y el caso "sin comparación posible" (todo en una sola estación).

## 4. Frontend

- `frontend/src/api/dashboard.ts`: tipos `Season`, `SeasonEntry`, `SeasonalSummary` (espejo del backend) + `getSeasonal(type, scope, year?)`.
- `DashboardPage.tsx`, nueva sección **"Análisis estacional"**, colocada después de "Comparativa temporal" (spec 013) y antes de "Resumen del mes" — mismo criterio de "vista general primero" ya aplicado a spec 013.
  - Estado propio, independiente del de "Comparativa temporal" (tipo y alcance de esta sección no comparten `useState` con la otra sección) — un usuario puede querer ver Ingresos en una y Gastos en la otra a la vez; mismo criterio de independencia que ya tienen "Resumen del mes" (mes) y "Vista anual" (año), que tampoco comparten selector entre sí.
  - Selector de tipo: `.seg` Gastos/Ingresos (por defecto Gastos) — mismo patrón que spec 013.
  - Selector de alcance: `.seg` Histórico/Año concreto (por defecto Histórico); al elegir "Año concreto" aparece un `<input type="number">` de año (mismo patrón que el selector de "Vista anual" ya existente), por defecto el año actual.
  - 4 tarjetas `.card` (Invierno/Primavera/Verano/Otoño, en ese orden fijo), cada una con: icono de la estación (❄️ 🌸 ☀️ 🍂, mismo criterio de icono-emoji que categorías/spec 007), importe total (`.card-amount`), "N movimientos" y media/día como `.card-meta`, y una barra de magnitud reutilizando `.bar`/`.bar-fill` (mismo componente que ya usa el desglose de "Gastos por categoría" — un único tono, la estación ya se identifica por icono+etiqueta, decisión 5 de spec.md) con ancho relativo al total más alto de las 4.
  - Etiqueta "Mejor"/"Peor" (`.tag.tag-accent`/`.tag.tag-accent-2`) en las tarjetas de `comparison.bestSeason`/`comparison.worstSeason` cuando `comparison` no es `null` — semántica de color según `type` (H3 criterio 2), mismo helper que ya calcula esto en la sección de Comparativa temporal, generalizado para aceptar "esta estación es la de mayor/menor importe" en vez de "esta cifra subió/bajó".
  - Texto-resumen (`.callout`, ya existe desde spec 013) con la frase de H3 criterio 3, o un aviso (mismo elemento, texto distinto) cuando `comparison` es `null` (H3 criterio 4).
  - Offline (spec 011, H6): igual que el resto del dashboard, solo carga con `isOnline`.

## 5. Fuera de este plan

- No se toca `dashboard.module.ts` (servicio/controlador ya registrados).
- No se toca ninguna spec anterior ni sus tests existentes salvo los mocks necesarios en `DashboardPage.test.tsx` para la nueva llamada a `getSeasonal`.
