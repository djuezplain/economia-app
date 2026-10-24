import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { listReceipts, listSupermarkets, searchProducts } from '../api/groceries';
import type { ListReceiptsFilters, Product, ReceiptMatchField, ReceiptSummary, Supermarket } from '../api/groceries';
import { listReceiptTags } from '../api/receipt-tags';
import type { ReceiptTag } from '../api/receipt-tags';
import { TagChip } from '../components/TagChip';
import { ApiError } from '../api/client';
import { TagList } from '../components/TagChip';
import { localToday, warrantyLabel, warrantyStatus } from './receipt-warranty';

const EMPTY_FILTERS = { supermarketId: '', productId: '', dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };

/** Spec 051 H2: espera tras la última tecla antes de buscar. */
export const SEARCH_DEBOUNCE_MS = 300;

const MATCH_LABELS: Record<ReceiptMatchField, string> = {
  merchant: 'el comercio',
  tag: 'una etiqueta',
  note: 'la nota',
  line: 'una línea',
  product: 'un producto',
  document: 'el documento',
};

/** Spec 034 (H5 criterio 1), plan.md §11 + spec 040 (H1): filtros por supermercado, producto, fechas e importe. */
export function ReceiptsPage() {
  const today = localToday();
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
  // Spec 051: buscador (con espera), etiquetas y garantía.
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<ReceiptTag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [warranty, setWarranty] = useState<'' | 'active' | 'expiring'>('');

  const filters: ListReceiptsFilters = useMemo(
    () => ({
      supermarketId: supermarketId || undefined,
      productId: productId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      amountMin: amountMin || undefined,
      amountMax: amountMax || undefined,
      q: query.trim() || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      warranty: warranty || undefined,
    }),
    [supermarketId, productId, dateFrom, dateTo, amountMin, amountMax, query, tagIds, warranty],
  );
  const hasActiveFilters = Object.values(filters).some((value) => value !== undefined);

  useEffect(() => {
    if (!isAuthenticated) return;
    void listSupermarkets().then(setSupermarkets);
    void searchProducts().then(setProducts);
    listReceiptTags()
      .then(setAvailableTags)
      .catch(() => setAvailableTags([]));
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Con la búsqueda, las respuestas pueden llegar desordenadas: solo vale la última.
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos remotos al cambiar los filtros
    setError(null);
    listReceipts(filters)
      .then((result) => {
        if (!cancelled) setReceipts(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se han podido cargar los tickets.');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, filters]);

  function toggleTag(id: string) {
    setTagIds((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
  }

  function handleClearFilters() {
    setSupermarketId(EMPTY_FILTERS.supermarketId);
    setProductId(EMPTY_FILTERS.productId);
    setDateFrom(EMPTY_FILTERS.dateFrom);
    setDateTo(EMPTY_FILTERS.dateTo);
    setAmountMin(EMPTY_FILTERS.amountMin);
    setAmountMax(EMPTY_FILTERS.amountMax);
    setSearchText('');
    setQuery('');
    setTagIds([]);
    setWarranty('');
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
        <h1>Tickets y facturas</h1>
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
        <h1>Tickets y facturas</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Tickets y facturas</h1>
      <p>
        <Link to="/tickets/importar">Importar un ticket nuevo</Link> · <Link to="/tickets/etiquetas">Etiquetas</Link>
      </p>

      <div className="receipt-search">
        <label htmlFor="receipt-search" className="sr-only">
          Buscar tickets
        </label>
        <input
          id="receipt-search"
          className="input"
          type="search"
          maxLength={200}
          placeholder="Buscar: lavadora, Leroy, número de serie…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <section>
        <h2>Filtros</h2>
        <div id="receipts-filters">
          <div className="field">
            <label htmlFor="filter-supermarket">Comercio</label>
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
          <div className="field">
            <label htmlFor="filter-warranty">Garantía</label>
            <select id="filter-warranty" className="input" value={warranty} onChange={(e) => setWarranty(e.target.value as typeof warranty)}>
              <option value="">Todas</option>
              <option value="active">Con garantía vigente</option>
              <option value="expiring">Caduca en los próximos 30 días</option>
            </select>
          </div>
        </div>
        {availableTags.length > 0 && (
          <div className="receipt-tag-filter" role="group" aria-label="Filtrar por etiquetas">
            {availableTags.map((tag) => (
              <button key={tag.id} type="button" className="tag-filter-button" aria-pressed={tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)}>
                <TagChip tag={tag} />
              </button>
            ))}
          </div>
        )}
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
                {/* Spec 048 plan.md §0 decisión 6: el importe del ticket (suma de líneas o, sin líneas, el total). */}
                <span className="card-amount">{receipt.total !== null ? `${receipt.total} €` : '—'}</span>
              </div>
              <p className="card-meta">
                {receipt.supermarketName}
                {receipt.document && (
                  <>
                    {' · '}
                    <span aria-label={receipt.document.mimeType === 'application/pdf' ? 'con PDF' : 'con foto'} title="Tiene el documento original">
                      📎
                    </span>
                  </>
                )}
                {receipt.hasNote && (
                  <>
                    {' · '}
                    <span aria-label="con nota" title="Tiene nota">
                      📝
                    </span>
                  </>
                )}
                {receipt.warrantyUntil && (
                  <>
                    {' · '}
                    <span className={`warranty-status warranty-${warrantyStatus(receipt.warrantyUntil, today)}`}>🛡️ {warrantyLabel(receipt.warrantyUntil, today)}</span>
                  </>
                )}
              </p>
              <TagList tags={receipt.tags} />
              {receipt.match?.snippet && (
                <p className="card-meta receipt-match">
                  Coincide en {MATCH_LABELS[receipt.match.field]}: «{receipt.match.snippet}»
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
