import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listReceipts, listSupermarkets, searchProducts } from '../api/groceries';
import type { ListReceiptsFilters, Product, ReceiptSummary, Supermarket } from '../api/groceries';
import { ApiError } from '../api/client';

const EMPTY_FILTERS = { supermarketId: '', productId: '', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };

/** Spec 034 (H5 criterio 1), plan.md §11 + spec 040 (H1): filtros por supermercado, producto, fechas e importe. */
export function ReceiptsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [receipts, setReceipts] = useState<ReceiptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [supermarketId, setSupermarketId] = useState('');
  const [productId, setProductId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const filters: ListReceiptsFilters = useMemo(
    () => ({
      supermarketId: supermarketId || undefined,
      productId: productId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      amountMin: amountMin || undefined,
      amountMax: amountMax || undefined,
    }),
    [supermarketId, productId, dateFrom, dateTo, amountMin, amountMax],
  );
  const hasActiveFilters = Object.values(filters).some((value) => value !== undefined);

  useEffect(() => {
    if (!isAuthenticated) return;
    void listSupermarkets().then(setSupermarkets);
    void searchProducts().then(setProducts);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setError(null);
    listReceipts(filters)
      .then(setReceipts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar los tickets.'));
  }, [isAuthenticated, filters]);

  function handleClearFilters() {
    setSupermarketId(EMPTY_FILTERS.supermarketId);
    setProductId(EMPTY_FILTERS.productId);
    setDateFrom(EMPTY_FILTERS.dateFrom);
    setDateTo(EMPTY_FILTERS.dateTo);
    setAmountMin(EMPTY_FILTERS.amountMin);
    setAmountMax(EMPTY_FILTERS.amountMax);
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
        <h1>Tickets de supermercado</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  if (!isOnline) {
    return (
      <main>
        <h1>Tickets de supermercado</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Tickets de supermercado</h1>
      <p>
        <Link to="/tickets/importar">Importar un ticket nuevo</Link>
      </p>

      <section>
        <h2>Filtros</h2>
        <div id="receipts-filters">
          <div className="field">
            <label htmlFor="filter-supermarket">Supermercado</label>
            <select id="filter-supermarket" className="input" value={supermarketId} onChange={(e) => setSupermarketId(e.target.value)}>
              <option value="">Todos</option>
              {supermarkets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-product">Producto</label>
            <select id="filter-product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-date-from">Desde</label>
            <input id="filter-date-from" type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="filter-date-to">Hasta</label>
            <input id="filter-date-to" type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="filter-amount-min">Importe mínimo</label>
            <input
              id="filter-amount-min"
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="filter-amount-max">Importe máximo</label>
            <input
              id="filter-amount-max"
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
            />
          </div>
        </div>
        {hasActiveFilters && (
          <button type="button" className="btn btn-ghost" onClick={handleClearFilters}>
            Limpiar filtros
          </button>
        )}
      </section>

      {error && <p role="alert">{error}</p>}

      {receipts && receipts.length === 0 && !hasActiveFilters && <p>Todavía no has importado ningún ticket.</p>}
      {receipts && receipts.length === 0 && hasActiveFilters && <p>No hay tickets con estos filtros.</p>}

      {/* Antes una `<table>` (spec 034): pasa a `.card` con
          `.wealth-item-header` (petición de Diego, mismo patrón que las
          filas de Patrimonio) para heredar el aspecto de tarjeta elevada y
          radios redondeados del resto de la app. */}
      {receipts && receipts.length > 0 && (
        <ul id="receipts-list">
          {receipts.map((receipt) => (
            <li className="card" key={receipt.id}>
              <div className="wealth-item-header">
                <Link to={`/tickets/${receipt.id}`} className="card-title">
                  {receipt.date}
                </Link>
                <span className="card-amount">{receipt.printedTotal ? `${receipt.printedTotal} €` : '—'}</span>
              </div>
              <p className="card-meta">
                {receipt.supermarketName} · Suma de líneas: {receipt.linesTotal} €
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
