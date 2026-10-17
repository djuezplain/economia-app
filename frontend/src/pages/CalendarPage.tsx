import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useCategoriesForType } from '../hooks/useCategoriesForType';
import { useConnectivity } from '../hooks/useConnectivity';
import { listTransactions } from '../api/transactions';
import { listOccurrences } from '../api/recurring-transactions';
import type { Occurrence } from '../api/recurring-transactions';
import { OccurrenceRow } from '../components/OccurrenceRow';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { getAllCachedTransactions, getMeta } from '../offline/db';
import { filterCachedTransactions } from '../offline/queries';
import { LAST_FULL_SYNC_AT_KEY } from '../offline/sync';
import { categoryIcon, categoryName, PAYMENT_METHOD_LABELS, todayIso } from './movements-shared';
import { formatCurrency } from './home-shared';
import { buildMonthGrid, groupByDate, longDayLabel, monthLabel, monthRange, monthTotals, shiftMonth } from './calendar-shared';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MAX_CHIPS = 3;
const PAGE_SIZE = 200; // máximo que acepta `GET /transactions`

async function loadMonth(month: string): Promise<Transaction[]> {
  const range = monthRange(month);
  const first = await listTransactions({ ...range, limit: PAGE_SIZE, page: 1 });
  const items = [...first.items];
  for (let page = 2; items.length < first.totalItems; page++) {
    items.push(...(await listTransactions({ ...range, limit: PAGE_SIZE, page })).items);
  }
  return items;
}

/**
 * Spec 046 (calendario). Movimientos del mes sobre una cuadrícula lun–dom, con
 * resumen del mes y detalle del día seleccionado. Online lee de la API
 * (paginando hasta traer todo el mes); offline, de la copia local.
 *
 * Spec 047 (recurrentes). Online, además, se pintan las ocurrencias previstas
 * (pendientes o vencidas) con un estilo discontinuo y, en el detalle del día,
 * con Confirmar / Omitir. No entran en el resumen del mes: solo cuentan los
 * movimientos reales. Si no se pueden cargar, el calendario sigue con los reales.
 */
