import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { getProduct, getProductPrices, updateProduct } from '../api/groceries';
import type { Product, ProductPrice } from '../api/groceries';
import { ApiError } from '../api/client';

/**
 * Petición de Diego: por defecto solo el precio más reciente por
 * supermercado (no cada línea histórica) — el botón "Historial" muestra
 * todo. Cálculo en el cliente sobre la respuesta ya existente de
 * `GET /products/:id/prices` (spec 034 H4 criterio 3): a esta escala no
 * hace falta un parámetro nuevo en el backend para esto.
 */
function latestPricePerSupermarket(prices: ProductPrice[]): ProductPrice[] {
  const latestBySupermarket = new Map<string, ProductPrice>();
  for (const price of prices) {
    const current = latestBySupermarket.get(price.supermarketId);
    if (!current || price.date > current.date) latestBySupermarket.set(price.supermarketId, price);
  }
  return [...latestBySupermarket.values()].sort((a, b) => Number(a.pricePerUnit) - Number(b.pricePerUnit));
}

/** Historial completo, agrupado por supermercado y en orden cronológico dentro de cada uno — más fácil de leer la evolución que una lista plana por precio. */
function sortHistory(prices: ProductPrice[]): ProductPrice[] {
  return [...prices].sort((a, b) => a.supermarketName.localeCompare(b.supermarketName) || a.date.localeCompare(b.date));
}

/** Spec 036 (H2-H3), plan.md §3: nombre editable + precio por supermercado (spec 034 H4 criterio 3, revisado: solo el más reciente por defecto, con historial completo bajo un botón). */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
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

  useEffect(() => {
    if (!isAuthenticated || !id) return;
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
    setIsSaving(true);
    try {
      const updated = await updateProduct(id, name);
      setProduct(updated);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'No se ha podido guardar el nombre.');
    } finally {
      setIsSaving(false);
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

          <h2>{showHistory ? 'Historial de precios' : 'Precio por supermercado'}</h2>
          {pricesError && <p role="alert">{pricesError}</p>}
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
                </tr>
              </thead>
              <tbody>
                {visiblePrices.map((price, index) => (
                  <tr key={`${price.receiptId}-${index}`}>
                    <td>{price.supermarketName}</td>
                    <td>{price.date}</td>
                    <td>{price.pricePerUnit} €</td>
                    <td>{price.unit}</td>
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
