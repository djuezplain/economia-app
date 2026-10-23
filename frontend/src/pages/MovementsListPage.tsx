import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useCategoriesForType } from '../hooks/useCategoriesForType';
import { useConnectivity } from '../hooks/useConnectivity';
import { deleteTransaction, listTransactions } from '../api/transactions';
import type { MovementType } from '../api/transactions';
import { ApiError } from '../api/client';
import { getAllCachedTransactions, getMeta } from '../offline/db';
import type { CachedTransaction } from '../offline/db';
import { buildOfflineListResult } from '../offline/queries';
import { LAST_FULL_SYNC_AT_KEY } from '../offline/sync';
import { categoryIcon, categoryName, PAYMENT_METHOD_LABELS } from './movements-shared';
import { formatCurrency } from './home-shared';

/**
 * Spec 006 (páginas de movimientos), H1 criterio 2. Filtros + listado con
 * editar/eliminar — sin el resumen ni el formulario de registro (antes
 * convivían los tres en `MovementsPage`, spec 002). "Editar" navega a
 * `/movements/register/:id` en vez de abrir un formulario inline (H3).
 */
export function MovementsListPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const isOnline = useConnectivity();

  const [type, setType] = useState<MovementType>('EXPENSE');
  const { categories, categoriesError } = useCategoriesForType(type);

  // Filtros del listado (H1/H2 criterio 3, spec 002).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [q, setQ] = useState('');

  const [result, setResult] = useState<Awaited<ReturnType<typeof listTransactions>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Spec 011 (modo offline), H3 criterio 3: cuándo se sincronizó la copia
  // local por última vez, para no dar una falsa sensación de estar al día.
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      type,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      categoryId: filterCategoryId || undefined,
      merchant: merchantFilter || undefined,
      q: q || undefined,
    }),
    [type, dateFrom, dateTo, filterCategoryId, merchantFilter, q],
  );

  /**
   * Spec 011 (modo offline), plan.md §4/§7, H3. Sin conexión, se lee la
   * copia local en vez de llamar a la API — mismos filtros, mismo cálculo
   * de resumen (`offline/queries.ts`), sobre lo último sincronizado.
   */
  async function loadOffline() {
    const cached = await getAllCachedTransactions();
    setResult(buildOfflineListResult(cached, filters));
    setLastSyncAt((await getMeta(LAST_FULL_SYNC_AT_KEY)) ?? null);
  }

  async function reloadList() {
    if (!isOnline) {
      await loadOffline();
      return;
    }
    const res = await listTransactions(filters);
    setResult(res);
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        if (!isOnline) {
          const cached = await getAllCachedTransactions();
          if (cancelled) return;
          setResult(buildOfflineListResult(cached, filters));
          setLastSyncAt((await getMeta(LAST_FULL_SYNC_AT_KEY)) ?? null);
          return;
        }
        const res = await listTransactions(filters);
        if (!cancelled) setResult(res);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, filters]);

  async function handleDelete(id: string) {
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteTransaction(id);
      await reloadList();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el movimiento.');
    } finally {
      setPendingDeleteId(null);
    }
  }

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
        <h1>Movimientos</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const topLevelCategories = categories?.filter((c) => !c.parentId) ?? [];

  return (
    <main>
      <h1>Movimientos</h1>

      <div className="seg" role="radiogroup" aria-label="Tipo de movimiento">
        <label className="seg-opt">
          <input
            type="radio"
            name="movement-type"
            value="EXPENSE"
            checked={type === 'EXPENSE'}
            onChange={() => {
              setType('EXPENSE');
              setFilterCategoryId('');
            }}
          />
          Gastos
        </label>
        <label className="seg-opt">
          <input
            type="radio"
            name="movement-type"
            value="INCOME"
            checked={type === 'INCOME'}
            onChange={() => {
              setType('INCOME');
              setFilterCategoryId('');
            }}
          />
          Ingresos
        </label>
      </div>{' '}
      {/* Spec 010 (rediseño editorial), plan.md §4.3. Enlaza a la pestaña
          "Registrar" ya existente (`MovementsLayout`) — no crea un
          formulario inline nuevo, las pestañas de abajo se conservan
          igual (H5 criterio 3). */}
      <Link to="/movements/register" className="btn btn-primary">
        + Añadir movimiento
      </Link>

      {categoriesError && <p role="alert">{categoriesError}</p>}

      <section>
        <h2>Filtros</h2>
        <div id="movements-filters">
          <div className="field">
            <label htmlFor="dateFrom">Desde</label>
            <input id="dateFrom" type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dateTo">Hasta</label>
            <input id="dateTo" type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="filterCategoryId">Categoría</label>
            <select
              id="filterCategoryId"
              className="input"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
            >
              <option value="">Todas</option>
              {topLevelCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {type === 'EXPENSE' && (
            <div className="field">
              <label htmlFor="merchantFilter">Comercio</label>
              <input
                id="merchantFilter"
                type="text"
                className="input"
                value={merchantFilter}
                onChange={(e) => setMerchantFilter(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="q">Buscar en el concepto</label>
            <input id="q" type="text" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </section>

      {!isOnline && (
        <p role="status">
          Sin conexión: mostrando los datos de la última sincronización{lastSyncAt ? ` (${new Date(lastSyncAt).toLocaleString('es-ES')})` : ''}.
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}

      <section>
        <h2>Movimientos</h2>
        {result && result.items.length === 0 && <p>No hay movimientos con estos filtros.</p>}
        {/* Spec 010 (rediseño editorial), plan.md §4.3. Cada movimiento pasa
            a `.card.card-row` (antes 3 `<div>` en línea, spec 009 T3) — se
            reutiliza el mismo agrupamiento en bloques, solo cambian las
            clases del contenedor; la categoría (y subcategoría, si la hay)
            pasan de texto con `·` a `.tag.tag-neutral`. */}
        {result && result.items.length > 0 && (
          <ul id="movements-list">
            {result.items.map((t) => (
              <li className="card card-row" key={t.id}>
                <div>
                  <span className={`category-icon${type === 'INCOME' ? ' category-icon-accent' : ''}`} aria-hidden="true">
                    {categoryIcon(categories, t.categoryId)}
                  </span>{' '}
                  <strong>{t.concept}</strong> <span className="tag tag-neutral">{categoryName(categories, t.categoryId)}</span>
                  {t.subcategoryId && (
                    <span className="tag tag-neutral">{categoryName(categories, t.subcategoryId)}</span>
                  )}
                  {/* Spec 011 (modo offline), H2 criterio 2/3: un movimiento
                      creado/editado/borrado sin conexión se marca así hasta
                      que se sincroniza (grupo 5 procesa la cola y lo quita
                      de la caché con `pending: false`). */}
                  {(t as CachedTransaction).pending && <span className="tag tag-accent">pendiente de sincronizar</span>}
                  {/* Spec 048 H3 criterio 4. */}
                  {t.receiptId && (
                    <Link className="tag tag-neutral" to={`/tickets/${t.receiptId}`} aria-label={`Ver el ticket de ${t.concept}`}>
                      🧾 ticket
                    </Link>
                  )}
                  <p className="card-meta">
                    {[t.merchant, t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : null, t.date]
                      .filter((part): part is string => Boolean(part))
                      .map((part, i) => (
                        <span key={`${i}-${part}`}>
                          {i > 0 && ' · '}
                          {part}
                        </span>
                      ))}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="card-amount" style={{ fontSize: '16px' }}>
                    {type === 'INCOME' ? '+' : '−'}
                    {formatCurrency(t.amount)}
                  </p>
                  <button type="button" className="btn btn-secondary" onClick={() => navigate(`/movements/register/${t.id}`)}>
                    Editar
                  </button>{' '}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pendingDeleteId === t.id}
                    onClick={() => void handleDelete(t.id)}
                  >
                    {pendingDeleteId === t.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
