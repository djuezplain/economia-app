import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import { getCategoryComparison, getComparison, getMonthSummary, getSeasonal, getYearSummary } from '../api/dashboard';
import type {
  CategoryComparisonPeriod,
  CategoryComparisonSummary,
  ComparisonPeriod,
  ComparisonSummary,
  MonthSummary,
  Season,
  SeasonalComparison,
  SeasonalScope,
  SeasonalSummary,
  YearSummary,
} from '../api/dashboard';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';

// El desglose de gastos por categoría (H4 criterio 2) no usa un color por
// categoría (podrían ser más de 8 y romper el presupuesto categórico) — es
// una comparación de magnitud con la categoría ya identificada por su
// etiqueta en el eje, así que lleva un único tono (secuencial) en vez de
// gastar el canal de identidad sin falta.
//
// Spec 010 (rediseño editorial), plan.md §4.4: estos 3 colores eran antes
// una paleta categórica fija (azul/naranja/aqua) validada por la skill de
// dataviz; se sustituyen a propósito por los tokens del nuevo sistema
// visual (decisión aprobada por Diego) — siguen siendo 3 tonos claramente
// distinguibles (azul claro/gris/magenta), solo cambia de dónde salen.
const COLOR_INCOME = 'var(--accent-300)';
const COLOR_EXPENSE = 'var(--neutral-600)';
const COLOR_SAVINGS = 'var(--accent-2)';
const COLOR_CATEGORY_BAR = 'var(--accent)';

// Spec 010 (rediseño editorial), plan.md §4.4: tipografía de ejes/leyenda a
// Source Serif 4 (antes la fuente por defecto de Recharts) vía las propias
// opciones del gráfico, sin CSS global (los `<text>` de un SVG no heredan
// de `body`).
const CHART_TICK_STYLE = { fontFamily: 'var(--font-body)', fontSize: 12, fill: 'var(--text)' };
const CHART_TOOLTIP_STYLE = { fontFamily: 'var(--font-body)', fontSize: 13 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return todayIso().slice(0, 7);
}

function currentYear(): string {
  return todayIso().slice(0, 4);
}

function formatPercent(value: string | null): string {
  return value === null ? 'sin datos' : `${value}%`;
}

// Spec 013 (comparativa temporal), plan.md §4.
const COMPARISON_PERIOD_OPTIONS: Array<{ value: ComparisonPeriod; label: string }> = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Año' },
];

/**
 * Etiqueta de variación de una métrica (H3 criterio 2/3): el sentido "bueno"
 * de subir o bajar depende del tipo — en gastos, subir es malo; en ingresos,
 * al revés. Mismo criterio de semántica de color que `ProgressBar`/
 * `GoalsPage` (`direction: 'budget' | 'savings'`, spec 007/010), aplicado
 * aquí a un signo en vez de a un %.
 */
function changeTag(change: string | null, type: 'INCOME' | 'EXPENSE'): { className: string; text: string } {
  if (change === null) return { className: 'tag tag-neutral', text: 'sin datos' };
  const value = parseFloat(change);
  if (value === 0) return { className: 'tag tag-neutral', text: '· 0.00%' };
  const isGood = type === 'INCOME' ? value > 0 : value < 0;
  const arrow = value > 0 ? '↑' : '↓';
  return { className: isGood ? 'tag tag-accent' : 'tag tag-accent-2', text: `${arrow} ${Math.abs(value).toFixed(2)}%` };
}

// Spec 015 (categorías con comparativa de periodo), plan.md §4.
const CATEGORY_COMPARISON_PERIOD_OPTIONS: Array<{ value: CategoryComparisonPeriod; label: string }> = [
  { value: 'month', label: 'Mes actual' },
  { value: 'year', label: 'Año actual' },
];

/**
 * Etiqueta de variación de una categoría (H3): envuelve `changeTag`
 * (Comparativa temporal, spec 013) con dos textos propios en vez de los
 * suyos — "nuevo" en lugar de "sin datos" cuando `change` es `null`
 * (decisión 6 de spec.md: es una categoría sin importe el periodo
 * anterior, no un fallo de datos) y "= 0.00%" en lugar de "· 0.00%" para
 * que se lea como "igual" (H3 criterio 4).
 */
