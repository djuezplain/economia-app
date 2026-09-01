import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useCategoriesForType } from '../hooks/useCategoriesForType';
import { useConnectivity } from '../hooks/useConnectivity';
import { listTransactions } from '../api/transactions';
import type { MovementType, TransactionsSummary } from '../api/transactions';
import { ApiError } from '../api/client';
import { getAllCachedTransactions, getMeta } from '../offline/db';
import { buildOfflineListResult } from '../offline/queries';
import { LAST_FULL_SYNC_AT_KEY } from '../offline/sync';
import { categoryName } from './movements-shared';

/**
 * Spec 006 (páginas de movimientos), H1 criterio 1. Total, media mensual y
 * desglose por categoría/subcategoría del tipo seleccionado — sin filtros
 * propios (plan.md §5: los filtros son de "Movimientos", no de "Resumen";
 * este resumen es siempre sobre todo el histórico del tipo, no un
 * subconjunto filtrado, a diferencia del "Resumen" de la antigua
 * `MovementsPage`, que compartía la misma consulta filtrada que el listado).
 */
export function MovementsSummaryPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [type, setType] = useState<MovementType>('EXPENSE');
  const { categories, categoriesError } = useCategoriesForType(type);

  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Spec 011 (modo offline), H3 criterio 3.
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        // Spec 011 (modo offline): sin conexión, mismo resumen calculado
        // sobre la copia local (`offline/queries.ts`, `offline/calculations.ts`).
        if (!isOnline) {
          const result = buildOfflineListResult(await getAllCachedTransactions(), { type });
          if (cancelled) return;
          setSummary(result.summary);
          setLastSyncAt((await getMeta(LAST_FULL_SYNC_AT_KEY)) ?? null);
          return;
        }
        const res = await listTransactions({ type });
        if (!cancelled) setSummary(res.summary);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el resumen.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline, type]);

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
        <h1>Resumen</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Resumen</h1>

      <div role="radiogroup" aria-label="Tipo de movimiento">
        <label>
          <input type="radio" name="movement-type" value="EXPENSE" checked={type === 'EXPENSE'} onChange={() => setType('EXPENSE')} />
          Gastos
        </label>{' '}
        <label>
          <input type="radio" name="movement-type" value="INCOME" checked={type === 'INCOME'} onChange={() => setType('INCOME')} />
          Ingresos
        </label>
      </div>

      {!isOnline && (
        <p role="status">
          Sin conexión: mostrando los datos de la última sincronización{lastSyncAt ? ` (${new Date(lastSyncAt).toLocaleString('es-ES')})` : ''}.
        </p>
      )}
      {categoriesError && <p role="alert">{categoriesError}</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {summary && (
        <section>
          <p>
            Total: {summary.total} · Media mensual: {summary.averagePerMonth ?? 'sin datos'}
          </p>
          {summary.byCategory.length > 0 && (
            <ul>
              {summary.byCategory.map((entry) => (
                <li key={entry.categoryId}>
                  {categoryName(categories, entry.categoryId)}: {entry.total}
                </li>
              ))}
            </ul>
          )}
          {/* H2 criterio 4 (spec.md §2 de spec 002): desglose también por
              subcategoría — solo hay subcategorías en gastos, así que en
              ingresos esta lista sale siempre vacía y no se muestra nada. */}
          {summary.bySubcategory.length > 0 && (
            <>
              <h2>Por subcategoría</h2>
              <ul>
                {summary.bySubcategory.map((entry) => (
                  <li key={entry.subcategoryId}>
                    {categoryName(categories, entry.subcategoryId)}: {entry.total}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
