import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createProduct, listSupermarkets, mergeProducts, searchProducts } from '../api/groceries';
import type { Product, Supermarket } from '../api/groceries';
import { ApiError } from '../api/client';
import { confirmReceiptImport } from '../api/receipt-import';
import type { ReceiptUnit } from '../api/receipt-import';
import { NEW_OPTION_VALUE } from '../components/receipt-line.types';

/**
 * Spec 036 (H1), plan.md §3: sustituye a `ProductPricesPage` — listado con
 * buscador (spec 034 H4 criterio 1, sin cambios) enlazando a
 * `ProductDetailPage` en vez de mostrar el resultado en la misma pantalla.
 *
 * Spec 038 (H1): selección múltiple + fusión — dos o más productos que en
 * realidad son el mismo (p. ej. duplicados por un ticket mal emparejado) se
 * marcan y se fusionan en uno solo, eligiendo cuál de ellos sobrevive.
 *
 * Spec 041 (H1): crear un producto nuevo, con un precio inicial opcional
 * (supermercado + fecha + precio) que se guarda como un ticket sintético
 * (plan.md §2-§3) — así aparece igual que cualquier precio real en el resto
 * de la app, sin lógica especial en ningún sitio.
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

  const [supermarkets, setSupermarkets] = useState<Supermarket[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [priceSupermarketId, setPriceSupermarketId] = useState('');
  const [priceSupermarketName, setPriceSupermarketName] = useState('');
  const [priceDate, setPriceDate] = useState('');
  const [priceUnit, setPriceUnit] = useState<ReceiptUnit>('unidad');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [priceWarning, setPriceWarning] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    searchProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar los productos.'));
    void listSupermarkets().then(setSupermarkets);
  }, [isAuthenticated]);

  function resetPriceFields() {
    setPriceSupermarketId('');
    setPriceSupermarketName('');
    setPriceDate('');
    setPriceUnit('unidad');
    setPricePerUnit('');
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setPriceWarning(null);

    const hasSupermarket = Boolean(priceSupermarketId || priceSupermarketName);
    const filledPriceFields = [hasSupermarket, Boolean(priceDate), Boolean(pricePerUnit)].filter(Boolean).length;
    if (filledPriceFields > 0 && filledPriceFields < 3) {
      setCreateError('Para añadir un precio inicial, completa el supermercado, la fecha y el precio — o déjalos los tres vacíos.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createProduct(newProductName);
      setProducts((current) => [...(current ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewProductName('');

      if (filledPriceFields === 3) {
        try {
          await confirmReceiptImport({
            supermarket: priceSupermarketId ? { id: priceSupermarketId } : { name: priceSupermarketName },
            date: priceDate,
            lines: [
              {
                description: created.name,
                quantity: '1',
                unit: priceUnit,
                pricePerUnit,
                amount: pricePerUnit,
                product: { id: created.id },
              },
            ],
          });
          resetPriceFields();
        } catch (err) {
          setPriceWarning(
            `El producto «${created.name}» se ha creado, pero no se ha podido guardar el precio inicial: ${err instanceof ApiError ? err.message : 'error desconocido'}.`,
          );
        }
      }
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se ha podido crear el producto.');
    } finally {
      setIsCreating(false);
    }
  }

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

      <details className="dashboard-section">
        <summary>
          <h2>Crear producto</h2>
        </summary>
        <form onSubmit={(e) => void handleCreateProduct(e)}>
          <div className="field">
            <label htmlFor="new-product-name">Nombre</label>
            <input
              id="new-product-name"
              type="text"
              className="input"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              required
            />
          </div>

          <p>Precio inicial (opcional)</p>
          <div className="field">
            <label htmlFor="price-supermarket">Supermercado</label>
            <select
              id="price-supermarket"
              className="input"
              value={priceSupermarketId}
              onChange={(e) => setPriceSupermarketId(e.target.value)}
            >
              <option value={NEW_OPTION_VALUE}>+ Nuevo supermercado</option>
              {supermarkets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!priceSupermarketId && (
              <input
                type="text"
                className="input"
                aria-label="Nombre del nuevo supermercado"
                value={priceSupermarketName}
                onChange={(e) => setPriceSupermarketName(e.target.value)}
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="price-date">Fecha</label>
            <input id="price-date" type="date" className="input" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="price-unit">Unidad</label>
            <select id="price-unit" className="input" value={priceUnit} onChange={(e) => setPriceUnit(e.target.value as ReceiptUnit)}>
              <option value="unidad">Unidad</option>
              <option value="kg">Kg</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="price-per-unit">Precio por unidad</label>
            <input
              id="price-per-unit"
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
            />
          </div>

          {createError && <p role="alert">{createError}</p>}
          {priceWarning && <p role="alert">{priceWarning}</p>}

          <button type="submit" className="btn btn-primary" disabled={isCreating || newProductName.trim() === ''}>
            {isCreating ? 'Creando…' : 'Crear producto'}
          </button>
        </form>
      </details>

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
              </label>{' '}
              {product.lowestRecentPrice ? (
                <span>
                  {product.lowestRecentPrice.pricePerUnit} € ({product.lowestRecentPrice.supermarketName})
                </span>
              ) : (
                <span>—</span>
              )}
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
