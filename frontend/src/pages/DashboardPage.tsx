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
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import { getMonthSummary, getYearSummary } from '../api/dashboard';
import type { MonthSummary, YearSummary } from '../api/dashboard';
import { ApiError } from '../api/client';

// Colores fijos del "job" de cada serie (paleta categórica validada de la
// skill de dataviz — slots 1/2/3, orden fijo, no ciclado): ingresos = azul,
// gastos = naranja, ahorro = aqua. El desglose de gastos por categoría (H4
// criterio 2) no usa un color por categoría (podrían ser más de 8 y romper
// el presupuesto categórico) — es una comparación de magnitud con la
// categoría ya identificada por su etiqueta en el eje, así que lleva un
// único tono (secuencial) en vez de gastar el canal de identidad sin falta.
const COLOR_INCOME = '#2a78d6';
const COLOR_EXPENSE = '#eb6834';
const COLOR_SAVINGS = '#1baf7a';
const COLOR_CATEGORY_BAR = '#2a78d6';

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

  const [categories, setCategories] = useState<Category[] | null>(null);

  const [month, setMonth] = useState(currentMonth());
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);

  const [year, setYear] = useState(currentYear());
  const [yearSummary, setYearSummary] = useState<YearSummary | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated, month]);

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated, year]);

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

  return (
    <main>
      <h1>Dashboard</h1>

      <section>
        <h2>Resumen del mes</h2>
        <div>
          <label htmlFor="month">Mes</label>
          <input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip />
                      <Bar dataKey="total" name="Gasto" fill={COLOR_CATEGORY_BAR} radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table>
                  <caption>Gastos por categoría (tabla)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Categoría</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategoryChartData.map((entry) => (
                      <tr key={entry.name}>
                        <td>{entry.name}</td>
                        <td>{entry.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Vista anual</h2>
        <div>
          <label htmlFor="year">Año</label>
          <input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
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
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Ingresos" stroke={COLOR_INCOME} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expense" name="Gastos" stroke={COLOR_EXPENSE} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="savings" name="Ahorro" stroke={COLOR_SAVINGS} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table>
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
                    <td>{entry.month}</td>
                    <td>{entry.income}</td>
                    <td>{entry.expense}</td>
                    <td>{entry.savings}</td>
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
