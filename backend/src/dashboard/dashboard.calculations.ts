import { Decimal } from 'decimal.js';
import { average, groupByCategory, sumAmounts, sumByType } from '../transactions/transactions.calculations.js';
import type { MovementType } from '../transactions/transactions.calculations.js';

export interface MonthlyEvolutionEntry {
  month: string; // 'YYYY-MM'
  income: string;
  expense: string;
  savings: string;
}

/**
 * H4/H5 (spec 002), plan.md §4. Funciones puras de cálculo del dashboard —
 * complementan a `transactions/transactions.calculations.ts` (`sumByType`,
 * `average`, `groupByCategory`, creadas en el grupo 2 y reutilizadas aquí
 * sin duplicar) en vez de vivir todas juntas en un único fichero, ya que
 * ese fichero nació antes de que existiera este módulo — ver su cabecera.
 */

/** Ahorro en importe (ingresos − gastos) de un periodo. Puede ser negativo. */
export function savingsAmount(income: string, expense: string): string {
  return new Decimal(income).minus(expense).toFixed(2);
}

/**
 * % de ahorro = (ingresos − gastos) / ingresos, expresado en puntos
 * porcentuales (25.00 = 25%). `null` si `income` es 0 (spec.md §4: "sin
 * datos", ni división por cero ni un 0% engañoso).
 */
export function savingsPercent(income: string, expense: string): string | null {
  const incomeDecimal = new Decimal(income);
  if (incomeDecimal.isZero()) return null;
  return incomeDecimal.minus(expense).dividedBy(incomeDecimal).times(100).toFixed(2);
}

/**
 * `'YYYY-MM'` del mes de `now`. Vivía como función privada dentro de
 * `dashboard.service.ts` (spec 002); se exporta aquí, junto al resto de
 * "matemática de periodos", porque spec 004 (`GoalsProgressService`)
 * también necesita saber si un mes consultado es "el actual" para decidir
 * si calcula una proyección de cierre de periodo (plan.md §4) — sin
 * duplicar este cálculo en el módulo nuevo.
 */
export function currentMonthIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Días totales de un mes (`'YYYY-MM'`), independientemente de `now`. */
export function daysInMonth(month: string): number {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(year, monthNum, 0).getDate();
}

/**
 * Días a usar en las medias diarias de un mes (plan.md §4): si `month`
 * coincide con el mes de `now`, los días transcurridos (1..hoy) — dividir
 * por el mes completo infravaloraría la media mientras el mes no ha
 * terminado. Si no coincide (mes cerrado, o uno futuro), los días totales
 * de ese mes. `now` se recibe como parámetro (no `new Date()` interno) para
 * que la función siga siendo pura y comprobable sin simular el reloj del
 * sistema.
 */
export function resolveDaysForMonth(month: string, now: Date): number {
  if (month === currentMonthIso(now)) return now.getDate();
  return daysInMonth(month);
}

/**
 * Días totales de un año (spec 004, plan.md §4: la proyección de un
 * objetivo de ahorro anual necesita esto igual que la de uno mensual
 * necesita `daysInMonth`). Bisiesto correcto (regla gregoriana completa,
 * no solo "múltiplo de 4" — 2100 no sería bisiesto, aunque no afecta a
 * ningún año realista de esta app).
 */
export function daysInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

/**
 * Mismo criterio que `resolveDaysForMonth`, pero para el año: si `year` es
 * el año de `now`, el día del año transcurrido (1-indexado, 1 de enero =
 * 1); si no, los días totales de ese año.
 */
export function resolveDaysForYear(year: number, now: Date): number {
  if (year !== now.getFullYear()) return daysInYear(year);
  const startOfYear = Date.UTC(year, 0, 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - startOfYear) / 86_400_000) + 1;
}

/**
 * Evolución mensual (H5 criterio 1): una entrada por cada uno de los 12
 * meses del año indicado, con "0.00" en los meses sin movimientos — nunca
 * se omite un mes de la lista.
 */
