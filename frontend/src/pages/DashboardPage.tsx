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
import { getMonthSummary, getYearSummary } from '../api/dashboard';
import type { MonthSummary, YearSummary } from '../api/dashboard';
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

  return (
    <main>
      <h1>Dashboard</h1>

      <section>
        <h2>Resumen del mes</h2>
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
      </section>

      <section>
        <h2>Vista anual</h2>
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
      </section>
    </main>
  );
}
