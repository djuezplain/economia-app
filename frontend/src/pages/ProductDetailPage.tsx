import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { getProduct, getProductPrices, mergeProducts, updateProduct } from '../api/groceries';
import type { Product, ProductPrice } from '../api/groceries';
import { ApiError } from '../api/client';

/** Cuerpo del 409 que `ProductsService.update` manda cuando el nombre ya lo usa otro producto (spec 038, H2). */
function duplicateProductIdFrom(body: unknown): string | null {
  if (body && typeof body === 'object' && 'duplicateProductId' in body) {
    const value = (body as { duplicateProductId: unknown }).duplicateProductId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

const CHART_TICK_STYLE = { fontFamily: 'var(--font-body)', fontSize: 12, fill: 'var(--text)' };
const CHART_TOOLTIP_STYLE = { fontFamily: 'var(--font-body)', fontSize: 13 };
/** Sin un color fijo por supermercado en el resto de la app — se asigna por posición (orden alfabético, estable entre renders), cíclico si hay más supermercados que colores. */
const CHART_LINE_COLORS = ['var(--accent-500)', 'var(--accent-2-500)', 'var(--neutral-700)', 'var(--accent-300)', 'var(--accent-2-300)', 'var(--neutral-500)'];

interface ProductStats {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  totalSpent: number;
  purchaseCount: number;
  cheapestSupermarket: { name: string; avgPrice: number };
}

/** Spec 037, plan.md §2: sobre todo el histórico (H1 criterio 1-3), no solo lo visible en la tabla filtrada. */
function computeStats(prices: ProductPrice[]): ProductStats | null {
  if (prices.length === 0) return null;

  const priceValues = prices.map((p) => Number(p.pricePerUnit));
  const totalSpent = prices.reduce((sum, p) => sum + Number(p.amount), 0);

  const pricesBySupermarket = new Map<string, number[]>();
  for (const price of prices) {
    const values = pricesBySupermarket.get(price.supermarketName) ?? [];
    values.push(Number(price.pricePerUnit));
    pricesBySupermarket.set(price.supermarketName, values);
  }
  let cheapestSupermarket = { name: '', avgPrice: Infinity };
  for (const [name, values] of pricesBySupermarket) {
    const avgPrice = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (avgPrice < cheapestSupermarket.avgPrice) cheapestSupermarket = { name, avgPrice };
  }

  return {
    minPrice: Math.min(...priceValues),
    maxPrice: Math.max(...priceValues),
    avgPrice: priceValues.reduce((sum, v) => sum + v, 0) / priceValues.length,
    totalSpent,
    purchaseCount: prices.length,
    cheapestSupermarket,
  };
}

/** Spec 037, plan.md §3: pivota a formato ancho (una fila por fecha, una columna por supermercado) para que Recharts dibuje una serie por supermercado. */
function buildChartData(prices: ProductPrice[]): Array<Record<string, string | number>> {
  const rowByDate = new Map<string, Record<string, string | number>>();
  for (const price of prices) {
    const row = rowByDate.get(price.date) ?? { date: price.date };
    row[price.supermarketName] = Number(price.pricePerUnit);
    rowByDate.set(price.date, row);
  }
  return [...rowByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function uniqueSupermarketNames(prices: ProductPrice[]): string[] {
  return [...new Set(prices.map((p) => p.supermarketName))].sort((a, b) => a.localeCompare(b));
}

/**
 * Spec 036 (H2-H3), plan.md §3 + spec 037 (H1-H2): estadísticas sobre todo
 * el histórico, gráfico de evolución por supermercado, y cada fila de
 * precio enlaza a su ticket real.
 */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prices, setPrices] = useState<ProductPrice[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [duplicate, setDuplicate] = useState<Product | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    // Reinicia el estado de fusión/error al cambiar de producto — necesario
    // además de forma explícita porque, al fusionar y navegar al
    // superviviente, la ruta sigue siendo `/tickets/productos/:id` con solo
    // el id distinto: React Router no desmonta `ProductDetailPage`, así que
    // sin esto el aviso de duplicado y el botón "Fusionando…" se quedarían
    // pegados en pantalla tras la fusión.
    setDuplicate(null);
    setSaveError(null);
    setIsMerging(false);
    getProduct(id)
      .then((p) => {
        setProduct(p);
        setName(p.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el producto.'));
    getProductPrices(id)
      .then(setPrices)
      .catch((err) => setPricesError(err instanceof ApiError ? err.message : 'No se han podido cargar los precios.'));
  }, [isAuthenticated, id]);

  async function handleSave() {
    if (!id) return;
    setSaveError(null);
    setDuplicate(null);
    setIsSaving(true);
    try {
      const updated = await updateProduct(id, name);
      setProduct(updated);
    } catch (err) {
      const duplicateId = err instanceof ApiError && err.status === 409 ? duplicateProductIdFrom(err.body) : null;
      if (duplicateId) {
        try {
          setDuplicate(await getProduct(duplicateId));
        } catch {
          setSaveError(err instanceof ApiError ? err.message : 'No se ha podido guardar el nombre.');
        }
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'No se ha podido guardar el nombre.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  /** Spec 038, H2: en vez de renombrar, el producto actual se fusiona en el duplicado ya existente. */
  async function handleMergeIntoDuplicate() {
    if (!id || !duplicate) return;
    setSaveError(null);
    setIsMerging(true);
    try {
      await mergeProducts(duplicate.id, [id]);
      navigate(`/tickets/productos/${duplicate.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'No se han podido fusionar los productos.');
      setIsMerging(false);
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
        <h1>Producto</h1>
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
        <h1>Producto</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  const stats = prices ? computeStats(prices) : null;
  const chartData = prices ? buildChartData(prices) : [];
  const supermarketNames = prices ? uniqueSupermarketNames(prices) : [];
  const visiblePrices = prices ? (showHistory ? sortHistory(prices) : latestPricePerSupermarket(prices)) : null;

  return (
    <main>
      <p>
        <Link to="/tickets/productos">Volver a productos</Link>
      </p>

      {error && <p role="alert">{error}</p>}

      {product && (
        <>
          <h1>{product.name}</h1>

          <div className="field">
            <label htmlFor="product-name">Nombre</label>
            <input id="product-name" type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {saveError && <p role="alert">{saveError}</p>}
          <button type="button" className="btn btn-primary" disabled={isSaving || name.trim() === ''} onClick={() => void handleSave()}>
            {isSaving ? 'Guardando…' : 'Guardar'}
          </button>

          {duplicate && (
            <div role="alert">
              <p>
                Ya tienes otro producto llamado «{duplicate.name}». ¿Quieres fusionar «{product.name}» con ese producto en vez de renombrarlo?
              </p>
              <button type="button" className="btn btn-primary" disabled={isMerging} onClick={() => void handleMergeIntoDuplicate()}>
                {isMerging ? 'Fusionando…' : 'Fusionar'}
              </button>{' '}
              <button type="button" className="btn btn-secondary" disabled={isMerging} onClick={() => setDuplicate(null)}>
                Cancelar
              </button>
            </div>
          )}

          {pricesError && <p role="alert">{pricesError}</p>}

          {stats && (
            <>
              <h2>Estadísticas</h2>
              <ul>
                <li>
                  Precio mínimo / medio / máximo: {stats.minPrice.toFixed(2)} € / {stats.avgPrice.toFixed(2)} € / {stats.maxPrice.toFixed(2)} €
                </li>
                <li>
                  Supermercado más barato de media: {stats.cheapestSupermarket.name} ({stats.cheapestSupermarket.avgPrice.toFixed(2)} €)
                </li>
                <li>
                  Gasto total: {stats.totalSpent.toFixed(2)} € en {stats.purchaseCount} compra{stats.purchaseCount === 1 ? '' : 's'}
                </li>
              </ul>
            </>
          )}

          {chartData.length >= 2 && (
            <>
              <h2>Evolución del precio</h2>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={CHART_TICK_STYLE} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(2)} €`} tick={CHART_TICK_STYLE} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => `${Number(value).toFixed(2)} €`} />
                    <Legend wrapperStyle={CHART_TOOLTIP_STYLE} />
                    {supermarketNames.map((name, index) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stroke={CHART_LINE_COLORS[index % CHART_LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <h2>{showHistory ? 'Historial de precios' : 'Precio por supermercado'}</h2>
          {prices && prices.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowHistory((current) => !current)}>
              {showHistory ? 'Ver solo el precio más reciente' : 'Historial'}
            </button>
          )}
          {prices && prices.length === 0 && <p>Todavía no tienes ningún ticket con este producto.</p>}
          {visiblePrices && visiblePrices.length > 0 && (
            <table className="table">
              <caption>{showHistory ? 'Historial de precios' : 'Precio más reciente por supermercado'}</caption>
              <thead>
                <tr>
                  <th scope="col">Supermercado</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Precio</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {visiblePrices.map((price, index) => (
                  <tr key={`${price.receiptId}-${index}`}>
                    <td>{price.supermarketName}</td>
                    <td>{price.date}</td>
                    {/* Líneas a peso (kg): mismo criterio que ReceiptDetailPage — el precio por unidad de báscula es poco fiable, se muestra el importe (el dato real cobrado) en su lugar. Estadísticas y gráfico de evolución siguen usando el precio por unidad, sin cambios (comparan precios entre supermercados, no importes de compras concretas). */}
                    <td>{price.unit === 'kg' ? price.amount : price.pricePerUnit} €</td>
                    <td>{price.unit}</td>
                    <td>
                      <Link to={`/tickets/${price.receiptId}`}>Ver ticket</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

/** Spec 036, cambio posterior: por defecto solo el más reciente de cada supermercado. */
function latestPricePerSupermarket(prices: ProductPrice[]): ProductPrice[] {
  const latestBySupermarket = new Map<string, ProductPrice>();
  for (const price of prices) {
    const current = latestBySupermarket.get(price.supermarketId);
    if (!current || price.date > current.date) latestBySupermarket.set(price.supermarketId, price);
  }
  return [...latestBySupermarket.values()].sort((a, b) => Number(a.pricePerUnit) - Number(b.pricePerUnit));
}

/** Historial completo, agrupado por supermercado y en orden cronológico dentro de cada uno. */
function sortHistory(prices: ProductPrice[]): ProductPrice[] {
  return [...prices].sort((a, b) => a.supermarketName.localeCompare(b.supermarketName) || a.date.localeCompare(b.date));
}