export function monthlyEvolution(
  transactions: Array<{ type: MovementType; date: string; amount: string }>,
  year: number,
): MonthlyEvolutionEntry[] {
  const entries: MonthlyEvolutionEntry[] = [];
  for (let month = 1; month <= 12; month++) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthTransactions = transactions.filter((t) => t.date.slice(0, 7) === monthKey);
    const income = sumByType(monthTransactions, 'INCOME');
    const expense = sumByType(monthTransactions, 'EXPENSE');
    entries.push({ month: monthKey, income, expense, savings: savingsAmount(income, expense) });
  }
  return entries;
}

/**
 * Spec 013 (comparativa temporal). Granularidades soportadas — "trimestre"
 * es el calendario natural (Q1 ene-mar...), no un trimestre móvil.
 */
export type ComparisonPeriod = 'week' | 'month' | 'quarter' | 'year';

export interface ComparisonRanges {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  /** Nº de días que cubre cada rango (igual en ambos, por construcción — H2). */
  days: number;
}

function isoFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

/** Suma (o resta, con `days` negativo) días naturales a una fecha ISO. Puro, sin zona horaria (spec 013, mismo criterio que `formatDate`/`lastDayOfMonth` en el frontend). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoFromUtcMs(utcMs(y, m, d) + days * 86_400_000);
}

/** Nº de días naturales entre dos fechas ISO (`a − b`). */
function diffDaysIso(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((utcMs(ay, am, ad) - utcMs(by, bm, bd)) / 86_400_000);
}

/** Lunes de la semana ISO 8601 (lunes-domingo, spec 013 decisión 1) que contiene `iso`. */
function isoWeekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(utcMs(y, m, d)).getUTCDay(); // 0 = domingo .. 6 = sábado
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return addDaysIso(iso, -daysSinceMonday);
}

/** Nº de semana ISO 8601 de una fecha (para `periodLabel`). */
function isoWeekNumberOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(utcMs(y, m, d));
  const isoDayOfWeek = date.getUTCDay() || 7; // lunes = 1 .. domingo = 7
  date.setUTCDate(date.getUTCDate() + 4 - isoDayOfWeek);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function quarterOf(month: number): number {
  return Math.ceil(month / 3);
}

function quarterStartIso(year: number, quarter: number): string {
  return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
}

/** Suma (o resta) meses naturales a un `{año, mes}`, cruzando años correctamente. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  return { year: year + Math.floor(zeroBased / 12), month: ((zeroBased % 12) + 12) % 12 + 1 };
}

/** Suma (o resta) trimestres naturales a un `{año, trimestre}`, cruzando años correctamente. */
function shiftQuarter(year: number, quarter: number, delta: number): { year: number; quarter: number } {
  const zeroBased = quarter - 1 + delta;
  return { year: year + Math.floor(zeroBased / 4), quarter: ((zeroBased % 4) + 4) % 4 + 1 };
}

/** Inicio y nº total de días del periodo (de `period`) que contiene `iso`. */
function periodBoundsContaining(period: ComparisonPeriod, iso: string): { start: string; totalDays: number } {
  const [year, month] = iso.split('-').map(Number);
  switch (period) {
    case 'week':
      return { start: isoWeekStartOf(iso), totalDays: 7 };
    case 'month': {
      const start = `${iso.slice(0, 7)}-01`;
      return { start, totalDays: daysInMonth(iso.slice(0, 7)) };
    }
    case 'quarter': {
      const quarter = quarterOf(month);
      const start = quarterStartIso(year, quarter);
      const next = shiftQuarter(year, quarter, 1);
      return { start, totalDays: diffDaysIso(quarterStartIso(next.year, next.quarter), start) };
    }
    case 'year':
      return { start: `${year}-01-01`, totalDays: daysInYear(year) };
  }
}