function categoryChangeTag(change: string | null, type: 'INCOME' | 'EXPENSE'): { className: string; text: string } {
  if (change === null) return { className: 'tag tag-neutral', text: 'nuevo' };
  if (parseFloat(change) === 0) return { className: 'tag tag-neutral', text: '= 0.00%' };
  return changeTag(change, type);
}

/** Texto-resumen de H3 criterio 3. */
function comparisonSummaryText(summary: ComparisonSummary): string {
  const verb = summary.type === 'EXPENSE' ? 'gastado' : 'ingresado';
  if (summary.changes.total === null) {
    return `No hay movimientos en ${summary.previousLabel} con los que comparar.`;
  }
  const totalChange = parseFloat(summary.changes.total);
  const moreOrLess = totalChange >= 0 ? 'más' : 'menos';
  const avgChange = summary.changes.averagePerDay;
  const avgClause = avgChange === null ? '' : ` y tu media diaria ha ${parseFloat(avgChange) >= 0 ? 'subido' : 'bajado'}`;
  return `Has ${verb} un ${Math.abs(totalChange).toFixed(2)}% ${moreOrLess} que en el periodo anterior${avgClause}.`;
}

// Spec 014 (análisis estacional), plan.md §4. Orden e icono siguen el mismo
// orden canónico que ya fija el backend (`SEASONS`, dashboard.calculations.ts).
const SEASON_LABELS: Record<Season, string> = { winter: 'Invierno', spring: 'Primavera', summer: 'Verano', autumn: 'Otoño' };
const SEASON_ICONS: Record<Season, string> = { winter: '❄️', spring: '🌸', summer: '☀️', autumn: '🍂' };

/**
 * Etiqueta "Mejor"/"Peor" de una tarjeta de estación (H3 criterio 1/2): solo
 * la estación con más importe (`bestSeason`, el mayor `total`) y la de menos
 * (`worstSeason`) la llevan. Qué etiqueta es "buena" depende del tipo — en
 * Gastos, la de MENOS importe es la buena; en Ingresos, la de MÁS —, mismo
 * criterio de semántica ya usado en `changeTag` para Comparativa temporal.
 */
function seasonBadge(
  season: Season,
  comparison: SeasonalComparison | null,
  type: 'INCOME' | 'EXPENSE',
): { className: string; text: string } | null {
  if (!comparison) return null;
  const isMax = comparison.bestSeason === season;
  const isMin = comparison.worstSeason === season;
  if (!isMax && !isMin) return null;
  const isGoodSeason = type === 'EXPENSE' ? isMin : isMax;
  return { className: isGoodSeason ? 'tag tag-accent' : 'tag tag-accent-2', text: isGoodSeason ? 'Mejor' : 'Peor' };
}

/** Texto-resumen de H3 criterio 3, o el aviso de H3 criterio 4 cuando no hay comparación posible. */
function seasonalSummaryText(summary: SeasonalSummary): string {
  if (!summary.comparison) {
    return 'Todavía no hay suficientes estaciones con movimientos para compararlas.';
  }
  const verb = summary.type === 'EXPENSE' ? 'gastas' : 'ingresas';
  const { bestSeason, worstSeason, difference, percent } = summary.comparison;
  return `En ${SEASON_LABELS[bestSeason]} ${verb} ${formatCurrency(difference)} más que en ${SEASON_LABELS[worstSeason]} (${percent}% más).`;
}

/**
 * H4/H5 (spec 002). Dos secciones (mes en curso/seleccionado, año
 * seleccionado), cada una con sus cifras en texto plano (accesibles sin
 * gráfico, `references/choosing-a-form.md` de la skill de dataviz: "a table
 * view exists") y un gráfico Recharts encima. Desglose de gastos por
 * categoría: barras horizontales de un único color (comparación de
 * magnitud, no identidad — ver comentario de colores más abajo), en vez del
 * "gráfico circular" que sugiere `spec.md` H4 criterio 2 entre paréntesis
 * — no es un requisito literal ("p. ej."), y con hasta 12+ categorías un
 * circular deja de leerse bien. Evolución mensual (H5 criterio 1): línea
 * con 3 series (ingresos/gastos/ahorro), un único eje (nunca doble eje).
 *
 * Spec 007 (mejoras visuales), H2 criterio 4 / plan.md §0 y §3: estos
 * gráficos ya existían antes de spec 007 (la spec asumía erróneamente que
 * Recharts no se usaba todavía). Único añadido de esa spec aquí: un aviso
 * explícito cuando el año consultado no tiene ingresos ni gastos.
 */
