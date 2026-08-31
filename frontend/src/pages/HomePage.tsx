import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import { getMonthSummary } from '../api/dashboard';
import type { MonthSummary } from '../api/dashboard';
import { getMonthProgress } from '../api/goals-progress';
import type { GoalProgress } from '../api/goals-progress';
import { listTransactions } from '../api/transactions';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { categoryName } from './movements-shared';
import { formatCurrency, formatDate, lastDayOfMonth } from './home-shared';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
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
  const month = currentMonth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState<GoalProgress | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[] | null>(null);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
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
        const progress = await getMonthProgress(month);
        if (!cancelled) setSavingsGoal(progress.savingsGoal);
      } catch (err) {
        if (!cancelled) setGoalError(err instanceof ApiError ? err.message : 'No se ha podido cargar el objetivo de ahorro.');
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
  }, [isAuthenticated, month]);

  const isEmptyMonth = monthSummary?.income === '0.00' && monthSummary?.expense === '0.00';

  return (
    <main>
      <h1>App de Gestión de Economía Personal</h1>

      {isLoading && <p>Comprobando tu sesión…</p>}

      {!isLoading && isAuthenticated && (
        <>
          {user?.status === 'PENDING_VERIFICATION' && (
            // H2 (spec 001), criterio 3: no bloquea el acceso, pero avisa de
            // forma persistente.
            <p role="alert">
              Todavía no has verificado tu email. <Link to="/resend-verification">Reenviar el enlace</Link>
            </p>
          )}
          <p>{user ? `Sesión iniciada como ${user.name}.` : 'Sesión iniciada.'}</p>

          {monthError && <p role="alert">{monthError}</p>}
          {goalError && <p role="alert">{goalError}</p>}

          {monthSummary && isEmptyMonth && <p>Sin movimientos registrados este mes.</p>}

          {monthSummary && !isEmptyMonth && (
            <div id="home-summary">
              <div className="card elev-sm">
                <p className="card-kicker">Balance del mes</p>
                <p className="card-amount">{formatCurrency((parseFloat(monthSummary.income) - parseFloat(monthSummary.expense)).toFixed(2))}</p>
                <p className="card-body">
                  {savingsGoal?.targetAmount !== null && savingsGoal?.targetAmount !== undefined ? (
                    `Sobre un objetivo de ${formatCurrency(savingsGoal.targetAmount)}`
                  ) : (
                    <>
                      No tienes un objetivo de ahorro mensual definido. <Link to="/goals">Configúralo</Link>
                    </>
                  )}
                </p>
              </div>
              <div className="card elev-sm">
                <p className="card-kicker">Ingresos</p>
                <p className="card-amount">{formatCurrency(monthSummary.income)}</p>
              </div>
              <div className="card elev-sm">
                <p className="card-kicker">Gastos</p>
                <p className="card-amount">{formatCurrency(monthSummary.expense)}</p>
              </div>
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
