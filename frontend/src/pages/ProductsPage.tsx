import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { mergeProducts, searchProducts } from '../api/groceries';
import type { Product } from '../api/groceries';
import { ApiError } from '../api/client';

/**
 * Spec 036 (H1), plan.md §3: sustituye a `ProductPricesPage` — listado con
 * buscador (spec 034 H4 criterio 1, sin cambios) enlazando a
 * `ProductDetailPage` en vez de mostrar el resultado en la misma pantalla.
 *
 * Spec 038 (H1): selección múltiple + fusión — dos o más productos que en
 * realidad son el mismo (p. ej. duplicados por un ticket mal emparejado) se
 * marcan y se fusionan en uno solo, eligiendo cuál de ellos sobrevive.
 */
export function ProductsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    searchProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar los productos.'));
  }, [isAuthenticated]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const found = await searchProducts(searchTerm || undefined);
      setProducts(found);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido buscar el producto.');
    }
  }

  function toggleSelected(id: string) {
    setMergeError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // El superviviente por defecto es el primero que se marca; si se
      // desmarca, se elige otro de los que queden seleccionados.
      setSurvivorId((currentSurvivor) => {
        if (next.size === 0) return null;
        if (currentSurvivor && next.has(currentSurvivor)) return currentSurvivor;
        return [...next][0];
      });
      return next;
    });
  }

  function cancelSelection() {
    setSelectedIds(new Set());
    setSurvivorId(null);
    setMergeError(null);
  }

  async function handleMerge() {
    if (!survivorId || selectedIds.size < 2) return;
    setMergeError(null);
    setIsMerging(true);
    try {
      const mergedIds = [...selectedIds].filter((id) => id !== survivorId);
      await mergeProducts(survivorId, mergedIds);
      const refreshed = await searchProducts(searchTerm || undefined);
      setProducts(refreshed);
      cancelSelection();
    } catch (err) {
      setMergeError(err instanceof ApiError ? err.message : 'No se han podido fusionar los productos.');
    } finally {
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
        <h1>Productos</h1>
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
        <h1>Productos</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  const selectedProducts = products ? products.filter((p) => selectedIds.has(p.id)) : [];

  return (
    <main>
      <h1>Productos</h1>
      <p>Entra en un producto para ver su precio en cada supermercado donde lo has comprado, o corregir su nombre. Marca dos o más para fusionarlos en uno solo.</p>

      <form onSubmit={(e) => void handleSearch(e)}>
        <label htmlFor="product-search">Buscar</label>
        <input id="product-search" type="text" className="input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button type="submit" className="btn btn-primary">
          Buscar
        </button>
      </form>

      {error && <p role="alert">{error}</p>}

      {products && products.length === 0 && <p>No se ha encontrado ningún producto con ese nombre.</p>}

      {products && products.length > 0 && (
        <ul>
          {products.map((product) => (
            <li key={product.id}>
              <label>
                <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleSelected(product.id)} />{' '}
                <Link to={`/tickets/productos/${product.id}`}>{product.name}</Link>
              </label>
            </li>
          ))}
        </ul>
      )}

      {selectedIds.size >= 2 && (
        <section aria-label="Fusionar productos">
          <h2>Fusionar {selectedIds.size} productos</h2>
          <p>Todos los tickets de los productos seleccionados pasarán a contar como del producto que elijas mantener. Los demás se borrarán.</p>
          <ul>
            {selectedProducts.map((product) => (
              <li key={product.id}>
                <label>
                  <input type="radio" name="survivor" checked={survivorId === product.id} onChange={() => setSurvivorId(product.id)} /> Mantener «{product.name}»
                </label>
              </li>
            ))}
          </ul>
          {mergeError && <p role="alert">{mergeError}</p>}
          <button type="button" className="btn btn-primary" disabled={isMerging || !survivorId} onClick={() => void handleMerge()}>
            {isMerging ? 'Fusionando…' : 'Fusionar'}
          </button>{' '}
          <button type="button" className="btn btn-secondary" disabled={isMerging} onClick={cancelSelection}>
            Cancelar
          </button>
        </section>
      )}
    </main>
  );
}
