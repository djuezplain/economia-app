import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { addShoppingListItem, getShoppingList, removeShoppingListItem, renameShoppingList } from '../api/shopping-lists';
import type { ShoppingListDetail } from '../api/shopping-lists';
import { searchProducts } from '../api/groceries';
import type { Product } from '../api/groceries';
import { ApiError } from '../api/client';

/** Spec 039, plan.md §5 (H1): renombrar la lista y gestionar sus productos. */
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
        </>
      )}
    </main>
  );
}
