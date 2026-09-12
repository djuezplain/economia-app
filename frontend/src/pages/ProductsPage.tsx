import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { searchProducts } from '../api/groceries';
import type { Product } from '../api/groceries';
import { ApiError } from '../api/client';

/**
 * Spec 036 (H1), plan.md §3: sustituye a `ProductPricesPage` — listado con
 * buscador (spec 034 H4 criterio 1, sin cambios) enlazando a
 * `ProductDetailPage` en vez de mostrar el resultado en la misma pantalla.
 */
export function ProductsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main>
      <h1>Productos</h1>
      <p>Entra en un producto para ver su precio en cada supermercado donde lo has comprado, o corregir su nombre.</p>

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
              <Link to={`/tickets/productos/${product.id}`}>{product.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