export function DashboardPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [categories, setCategories] = useState<Category[] | null>(null);

  const [month, setMonth] = useState(currentMonth());
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);

  const [year, setYear] = useState(currentYear());
  const [yearSummary, setYearSummary] = useState<YearSummary | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);

  // Spec 013 (comparativa temporal).
  const [comparisonType, setComparisonType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>('month');
  const [comparisonSummary, setComparisonSummary] = useState<ComparisonSummary | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // Spec 015 (categorías con comparativa de periodo). Selector propio,
  // independiente del de "Comparativa temporal" y "Análisis estacional" —
  // mismo criterio de independencia entre secciones (plan.md 014 §4).
  const [categoryComparisonType, setCategoryComparisonType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [categoryComparisonPeriod, setCategoryComparisonPeriod] = useState<CategoryComparisonPeriod>('month');
  const [categoryComparisonData, setCategoryComparisonData] = useState<CategoryComparisonSummary | null>(null);
  const [categoryComparisonError, setCategoryComparisonError] = useState<string | null>(null);

  // Spec 014 (análisis estacional). Selector propio, independiente del de
  // "Comparativa temporal" (plan.md §4) — mismo criterio de independencia
  // que ya tienen "Resumen del mes" y "Vista anual" entre sí.
  const [seasonalType, setSeasonalType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [seasonalScope, setSeasonalScope] = useState<SeasonalScope>('historic');
  const [seasonalYear, setSeasonalYear] = useState(currentYear());
  const [seasonalData, setSeasonalData] = useState<SeasonalSummary | null>(null);
  const [seasonalError, setSeasonalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories();
        if (!cancelled) setCategories(list);
      } catch {
        // El nombre de categoría es solo un adorno del desglose (se cae a
        // mostrar el id si no carga) — no bloquea el resto del dashboard.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await getMonthSummary(month);
        if (!cancelled) setMonthSummary(summary);
      } catch (err) {
        if (!cancelled) setMonthError(err instanceof ApiError ? err.message : 'No se ha podido cargar el resumen del mes.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, month]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await getYearSummary(year);
        if (!cancelled) setYearSummary(summary);
      } catch (err) {
        if (!cancelled) setYearError(err instanceof ApiError ? err.message : 'No se ha podido cargar el resumen del año.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, year]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await getComparison(comparisonPeriod, comparisonType);
        if (!cancelled) {
          setComparisonSummary(summary);
          setComparisonError(null);
        }
      } catch (err) {
        if (!cancelled) setComparisonError(err instanceof ApiError ? err.message : 'No se ha podido cargar la comparativa.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, comparisonPeriod, comparisonType]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await getCategoryComparison(categoryComparisonPeriod, categoryComparisonType);
        if (!cancelled) {
          setCategoryComparisonData(summary);
          setCategoryComparisonError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCategoryComparisonError(err instanceof ApiError ? err.message : 'No se han podido cargar las categorías.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, categoryComparisonPeriod, categoryComparisonType]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await getSeasonal(seasonalType, seasonalScope, seasonalScope === 'year' ? seasonalYear : undefined);
        if (!cancelled) {
          setSeasonalData(summary);
          setSeasonalError(null);
        }
      } catch (err) {
        if (!cancelled) setSeasonalError(err instanceof ApiError ? err.message : 'No se ha podido cargar el análisis estacional.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, seasonalType, seasonalScope, seasonalYear]);

  const maxSeasonalTotal = useMemo(() => {
    if (!seasonalData) return 0;
    return Math.max(...seasonalData.seasons.map((entry) => parseFloat(entry.total)));
  }, [seasonalData]);

  const byCategoryChartData = useMemo(() => {
    if (!monthSummary) return [];
    return [...monthSummary.byCategory]
      .sort((a, b) => parseFloat(b.total) - parseFloat(a.total))
      .map((entry) => ({
        name: categories?.find((c) => c.id === entry.categoryId)?.name ?? entry.categoryId,
        total: parseFloat(entry.total),
      }));
  }, [monthSummary, categories]);

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  // Spec 011 (modo offline), H6 criterio 1: el dashboard combina varios
  // cálculos (ahorro, medias diarias, evolución anual) que hoy solo existen
  // en el backend (`dashboard.service.ts`) — a diferencia de "Movimientos"/
  // "Resumen"/"Categorías" (H3), replicarlos aquí duplicaría más lógica
  // financiera de la que esta spec justifica tocar. Se avisa con claridad en
  // vez de mostrar un dashboard a medias o con datos desactualizados sin
  // decirlo.
  if (!isOnline) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  const countChangeTag = comparisonSummary ? changeTag(comparisonSummary.changes.count, comparisonSummary.type) : null;
  const totalChangeTag = comparisonSummary ? changeTag(comparisonSummary.changes.total, comparisonSummary.type) : null;
  const averageChangeTag = comparisonSummary ? changeTag(comparisonSummary.changes.averagePerDay, comparisonSummary.type) : null;

  return (
    <main>
      <h1>Dashboard</h1>

      <details className="dashboard-section">
        <summary>
          <h2>Comparativa temporal</h2>
        </summary>

        <div className="comparison-toolbar">
          <div className="seg" role="radiogroup" aria-label="Tipo de movimiento a comparar">
            <label className="seg-opt">
              <input
                type="radio"
                name="comparison-type"
                value="EXPENSE"
                checked={comparisonType === 'EXPENSE'}
                onChange={() => setComparisonType('EXPENSE')}
              />
              Gastos
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="comparison-type"
                value="INCOME"
                checked={comparisonType === 'INCOME'}
                onChange={() => setComparisonType('INCOME')}
              />
              Ingresos
            </label>
          </div>

          <div className="seg" role="radiogroup" aria-label="Periodo a comparar">
            {COMPARISON_PERIOD_OPTIONS.map((option) => (
              <label className="seg-opt" key={option.value}>
                <input
                  type="radio"
                  name="comparison-period"
                  value={option.value}
                  checked={comparisonPeriod === option.value}
                  onChange={() => setComparisonPeriod(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {comparisonError && <p role="alert">{comparisonError}</p>}

        {comparisonSummary && countChangeTag && totalChangeTag && averageChangeTag && (
          <>
            <div className="comparison-pills">
              <span className="tag tag-accent">{comparisonSummary.currentLabel}</span>
              <span aria-hidden="true">vs</span>
              <span className="tag tag-neutral">{comparisonSummary.previousLabel}</span>
            </div>

            <div className="comparison-grid">
              <div className="card elev-sm">
                <p className="card-kicker">Nº de {comparisonSummary.type === 'EXPENSE' ? 'gastos' : 'ingresos'}</p>
                <p className="card-amount">{comparisonSummary.current.count}</p>
                <p className="card-meta">Anterior: {comparisonSummary.previous.count}</p>
                <span className={countChangeTag.className}>{countChangeTag.text}</span>
              </div>

              <div className="card elev-sm">
                <p className="card-kicker">Importe total</p>
                <p className="card-amount">{formatCurrency(comparisonSummary.current.total)}</p>
                <p className="card-meta">Anterior: {formatCurrency(comparisonSummary.previous.total)}</p>
                <span className={totalChangeTag.className}>{totalChangeTag.text}</span>
              </div>

              <div className="card elev-sm">
                <p className="card-kicker">Media por día</p>
                <p className="card-amount">{formatCurrency(comparisonSummary.current.averagePerDay)}</p>
                <p className="card-meta">Anterior: {formatCurrency(comparisonSummary.previous.averagePerDay)}</p>
                <span className={averageChangeTag.className}>{averageChangeTag.text}</span>
              </div>
            </div>

            <p className="callout" role="status">
              {comparisonSummaryText(comparisonSummary)}
            </p>
          </>
        )}
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>Categorías por periodo</h2>
        </summary>

        <div className="comparison-toolbar">
          <div className="seg" role="radiogroup" aria-label="Tipo de movimiento por categoría">
            <label className="seg-opt">
              <input
                type="radio"
                name="category-comparison-type"
                value="EXPENSE"
                checked={categoryComparisonType === 'EXPENSE'}
                onChange={() => setCategoryComparisonType('EXPENSE')}
              />
              Gastos
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="category-comparison-type"
                value="INCOME"
                checked={categoryComparisonType === 'INCOME'}
                onChange={() => setCategoryComparisonType('INCOME')}
              />
              Ingresos
            </label>
          </div>

          <div className="seg" role="radiogroup" aria-label="Intervalo de categorías">
            {CATEGORY_COMPARISON_PERIOD_OPTIONS.map((option) => (
              <label className="seg-opt" key={option.value}>
                <input
                  type="radio"
                  name="category-comparison-period"
                  value={option.value}
                  checked={categoryComparisonPeriod === option.value}
                  onChange={() => setCategoryComparisonPeriod(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        {categoryComparisonError && <p role="alert">{categoryComparisonError}</p>}

        {categoryComparisonData && categoryComparisonData.categories.length === 0 && (
          <p>Sin {categoryComparisonData.type === 'EXPENSE' ? 'gastos' : 'ingresos'} en este periodo.</p>
        )}

        {categoryComparisonData && categoryComparisonData.categories.length > 0 && (
          <ul id="dashboard-category-comparison-list">
            {categoryComparisonData.categories.map((entry) => {
              const name = categories?.find((c) => c.id === entry.categoryId)?.name ?? entry.categoryId;
              const periodTotal = parseFloat(categoryComparisonData.periodTotal);
              const percent = periodTotal > 0 ? (parseFloat(entry.total) / periodTotal) * 100 : 0;
              const amount = formatCurrency(entry.total);
              const tag = categoryChangeTag(entry.change, categoryComparisonData.type);
              return (
                <li key={entry.categoryId}>
                  <div>
                    <span>{name}</span>
                    <span>{amount}</span>
                    <span className={tag.className}>{tag.text}</span>
                  </div>
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuenow={Math.round(percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${name}: ${amount}`}
                  >
                    <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>Análisis estacional</h2>
        </summary>

        <div className="comparison-toolbar">
          <div className="seg" role="radiogroup" aria-label="Tipo de movimiento a analizar">
            <label className="seg-opt">
              <input
                type="radio"
                name="seasonal-type"
                value="EXPENSE"
                checked={seasonalType === 'EXPENSE'}
                onChange={() => setSeasonalType('EXPENSE')}
              />
              Gastos
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="seasonal-type"
                value="INCOME"
                checked={seasonalType === 'INCOME'}
                onChange={() => setSeasonalType('INCOME')}
              />
              Ingresos
            </label>
          </div>

          <div className="seg" role="radiogroup" aria-label="Alcance del análisis estacional">
            <label className="seg-opt">
              <input
                type="radio"
                name="seasonal-scope"
                value="historic"
                checked={seasonalScope === 'historic'}
                onChange={() => setSeasonalScope('historic')}
              />
              Histórico
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="seasonal-scope"
                value="year"
                checked={seasonalScope === 'year'}
                onChange={() => setSeasonalScope('year')}
              />
              Año concreto
            </label>
          </div>

          {seasonalScope === 'year' && (
            <div className="field" style={{ maxWidth: 140 }}>
              <label htmlFor="seasonal-year">Año</label>
              <input
                id="seasonal-year"
                type="number"
                className="input"
                value={seasonalYear}
                onChange={(e) => setSeasonalYear(e.target.value)}
              />
            </div>
          )}
        </div>

        {seasonalError && <p role="alert">{seasonalError}</p>}

        {seasonalData && (
          <>
            <div className="comparison-grid">
              {seasonalData.seasons.map((entry) => {
                const badge = seasonBadge(entry.season, seasonalData.comparison, seasonalData.type);
                const percent = maxSeasonalTotal > 0 ? (parseFloat(entry.total) / maxSeasonalTotal) * 100 : 0;
                const amount = formatCurrency(entry.total);
                return (
                  <div className="card elev-sm" key={entry.season}>
                    <p className="card-kicker">
                      {SEASON_ICONS[entry.season]} {SEASON_LABELS[entry.season]}
                      {badge && (
                        <span className={badge.className} style={{ marginInlineStart: 8 }}>
                          {badge.text}
                        </span>
                      )}
                    </p>
                    <p className="card-amount">{amount}</p>
                    <p className="card-meta">
                      {entry.count} {entry.count === 1 ? 'movimiento' : 'movimientos'} · {formatCurrency(entry.averagePerDay)}/día
                    </p>
                    <div
                      className="bar"
                      role="progressbar"
                      aria-valuenow={Math.round(percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${SEASON_LABELS[entry.season]}: ${amount}`}
                    >
                      <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="callout" role="status">
              {seasonalSummaryText(seasonalData)}
            </p>
          </>
        )}
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>Resumen del mes</h2>
        </summary>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="month">Mes</label>
          <input id="month" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        {monthError && <p role="alert">{monthError}</p>}

        {monthSummary && (
          <>
            <ul>
              <li>Ingresos: {monthSummary.income}</li>
              <li>Gastos: {monthSummary.expense}</li>
              <li>Ahorro: {monthSummary.savings}</li>
              <li>% de ahorro: {formatPercent(monthSummary.savingsPercent)}</li>
            </ul>
            <ul>
              <li>Ingreso medio/día: {monthSummary.dailyAverages.income}</li>
              <li>Gasto medio/día: {monthSummary.dailyAverages.expense}</li>
              <li>Ahorro medio/día: {monthSummary.dailyAverages.savings}</li>
            </ul>

            <h3>Gastos por categoría</h3>
            {byCategoryChartData.length === 0 && <p>Sin gastos en este mes.</p>}
            {byCategoryChartData.length > 0 && (
              <>
                <div style={{ width: '100%', height: Math.max(byCategoryChartData.length * 32 + 40, 120) }}>
                  <ResponsiveContainer>
                    <BarChart data={byCategoryChartData} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={CHART_TICK_STYLE} />
                      <YAxis type="category" dataKey="name" width={120} tick={CHART_TICK_STYLE} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="total" name="Gasto" fill={COLOR_CATEGORY_BAR} radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Spec 010 (rediseño editorial), plan.md §4.4: sustituye la
                    `<table data-label>` de spec 009 T6 por una lista con
                    barra de progreso de 8px (tal cual el handoff) — mismo
                    dato (categoría + importe), ya no necesita la técnica
                    responsive de spec 009 porque una lista de `<div>` se
                    apila sola en cualquier ancho. */}
                <ul id="dashboard-category-list">
                  {byCategoryChartData.map((entry) => {
                    const totalExpense = monthSummary ? parseFloat(monthSummary.expense) : 0;
                    const percent = totalExpense > 0 ? (entry.total / totalExpense) * 100 : 0;
                    const amount = formatCurrency(entry.total.toFixed(2));
                    return (
                      <li key={entry.name}>
                        <div>
                          <span>{entry.name}</span>
                          <span>{amount}</span>
                        </div>
                        <div
                          className="bar"
                          role="progressbar"
                          aria-valuenow={Math.round(percent)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${entry.name}: ${amount}`}
                        >
                          <div className="bar-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>Vista anual</h2>
        </summary>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="year">Año</label>
          <input id="year" type="number" className="input" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        {yearError && <p role="alert">{yearError}</p>}

        {yearSummary && (
          <>
            <ul>
              <li>Ingresos totales: {yearSummary.totals.income}</li>
              <li>Gastos totales: {yearSummary.totals.expense}</li>
              <li>Ahorro total: {yearSummary.totals.savings}</li>
              <li>% de ahorro global: {formatPercent(yearSummary.totals.savingsPercent)}</li>
            </ul>

            <h3>Evolución mensual</h3>
            {yearSummary.totals.income === '0.00' && yearSummary.totals.expense === '0.00' && (
              <p>Sin movimientos registrados en {year}.</p>
            )}
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={yearSummary.months} margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={CHART_TICK_STYLE} />
                  <YAxis tick={CHART_TICK_STYLE} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="income" name="Ingresos" stroke={COLOR_INCOME} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expense" name="Gastos" stroke={COLOR_EXPENSE} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="savings" name="Ahorro" stroke={COLOR_SAVINGS} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="table">
              <caption>Evolución mensual (tabla)</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">Ingresos</th>
                  <th scope="col">Gastos</th>
                  <th scope="col">Ahorro</th>
                </tr>
              </thead>
              <tbody>
                {yearSummary.months.map((entry) => (
                  <tr key={entry.month}>
                    <td data-label="Mes">{entry.month}</td>
                    <td data-label="Ingresos">{entry.income}</td>
                    <td data-label="Gastos">{entry.expense}</td>
                    <td data-label="Ahorro">{entry.savings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </details>
    </main>
  );
}
