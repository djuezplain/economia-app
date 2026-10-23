import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createShoppingList, deleteShoppingList, listShoppingLists } from '../api/shopping-lists';
import type { ShoppingListSummary } from '../api/shopping-lists';
import { ApiError } from '../api/client';

/** Spec 039, plan.md §5 (H1): listado de listas de la compra, crear y borrar. */
export function ShoppingListsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    listShoppingLists()
      .then(setLists)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se han podido cargar las listas de la compra.'));
  }, [isAuthenticated]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      const created = await createShoppingList(newName);
      setLists((current) => [{ ...created, itemCount: 0 }, ...(current ?? [])]);
      setNewName('');
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se ha podido crear la lista.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmDelete(id: string) {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteShoppingList(id);
      setLists((current) => (current ?? []).filter((list) => list.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido borrar la lista.');
    } finally {
      setIsDeleting(false);
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
        <h1>Cesta de la compra</h1>
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
        <h1>Cesta de la compra</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Cesta de la compra</h1>
      <p>Crea una lista con productos de tu catálogo y genera una simulación de en qué comercio te sale más barato comprarla.</p>

      <form onSubmit={(event) => void handleCreate(event)}>
        <label htmlFor="new-list-name">Nueva lista</label>{' '}
        <input id="new-list-name" type="text" value={newName} onChange={(event) => setNewName(event.target.value)} required />{' '}
        <button type="submit" className="btn btn-primary" disabled={isCreating}>
          {isCreating ? 'Creando…' : 'Crear lista'}
        </button>
      </form>
      {createError && <p role="alert">{createError}</p>}

      {error && <p role="alert">{error}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}

      {lists && lists.length === 0 && <p>Todavía no tienes ninguna lista de la compra.</p>}

      {lists && lists.length > 0 && (
        <table className="table">
          <caption>Tus listas</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Productos</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr key={list.id}>
                <td>
                  <Link to={`/tickets/cesta/${list.id}`}>{list.name}</Link>
                </td>
                <td>{list.itemCount}</td>
                <td>
                  {confirmDeleteId === list.id ? (
                    <>
                      ¿Seguro?{' '}
                      <button type="button" className="btn btn-ghost" disabled={isDeleting} onClick={() => void handleConfirmDelete(list.id)}>
                        {isDeleting ? 'Borrando…' : 'Sí, borrar'}
                      </button>{' '}
                      <button type="button" className="btn btn-ghost" disabled={isDeleting} onClick={() => setConfirmDeleteId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteId(list.id)}>
                      Borrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