/** Inicio y nº total de días del periodo (de `period`) inmediatamente anterior al que contiene `iso`. */
function previousPeriodBounds(period: ComparisonPeriod, iso: string): { start: string; totalDays: number } {
  const [year, month] = iso.split('-').map(Number);
  switch (period) {
    case 'week': {
      const start = addDaysIso(isoWeekStartOf(iso), -7);
      return { start, totalDays: 7 };
    }
    case 'month': {
      const prev = shiftMonth(year, month, -1);
      const start = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`;
      return { start, totalDays: daysInMonth(start.slice(0, 7)) };
    }
    case 'quarter': {
      const prev = shiftQuarter(year, quarterOf(month), -1);
      const start = quarterStartIso(prev.year, prev.quarter);
      const thisQuarterStart = quarterStartIso(year, quarterOf(month));
      return { start, totalDays: diffDaysIso(thisQuarterStart, start) };
    }
    case 'year':
      return { start: `${year - 1}-01-01`, totalDays: daysInYear(year - 1) };
  }
}

/**
 * H1/H2 (spec 013): rango del periodo actual (el que contiene `now`) y del
 * inmediatamente anterior, recortados al mismo nº de días — los transcurridos
 * del periodo actual, o los disponibles del anterior si este es más corto
 * (p. ej. comparar un mes de 30/31 días en curso contra febrero).
 */
export function periodRanges(period: ComparisonPeriod, now: Date): ComparisonRanges {
  const today = isoFromUtcMs(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const current = periodBoundsContaining(period, today);
  const previous = previousPeriodBounds(period, today);
  const elapsedDays = diffDaysIso(today, current.start) + 1;
  const days = Math.min(elapsedDays, current.totalDays, previous.totalDays);

  return {
    currentStart: current.start,
    currentEnd: addDaysIso(current.start, days - 1),
    previousStart: previous.start,
    previousEnd: addDaysIso(previous.start, days - 1),
    days,
  };
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Etiqueta corta de un periodo para la pastilla de la comparativa (spec 013 §4). */
export function periodLabel(period: ComparisonPeriod, startIso: string): string {
  const [year, month] = startIso.split('-').map(Number);
  switch (period) {
    case 'week':
      return `Semana ${isoWeekNumberOf(startIso)} · ${year}`;
    case 'month': {
      const name = MONTH_NAMES[month - 1];
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
    }
    case 'quarter':
      return `Q${quarterOf(month)} ${year}`;
    case 'year':
      return `${year}`;
  }
}

export interface ComparisonMetrics {
  count: number;
  total: string;
  averagePerDay: string;
}

/** Métricas (H3) de un rango ya cargado: nº de movimientos, importe total y media por día. */
export function comparisonMetrics(
  transactions: Array<{ type: MovementType; amount: string }>,
  type: MovementType,
  days: number,
): ComparisonMetrics {
  const filtered = transactions.filter((t) => t.type === type);
  const total = sumAmounts(filtered);
  return { count: filtered.length, total, averagePerDay: average(total, days) };
}

/**
 * % de variación firmado (`current` respecto a `previous`). `null` si
 * `previous` es 0 — mismo criterio que `savingsPercent` (sin datos, ni
 * división por cero ni un % engañoso).
 */
export function percentChange(current: string | number, previous: string | number): string | null {
  const previousDecimal = new Decimal(previous);
  if (previousDecimal.isZero()) return null;
  return new Decimal(current).minus(previousDecimal).dividedBy(previousDecimal).times(100).toFixed(2);
}

export interface ComparisonChanges {
  count: string | null;
  total: string | null;
  averagePerDay: string | null;
}

/** % de variación de cada una de las 3 métricas del periodo actual respecto al anterior (H3 criterio 2). */
export function comparisonChanges(current: ComparisonMetrics, previous: ComparisonMetrics): ComparisonChanges {
  return {
    count: percentChange(current.count, previous.count),
    total: percentChange(current.total, previous.total),
    averagePerDay: percentChange(current.averagePerDay, previous.averagePerDay),
  };
}

/**
 * Spec 014 (análisis estacional). Orden canónico fijo — H2 criterio 1: las 4
 * estaciones aparecen siempre en este orden (igual que la imagen de
 * referencia), tanto en la respuesta del backend como en la UI.
 */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** Meses naturales (1-12) de cada estación — invierno = dic+ene+feb (spec.md decisión 2). */
const SEASON_MONTHS: Record<Season, readonly [number, number, number]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

const MONTH_TO_SEASON: Record<number, Season> = {
  12: 'winter',
  1: 'winter',
  2: 'winter',
  3: 'spring',
  4: 'spring',
  5: 'spring',
  6: 'summer',
  7: 'summer',
  8: 'summer',
  9: 'autumn',
  10: 'autumn',
  11: 'autumn',
};

function monthRangeFor(year: number, firstMonth: number, lastMonth: number): { start: string; end: string } {
  const lastMonthKey = `${year}-${String(lastMonth).padStart(2, '0')}`;
  return {
    start: `${year}-${String(firstMonth).padStart(2, '0')}-01`,
    end: `${lastMonthKey}-${String(daysInMonth(lastMonthKey)).padStart(2, '0')}`,
  };
}

/**
 * Tramos de fechas de una estación **dentro de un año natural concreto**
 * (decisión 4 de spec.md): sus 3 meses se fijan siempre a `year`, sin cruzar
 * a otro año. Para primavera/verano/otoño eso da un único tramo continuo de
 * 3 meses seguidos. Invierno es la excepción: como sus meses son dic+ene+feb
 * del MISMO `year`, enero y febrero quedan al principio del año y diciembre
 * al final — cronológicamente son dos tramos separados, no uno continuo
 * (enero de `year` es anterior a diciembre de ese mismo `year`).
 */
function seasonSubRangesForYear(season: Season, year: number): Array<{ start: string; end: string }> {
  if (season === 'winter') return [monthRangeFor(year, 1, 2), monthRangeFor(year, 12, 12)];
  const [firstMonth, , lastMonth] = SEASON_MONTHS[season];
  return [monthRangeFor(year, firstMonth, lastMonth)];
}

/**
 * Nº de días de `[start, end]` que caen dentro de `[floor, ceiling]` (0 si el
 * resultado es un rango vacío — p. ej. un periodo totalmente futuro respecto
 * a `ceiling`, o totalmente anterior a `floor`). Generaliza el mismo
 * criterio de "nunca contar días futuros" que ya usan `resolveDaysForMonth`/
 * `resolveDaysForYear`, parametrizado para poder aplicar además un recorte
 * por abajo (spec 014, alcance "Histórico").
 */
export function clippedDaysInRange(start: string, end: string, floor: string, ceiling: string): number {
  const clippedStart = start > floor ? start : floor;
  const clippedEnd = end < ceiling ? end : ceiling;
  if (clippedStart > clippedEnd) return 0;
  return diffDaysIso(clippedEnd, clippedStart) + 1;
}

/**
 * `{ kind: 'year' }`: un año natural concreto (H2 criterio 4). `{ kind:
 * 'historic' }`: todo el histórico del usuario, sin contar días anteriores a
 * `firstTransactionDate` (H2 criterio 3).
 */
export type SeasonalScope = { kind: 'year'; year: number } | { kind: 'historic'; firstTransactionDate: string };

/** Días de un año natural de una estación (sumando sus tramos) que caen dentro de `[floor, ceiling]`. */
function daysForYearInstance(season: Season, year: number, floor: string, ceiling: string): number {
  return seasonSubRangesForYear(season, year).reduce((sum, range) => sum + clippedDaysInRange(range.start, range.end, floor, ceiling), 0);
}

/** Días a usar como denominador de la media diaria de una estación, según el alcance elegido (H2 criterios 2-4). */
export function seasonalDays(season: Season, scope: SeasonalScope, now: Date): number {
  const today = isoFromUtcMs(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  if (scope.kind === 'year') {
    // `floor` = 1 de enero del propio año: nunca es posterior al inicio de ningún tramo de esa estación en ese año, así que no recorta nada — solo evita contar días futuros (`ceiling`).
    return daysForYearInstance(season, scope.year, `${scope.year}-01-01`, today);
  }

  const firstYear = Number(scope.firstTransactionDate.slice(0, 4));
  const currentYear = Number(today.slice(0, 4));
  let total = 0;
  for (let year = firstYear; year <= currentYear; year++) {
    total += daysForYearInstance(season, year, scope.firstTransactionDate, today);
  }
  return total;
}

/** Agrupa movimientos ya cargados por estación, mirando solo el mes de `date` — nunca el año (eso ya lo decide la consulta a BD / el `scope`). */
export function bucketBySeason<T extends { date: string }>(transactions: T[]): Record<Season, T[]> {
  const buckets: Record<Season, T[]> = { winter: [], spring: [], summer: [], autumn: [] };
  for (const t of transactions) {
    buckets[MONTH_TO_SEASON[Number(t.date.slice(5, 7))]].push(t);
  }
  return buckets;
}

/** Diferencia en valor absoluto entre dos importes. */
export function absoluteDifference(a: string, b: string): string {
  return new Decimal(a).minus(b).abs().toFixed(2);
}

export interface SeasonEntry extends ComparisonMetrics {
  season: Season;
}

export interface SeasonalComparison {
  bestSeason: Season;
  worstSeason: Season;
  difference: string;
  percent: string;
}

/**
 * H2/H3 (spec 014): cifras de las 4 estaciones (siempre las 4, en orden
 * canónico) y la comparación entre la de mayor y la de menor importe total.
 * `comparison` es `null` cuando no se puede calcular una diferencia con
 * sentido (H3 criterio 4): la estación con menos importe es 0 (dividir entre
 * 0 daría un % engañoso, mismo criterio que `percentChange`), o las 4 están
 * empatadas.
 */
export function seasonalSummary(
  transactions: Array<{ type: MovementType; date: string; amount: string }>,
  type: MovementType,
  scope: SeasonalScope,
  now: Date,
): { seasons: SeasonEntry[]; comparison: SeasonalComparison | null } {
  const buckets = bucketBySeason(transactions);
  const seasons: SeasonEntry[] = SEASONS.map((season) => ({
    season,
    ...comparisonMetrics(buckets[season], type, seasonalDays(season, scope, now)),
  }));

  let best = seasons[0];
  let worst = seasons[0];
  for (const entry of seasons) {
    if (new Decimal(entry.total).greaterThan(best.total)) best = entry;
    if (new Decimal(entry.total).lessThan(worst.total)) worst = entry;
  }

  if (worst.total === '0.00' || best.total === worst.total) {
    return { seasons, comparison: null };
  }

  return {
    seasons,
    comparison: {
      bestSeason: best.season,
      worstSeason: worst.season,
      difference: absoluteDifference(best.total, worst.total),
      // `worst.total` no es "0.00" en esta rama, así que percentChange nunca devuelve null aquí.
      percent: percentChange(best.total, worst.total)!,
    },
  };
}

export interface CategoryComparisonEntry {
  categoryId: string;
  total: string;
  previousTotal: string;
  /** `null` = categoría nueva este periodo (`previousTotal` era 0) — spec 015 H3 criterio 3. */
  change: string | null;
}

/**
 * Spec 015 (categorías con comparativa de periodo). Desglose por categoría
 * del periodo actual (ya filtrado a `type`, vía `groupByCategory` — H2
 * criterio 1: una categoría sin movimientos en `currentTransactions` nunca
 * genera una entrada, no aparece "a 0 €"), con el importe de esa misma
 * categoría en el periodo anterior y su variación (`percentChange`, spec
 * 013 — `null` si `previousTotal` es 0, que aquí solo puede significar
 * "categoría nueva" porque `total` ya es > 0 por construcción).
 *
 * Una categoría con movimientos solo en `previousTransactions` (no en
 * `currentTransactions`) nunca aparece en el resultado — consecuencia
 * directa de partir de `groupByCategory(currentTransactions...)`, sin
 * lógica adicional (spec.md, fuera de alcance).
 */
export function categoryComparison(
  currentTransactions: Array<{ categoryId: string; type: MovementType; amount: string }>,
  previousTransactions: Array<{ categoryId: string; type: MovementType; amount: string }>,
  type: MovementType,
): CategoryComparisonEntry[] {
  const current = groupByCategory(currentTransactions.filter((t) => t.type === type));
  const previousByCategory = new Map(
    groupByCategory(previousTransactions.filter((t) => t.type === type)).map((entry) => [entry.categoryId, entry.total]),
  );

  return current
    .map((entry) => {
      const previousTotal = previousByCategory.get(entry.categoryId) ?? '0.00';
      return { categoryId: entry.categoryId, total: entry.total, previousTotal, change: percentChange(entry.total, previousTotal) };
    })
    .sort((a, b) => new Decimal(b.total).minus(a.total).toNumber());
}
