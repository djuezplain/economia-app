import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import { getMonthSummary, getYearSummary } from '../api/dashboard';
import type { MonthSummary, MonthlyEvolutionEntry } from '../api/dashboard';
import { getMonthProgress } from '../api/goals-progress';
import type { GoalProgress } from '../api/goals-progress';
import { listTransactions } from '../api/transactions';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { categoryName } from './movements-shared';
import { formatCurrency, formatDate, lastDayOfMonth, monthOverMonthChange } from './home-shared';
import { Sparkline } from '../components/Sparkline';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const PERCENT_FORMATTER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/**
 * Spec 045 (rediseño oscuro), H3. Tarjeta KPI de Inicio: etiqueta, cifra,
 * variación respecto al mes anterior (flecha + %, verde si es favorable y
 * rojo si no — para Gastos, subir es desfavorable) y mini-gráfico del año
 * en curso. La variación y el mini-gráfico son opcionales: sin evolución
 * anual (o sin base con la que comparar) la tarjeta se ve solo con la cifra.
 */
function KpiCard({
  label,
  amount,
  change,
  higherIsBetter,
  series,
  color,
  children,
}: {
  label: string;
  amount: string;
  change: number | null;
  higherIsBetter: boolean;
  series: number[] | null;
  color: string;
  children?: ReactNode;
}) {
  const tone = change === null || change === 0 ? 'neutral' : change > 0 === higherIsBetter ? 'positive' : 'negative';
  return (
    <div className="card kpi-card">
      <p className="card-kicker">{label}</p>
      <p className="card-amount">{formatCurrency(amount)}</p>
      {(change !== null || series) && (
        <div className="kpi-footer">
          {change !== null && (
            <span className="kpi-delta" data-tone={tone}>
              <span aria-hidden="true">{change > 0 ? '↑' : change < 0 ? '↓' : '→'}</span> {PERCENT_FORMATTER.format(change)} % vs.
              mes anterior
            </span>
          )}
          {series && <Sparkline values={series} color={color} />}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Spec 008 (rediseño Broadsheet), plan.md §3. Resumen del mes en curso +
 * últimos movimientos, reutilizando tres llamadas ya existentes de otras
 * páginas (Dashboard spec 002 H4, Goals spec 004 H3, Movimientos spec 002
 * H1) — sin ningún endpoint nuevo ni cálculo financiero nuevo (el balance es
 * una resta de dos totales que ya calcula el backend, puramente de
 * presentación, igual que ya hace `goals-shared.ts` con `parseFloat`).
 *
 * Cada uno de los tres fetches tiene su propio estado de error — que uno
 * falle no bloquea los otros dos (mismo patrón que `DashboardPage`).
 */
export function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  // Spec 011 (modo offline), H6 criterio 1: Inicio combina el resumen del
  // mes (`getMonthSummary`, mismos cálculos fuera de alcance que Dashboard,
  // ver spec.md H3 criterio 4) con el progreso del objetivo de ahorro
  // (fuera de alcance) — se trata igual que `DashboardPage`, no a medias.
  const isOnline = useConnectivity();
  const month = currentMonth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState<GoalProgress | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[] | null>(null);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  // Spec 045, H3: evolución mensual del año en curso para la variación y el
  // mini-gráfico de las tarjetas KPI. Sin estado de error propio: si falla,
  // las tarjetas se ven igual, sin variación ni mini-gráfico (criterio 3).
  const [yearMonths, setYearMonths] = useState<MonthlyEvolutionEntry[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories();
        if (!cancelled) setCategories(list);
      } catch {
        // El nombre de categoría es solo un adorno de la lista de
        // movimientos (se cae a mostrar el id si no carga) — no bloquea el
        // resto de Inicio, mismo criterio que `DashboardPage`.
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
        const summary = await getYearSummary(month.slice(0, 4));
        if (!cancelled) setYearMonths(summary.months);
      } catch {
        // Ver comentario de `yearMonths`: opcional, no bloquea Inicio.
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
        const progress = await getMonthProgress(month);
        if (!cancelled) setSavingsGoal(progress.savingsGoal);
      } catch (err) {
        if (!cancelled) setGoalError(err instanceof ApiError ? err.message : 'No se ha podido cargar el objetivo de ahorro.');
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
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}`;
        const result = await listTransactions({ dateFrom, dateTo, limit: 5 });
        if (!cancelled) setRecentTransactions(result.items);
      } catch (err) {
        if (!cancelled) setMovementsError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, month]);

  const isEmptyMonth = monthSummary?.income === '0.00' && monthSummary?.expense === '0.00';

  // Spec 045, H3: meses del año hasta el actual (la evolución anual trae los
  // 12 desde enero, con los futuros a 0) — el penúltimo es el mes anterior,
  // si lo hay en el mismo año (en enero no hay).
  const monthsSoFar = yearMonths?.filter((entry) => entry.month <= month) ?? [];
  const previousEntry = monthsSoFar.at(-2);
  const seriesOf = (pick: (entry: MonthlyEvolutionEntry) => string) =>
    monthsSoFar.length >= 2 ? monthsSoFar.map((entry) => parseFloat(pick(entry))) : null;
  const balance = monthSummary ? (parseFloat(monthSummary.income) - parseFloat(monthSummary.expense)).toFixed(2) : '0.00';

  return (
    <main>
      <h1>App de Gestión de Economía Personal</h1>

      {isLoading && <p>Comprobando tu sesión…</p>}

      {!isLoading && isAuthenticated && user?.status === 'PENDING_VERIFICATION' && (
        // H2 (spec 001), criterio 3: no bloquea el acceso, pero avisa de
        // forma persistente — se muestra igual sin conexión, no depende de
        // ninguna petición de red (ya se conoce `user.status`).
        <p role="alert">
          Todavía no has verificado tu email. <Link to="/resend-verification">Reenviar el enlace</Link>
        </p>
      )}

      {!isLoading && isAuthenticated && !isOnline && <p role="status">Esta página requiere conexión a internet.</p>}

      {!isLoading && isAuthenticated && isOnline && (
        <>
          <p>{user ? `Sesión iniciada como ${user.name}.` : 'Sesión iniciada.'}</p>

          {monthError && <p role="alert">{monthError}</p>}
          {goalError && <p role="alert">{goalError}</p>}

          {monthSummary && isEmptyMonth && <p>Sin movimientos registrados este mes.</p>}

          {monthSummary && !isEmptyMonth && (
            <div id="home-summary">
              <KpiCard
                label="Balance del mes"
                amount={balance}
                change={monthOverMonthChange(balance, previousEntry?.savings)}
                higherIsBetter
                series={seriesOf((entry) => entry.savings)}
                color="var(--accent)"
              >
                <p className="card-body">
                  {savingsGoal?.targetAmount !== null && savingsGoal?.targetAmount !== undefined ? (
                    `Sobre un objetivo de ${formatCurrency(savingsGoal.targetAmount)}`
                  ) : (
                    <>
                      No tienes un objetivo de ahorro mensual definido. <Link to="/goals">Configúralo</Link>
                    </>
                  )}
                </p>
              </KpiCard>
              <KpiCard
                label="Ingresos"
                amount={monthSummary.income}
                change={monthOverMonthChange(monthSummary.income, previousEntry?.income)}
                higherIsBetter
                series={seriesOf((entry) => entry.income)}
                color="var(--status-green)"
              />
              <KpiCard
                label="Gastos"
                amount={monthSummary.expense}
                change={monthOverMonthChange(monthSummary.expense, previousEntry?.expense)}
                higherIsBetter={false}
                series={seriesOf((entry) => entry.expense)}
                color="var(--status-red)"
              />
            </div>
          )}

          {monthSummary && !isEmptyMonth && (
            <>
              <h2>Últimos movimientos</h2>
              {movementsError && <p role="alert">{movementsError}</p>}
              {recentTransactions && recentTransactions.length > 0 && (
                <ul id="home-recent-list">
                  {recentTransactions.map((t) => (
                    <li key={t.id}>
                      <span className={`dot${t.type === 'INCOME' ? ' dot-accent' : ''}`} aria-hidden="true" />
                      <span>
                        <strong>{t.concept}</strong>
                        <br />
                        <small>
                          {t.merchant ?? categoryName(categories, t.categoryId)} · {formatDate(t.date)}
                        </small>
                      </span>
                      <span>
                        {t.type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                <Link to="/movements">Ver todos los movimientos</Link>
              </p>
            </>
          )}
        </>
      )}

      {!isLoading && !isAuthenticated && (
        <p>
          <Link to="/register">Crear cuenta</Link> · <Link to="/login">Iniciar sesión</Link>
        </p>
      )}
    </main>
  );
}