export function CalendarPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();
  const { categories: expenseCategories } = useCategoriesForType('EXPENSE');
  const { categories: incomeCategories } = useCategoriesForType('INCOME');
  const categories = useMemo(
    () => (expenseCategories || incomeCategories ? [...(expenseCategories ?? []), ...(incomeCategories ?? [])] : null),
    [expenseCategories, incomeCategories],
  );

  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [occurrencesError, setOccurrencesError] = useState<string | null>(null);
  // Se incrementa al confirmar/omitir una ocurrencia para recargar reales y previstas.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        if (!isOnline) {
          const cached = await getAllCachedTransactions();
          if (cancelled) return;
          setTransactions(filterCachedTransactions(cached, monthRange(month)));
          setLastSyncAt((await getMeta(LAST_FULL_SYNC_AT_KEY)) ?? null);
          return;
        }
        const items = await loadMonth(month);
        if (!cancelled) setTransactions(items);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, month, reloadKey]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const { dateFrom, dateTo } = monthRange(month);
        const list = await listOccurrences(dateFrom, dateTo);
        if (cancelled) return;
        setOccurrences(list.filter((o) => o.status === 'PENDING' || o.status === 'OVERDUE'));
        setOccurrencesError(null);
      } catch {
        if (cancelled) return;
        setOccurrences([]);
        setOccurrencesError('No se han podido cargar los movimientos previstos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, month, reloadKey]);

  function goToMonth(next: string) {
    setMonth(next);
    setTransactions(null);
    // Al cambiar de mes se selecciona hoy (si cae en él) o el día 1.
    setSelected(today.startsWith(next) ? today : `${next}-01`);
  }

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const byDate = useMemo(() => groupByDate(transactions ?? []), [transactions]);
  // Sin conexión no hay previstos (v1 de recurrentes: confirmar exige red).
  const plannedByDate = useMemo(() => groupByDate(isOnline ? occurrences : []), [isOnline, occurrences]);
  const totals = useMemo(() => monthTotals(transactions ?? []), [transactions]);

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
        <h1>Calendario</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const selectedItems = byDate.get(selected) ?? [];
  const selectedPlanned = plannedByDate.get(selected) ?? [];

  return (
    <main>
      <h1>Calendario</h1>

      <div className="cal-toolbar">
        <button type="button" className="btn" aria-label="Mes anterior" onClick={() => goToMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <h2 className="cal-month" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <button type="button" className="btn" aria-label="Mes siguiente" onClick={() => goToMonth(shiftMonth(month, 1))}>
          ›
        </button>
        <button type="button" className="btn" onClick={() => goToMonth(today.slice(0, 7))} disabled={month === today.slice(0, 7)}>
          Hoy
        </button>
      </div>

      {!isOnline && (
        <p role="status">
          Sin conexión: mostrando los datos de la última sincronización{lastSyncAt ? ` (${new Date(lastSyncAt).toLocaleString('es-ES')})` : ''}.
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {occurrencesError && <p role="status">{occurrencesError}</p>}

      <dl className="cal-totals">
        <div className="card">
          <dt className="card-kicker">Ingresos</dt>
          <dd className="card-amount cal-income">{formatCurrency(totals.income)}</dd>
        </div>
        <div className="card">
          <dt className="card-kicker">Gastos</dt>
          <dd className="card-amount cal-expense">{formatCurrency(totals.expense)}</dd>
        </div>
        <div className="card">
          <dt className="card-kicker">Balance</dt>
          <dd className="card-amount">{formatCurrency(totals.balance)}</dd>
        </div>
      </dl>

      <div className="cal-grid" role="grid" aria-label={`Calendario de ${monthLabel(month)}`}>
        <div className="cal-weekdays" role="row">
          {WEEKDAYS.map((d) => (
            <span key={d} role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {grid.map((week) => (
          <div className="cal-week" role="row" key={week[0].date}>
            {week.map((cell) => {
              const real = byDate.get(cell.date) ?? [];
              const planned = plannedByDate.get(cell.date) ?? [];
              const chips = [
                ...real.map((t) => ({ key: t.id, type: t.type, categoryId: t.categoryId, isPlanned: false })),
                ...planned.map((o) => ({ key: `${o.recurringId}|${o.date}`, type: o.type, categoryId: o.categoryId, isPlanned: true })),
              ];
              const classes = ['cal-day'];
              if (!cell.inMonth) classes.push('cal-day-out');
              if (cell.date === today) classes.push('cal-day-today');
              if (cell.date === selected) classes.push('cal-day-selected');
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={cell.date}
                  className={classes.join(' ')}
                  aria-selected={cell.date === selected}
                  aria-label={`${longDayLabel(cell.date)}${real.length ? `, ${real.length} movimiento${real.length > 1 ? 's' : ''}` : ''}${planned.length ? `, ${planned.length} previsto${planned.length > 1 ? 's' : ''}` : ''}`}
                  onClick={() => {
                    setSelected(cell.date);
                    // Pulsar un día atenuado de otro mes salta a ese mes.
                    if (!cell.inMonth) setMonth(cell.date.slice(0, 7));
                  }}
                >
                  <span className="cal-day-number">{cell.day}</span>
                  <span className="cal-chips" aria-hidden="true">
                    {chips.slice(0, chips.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS).map((c) => (
                      <span
                        key={c.key}
                        className={`cal-chip ${c.type === 'INCOME' ? 'cal-chip-income' : 'cal-chip-expense'}${c.isPlanned ? ' cal-chip-planned' : ''}`}
                      >
                        {categoryIcon(categories, c.categoryId)}
                      </span>
                    ))}
                    {chips.length > MAX_CHIPS && <span className="cal-more">+{chips.length - (MAX_CHIPS - 1)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <section aria-label={`Movimientos del ${longDayLabel(selected)}`}>
        <h2>{longDayLabel(selected)}</h2>
        {transactions && selectedItems.length === 0 && selectedPlanned.length === 0 && <p>No hay movimientos este día.</p>}
        {selectedPlanned.length > 0 && (
          <ul id="calendar-day-planned">
            {selectedPlanned.map((o) => (
              <OccurrenceRow
                key={`${o.recurringId}|${o.date}`}
                occurrence={o}
                categories={categories}
                onResolved={() => setReloadKey((k) => k + 1)}
              />
            ))}
          </ul>
        )}
        {selectedItems.length > 0 && (
          <ul id="calendar-day-list">
            {selectedItems.map((t) => (
              <li className={`card card-row cal-item ${t.type === 'INCOME' ? 'cal-item-income' : 'cal-item-expense'}`} key={t.id}>
                <div>
                  <span className={`category-icon${t.type === 'INCOME' ? ' category-icon-accent' : ''}`} aria-hidden="true">
                    {categoryIcon(categories, t.categoryId)}
                  </span>{' '}
                  <Link to={`/movements/register/${t.id}`}>
                    <strong>{t.concept}</strong>
                  </Link>
                  <p className="card-meta">
                    {[categoryName(categories, t.categoryId), t.merchant, t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : null]
                      .filter((part): part is string => Boolean(part))
                      .join(' · ')}
                  </p>
                </div>
                <div className={`card-amount ${t.type === 'INCOME' ? 'cal-income' : 'cal-expense'}`}>
                  {t.type === 'INCOME' ? '+' : '−'}
                  {formatCurrency(t.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
