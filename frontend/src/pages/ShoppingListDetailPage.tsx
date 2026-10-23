import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { addShoppingListItem, getShoppingList, removeShoppingListItem, renameShoppingList } from '../api/shopping-lists';
import type { ShoppingListDetail } from '../api/shopping-lists';
import { getProductPrices, searchProducts } from '../api/groceries';
import type { Product } from '../api/groceries';
import { ApiError } from '../api/client';
import { computeBasketSimulation } from './basket-simulation.calculations';
import type { BasketSimulation, MixedOption, SingleSupermarketOption } from './basket-simulation.calculations';

/** Spec 039, plan.md §5 (H1-H2): renombrar la lista, gestionar sus productos y generar la simulación. */
export function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [list, setList] = useState<ShoppingListDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [simulation, setSimulation] = useState<BasketSimulation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  function loadList() {
    if (!id) return;
    getShoppingList(id)
      .then((detail) => {
        setList(detail);
        setName(detail.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se ha podido cargar la lista.'));
  }

  useEffect(() => {
    if (!isAuthenticated || !id) return;
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, id]);

  async function handleRename() {
    if (!id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await renameShoppingList(id, name);
      setList((current) => (current ? { ...current, name: updated.name } : current));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'No se ha podido guardar el nombre.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchError(null);
    try {
      const found = await searchProducts(searchTerm || undefined);
      const alreadyAddedIds = new Set((list?.items ?? []).map((item) => item.productId));
      setSearchResults(found.filter((product) => !alreadyAddedIds.has(product.id)));
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'No se han podido buscar productos.');
    }
  }

  async function handleAddProduct(productId: string) {
    if (!id) return;
    setAddError(null);
    setAddingProductId(productId);
    try {
      const item = await addShoppingListItem(id, productId);
      setList((current) => (current ? { ...current, items: [...current.items, item].sort((a, b) => a.productName.localeCompare(b.productName)) } : current));
      setSearchResults((current) => (current ? current.filter((product) => product.id !== productId) : current));
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'No se ha podido añadir el producto.');
    } finally {
      setAddingProductId(null);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!id) return;
    setRemoveError(null);
    setRemovingItemId(itemId);
    try {
      await removeShoppingListItem(id, itemId);
      setList((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== itemId) } : current));
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'No se ha podido quitar el producto.');
    } finally {
      setRemovingItemId(null);
    }
  }

  /** H2 criterio 8: se recalcula al vuelo con los precios más recientes disponibles en ese momento, sin guardar histórico. */
  async function handleGenerate() {
    if (!list || list.items.length === 0) return;
    setGenerateError(null);
    setIsGenerating(true);
    try {
      const prices = await Promise.all(list.items.map((item) => getProductPrices(item.productId)));
      setSimulation(
        computeBasketSimulation(list.items.map((item, index) => ({ productId: item.productId, productName: item.productName, prices: prices[index] }))),
      );
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'No se ha podido generar la simulación.');
    } finally {
      setIsGenerating(false);
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
        <h1>Lista de la compra</h1>
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
        <h1>Lista de la compra</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link to="/tickets/cesta">Volver a tus listas</Link>
      </p>

      {error && <p role="alert">{error}</p>}

      {list && (
        <>
          <h1>{list.name}</h1>

          <div className="field">
            <label htmlFor="list-name">Nombre</label>
            <input id="list-name" type="text" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {saveError && <p role="alert">{saveError}</p>}
          <button type="button" className="btn btn-primary" disabled={isSaving || name.trim() === ''} onClick={() => void handleRename()}>
            {isSaving ? 'Guardando…' : 'Guardar nombre'}
          </button>

          <h2>Productos</h2>
          {removeError && <p role="alert">{removeError}</p>}
          {list.items.length === 0 && <p>Todavía no has añadido ningún producto a esta lista.</p>}
          {list.items.length > 0 && (
            <ul>
              {list.items.map((item) => (
                <li key={item.id}>
                  {item.productName}{' '}
                  <button type="button" className="btn btn-ghost" disabled={removingItemId === item.id} onClick={() => void handleRemoveItem(item.id)}>
                    {removingItemId === item.id ? 'Quitando…' : 'Quitar'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2>Añadir un producto</h2>
          <form onSubmit={(event) => void handleSearch(event)}>
            <label htmlFor="product-search">Buscar</label>{' '}
            <input id="product-search" type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />{' '}
            <button type="submit" className="btn btn-secondary">
              Buscar
            </button>
          </form>
          {searchError && <p role="alert">{searchError}</p>}
          {addError && <p role="alert">{addError}</p>}
          {searchResults && searchResults.length === 0 && <p>Sin productos que añadir con ese criterio.</p>}
          {searchResults && searchResults.length > 0 && (
            <ul>
              {searchResults.map((product) => (
                <li key={product.id}>
                  {product.name}{' '}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={addingProductId === product.id}
                    onClick={() => void handleAddProduct(product.id)}
                  >
                    {addingProductId === product.id ? 'Añadiendo…' : 'Añadir'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2>Simulación</h2>
          <button type="button" className="btn btn-primary" disabled={isGenerating || list.items.length === 0} onClick={() => void handleGenerate()}>
            {isGenerating ? 'Generando…' : 'Generar'}
          </button>
          {generateError && <p role="alert">{generateError}</p>}

          {simulation && (
            <>
              {simulation.missingProducts.length > 0 && (
                <p role="status">
                  Sin datos de precio para: {simulation.missingProducts.map((product) => product.productName).join(', ')}. No cuentan en los
                  totales.
                </p>
              )}
              {simulation.cheapestMixed === null && (
                <p role="status">No hay suficiente información para simular: ningún producto de la lista tiene precio en ningún ticket.</p>
              )}
              {simulation.cheapestMixed !== null && !simulation.cheapestSingle && (
                <p role="status">Ningún comercio tiene precio de todos los productos con datos.</p>
              )}

              {simulation.cheapestSingle && <SingleOptionSection title="Más barato (cesta única)" option={simulation.cheapestSingle} />}
              {simulation.mostExpensiveSingle && <SingleOptionSection title="Más caro (cesta única)" option={simulation.mostExpensiveSingle} />}
              {simulation.cheapestMixed && (
                <MixedOptionSection
                  title="Opción mixta más barata"
                  option={simulation.cheapestMixed}
                  savingsVsTotal={simulation.cheapestSingle?.total}
                  savingsVsLabel="la cesta única más barata"
                />
              )}
              {simulation.fewestStoresMixed && (
                <MixedOptionSection
                  title="Opción mixta con menos comercios"
                  option={simulation.fewestStoresMixed}
                  diffVsTotal={simulation.cheapestMixed?.total}
                  diffVsLabel="la opción mixta más barata"
                />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function SingleOptionSection({ title, option }: { title: string; option: SingleSupermarketOption }) {
  return (
    <>
      <h3>
        {title}: {option.supermarketName} — {option.total} €
      </h3>
      <BasketLinesTable lines={option.lines} showSupermarket={false} />
    </>
  );
}

/**
 * H2 criterios 3-4: la mixta más barata muestra el ahorro (importe y %) frente al total pasado
 * en `savingsVsTotal` (la cesta única más barata); la mixta con menos comercios muestra la
 * diferencia frente a `diffVsTotal` (la mixta más barata) — nunca las dos a la vez.
 */
function MixedOptionSection({
  title,
  option,
  savingsVsTotal,
  savingsVsLabel,
  diffVsTotal,
  diffVsLabel,
}: {
  title: string;
  option: MixedOption;
  savingsVsTotal?: string;
  savingsVsLabel?: string;
  diffVsTotal?: string;
  diffVsLabel?: string;
}) {
  const savings = savingsVsTotal !== undefined ? parseFloat(savingsVsTotal) - parseFloat(option.total) : null;
  const diff = diffVsTotal !== undefined ? parseFloat(option.total) - parseFloat(diffVsTotal) : null;

  return (
    <>
      <h3>
        {title}: {option.total} € en {option.storeCount} comercio{option.storeCount === 1 ? '' : 's'}
      </h3>
      {savings !== null && savingsVsLabel && (
        <p>
          Ahorras {savings.toFixed(2)} € ({parseFloat(savingsVsTotal!) > 0 ? ((savings / parseFloat(savingsVsTotal!)) * 100).toFixed(1) : '0.0'}%) frente
          a {savingsVsLabel}.
        </p>
      )}
      {diff !== null && diffVsLabel && (
        <p>{diff > 0 ? `Cuesta ${diff.toFixed(2)} € más que ${diffVsLabel}.` : `Mismo precio que ${diffVsLabel}.`}</p>
      )}
      <BasketLinesTable lines={option.lines} showSupermarket />
    </>
  );
}

function BasketLinesTable({ lines, showSupermarket }: { lines: { productId: string; productName: string; supermarketName: string; pricePerUnit: string }[]; showSupermarket: boolean }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Producto</th>
          {showSupermarket && <th scope="col">Comercio</th>}
          <th scope="col">Precio/unidad</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.productId}>
            <td>{line.productName}</td>
            {showSupermarket && <td>{line.supermarketName}</td>}
            <td>{line.pricePerUnit} €</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
