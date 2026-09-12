import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { getProductPrices, searchProducts } from '../api/groceries';
import type { Product, ProductPrice } from '../api/groceries';
import { ApiError } from '../api/client';

/** Spec 034 (H4 criterio 3), plan.md §11. El objetivo real de toda la spec: comparar precios entre supermercados. */
export function ProductPricesPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [prices, setPrices] = useState<ProductPrice[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchError(null);
    try {
      const found = await searchProducts(searchTerm || undefined);
      setResults(found);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'No se ha podido buscar el producto.');
    }
  }

  function selectProduct(product: Product) {
    setSelectedProduct(product);
    setPrices(null);
    setPricesError(null);
  }

  useEffect(() => {
    if (!selectedProduct) return;
    getProductPrices(selectedProduct.id)
      .then(setPrices)
      .catch((err) => setPricesError(err instanceof ApiError ? err.message : 'No se han podido cargar los precios.'));
  }, [selectedProduct]);

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
        <h1>Comparar precios</h1>
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
        <h1>Comparar precios</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Comparar precios</h1>
      <p>Busca un producto para ver su precio en cada supermercado donde lo has comprado, de más barato a más caro.</p>

      <form onSubmit={(e) => void handleSearch(e)}>
        <label htmlFor="product-search">Producto</label>
        <input id="product-search" type="text" className="input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button type="submit" className="btn btn-primary">
          Buscar
        </button>
      </form>

      {searchError && <p role="alert">{searchError}</p>}

      {results && results.length === 0 && <p>No se ha encontrado ningún producto con ese nombre.</p>}

      {results && results.length > 0 && (
        <ul>
          {results.map((product) => (
            <li key={product.id}>
              <button type="button" className="btn btn-ghost" onClick={() => selectProduct(product)}>
                {product.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedProduct && (
        <section>
          <h2>{selectedProduct.name}</h2>

          {pricesError && <p role="alert">{pricesError}</p>}

          {prices && prices.length === 0 && <p>Todavía no tienes ningún ticket con este producto.</p>}

          {prices && prices.length > 0 && (
            <table className="table">
              <caption>Precio por supermercado</caption>
              <thead>
                <tr>
                  <th scope="col">Supermercado</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Precio</th>
                  <th scope="col">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price, index) => (
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
        </section>
      )}
    </main>
  );
}
