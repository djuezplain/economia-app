import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createCategory, deleteCategory, listCategories, renameCategory } from '../api/categories';
import type { Category, MovementType } from '../api/categories';
import { ApiError } from '../api/client';

export function CategoriesPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario de creación (H3 criterio 2).
  const [newType, setNewType] = useState<MovementType>('EXPENSE');
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Renombrar (solo una categoría a la vez).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Eliminar — el 409 (categoría en uso) se muestra tal cual lo explica el
  // backend, ver `CategoriesService.remove`.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const list = await listCategories();
    setCategories(list);
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories();
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las categorías.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      await createCategory({
        type: newType,
        name: newName,
        parentId: newType === 'EXPENSE' && newParentId ? newParentId : undefined,
      });
      setNewName('');
      setNewParentId('');
      await reload();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se ha podido crear la categoría.');
    } finally {
      setIsCreating(false);
    }
  }

  function startRename(category: Category) {
    setRenameError(null);
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setRenameError(null);
    setIsRenaming(true);
    try {
      await renameCategory(editingId, editingName);
      setEditingId(null);
      await reload();
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : 'No se ha podido renombrar la categoría.');
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteCategory(id);
      await reload();
    } catch (err) {
      // H3 (spec.md §5): un 409 (movimientos o subcategorías asociadas) se
      // muestra tal cual — el mensaje del backend ya explica qué hacer.
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la categoría.');
    } finally {
      setPendingDeleteId(null);
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
        <h1>Categorías</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const income = categories?.filter((c) => c.type === 'INCOME') ?? [];
  const expenseTopLevel = categories?.filter((c) => c.type === 'EXPENSE' && !c.parentId) ?? [];
  const childrenOf = (parentId: string) => categories?.filter((c) => c.parentId === parentId) ?? [];

  function renderCategory(category: Category) {
    const isEditing = editingId === category.id;
    return (
      <li key={category.id}>
        {isEditing ? (
          <form onSubmit={handleRename}>
            <label htmlFor={`rename-${category.id}`}>Nuevo nombre</label>
            <input
              id={`rename-${category.id}`}
              type="text"
              required
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
            />
            <button type="submit" disabled={isRenaming}>
              {isRenaming ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" disabled={isRenaming} onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </form>
        ) : (
          // Spec 009 (adaptación a móvil), plan.md §3.3 (H3). Nombre/badge y
          // acciones en dos <div> (posición, sin clase nueva) para poder
          // apilarlos en bloque bajo el breakpoint de móvil; en escritorio
          // el CSS los mantiene en línea, sin cambio visual (H3 criterio 3).
          <>
            <div>
              <span>{category.name}</span>
              {category.isDefault && <span> (por defecto)</span>}
            </div>
            <div>
              <button type="button" onClick={() => startRename(category)}>
                Renombrar
              </button>{' '}
              <button
                type="button"
                disabled={pendingDeleteId === category.id}
                onClick={() => void handleDelete(category.id)}
              >
                {pendingDeleteId === category.id ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </>
        )}
        {renameError && isEditing && <p role="alert">{renameError}</p>}

        {category.type === 'EXPENSE' && !category.parentId && childrenOf(category.id).length > 0 && (
          <ul>{childrenOf(category.id).map((child) => renderCategory(child))}</ul>
        )}
      </li>
    );
  }

  return (
    <main>
      <h1>Categorías</h1>
      <p>
        Estas categorías clasifican tus ingresos y gastos. Ya tienes disponibles las categorías iniciales; puedes
        renombrarlas, eliminarlas o crear las tuyas propias.
      </p>

      {loadError && <p role="alert">{loadError}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}

      {categories === null && !loadError && <p>Cargando categorías…</p>}

      {categories !== null && (
        <>
          <section>
            <h2>Ingresos</h2>
            {income.length === 0 ? (
              <p>No tienes categorías de ingreso.</p>
            ) : (
              <ul id="categories-income-list">{income.map((c) => renderCategory(c))}</ul>
            )}
          </section>

          <section>
            <h2>Gastos</h2>
            {expenseTopLevel.length === 0 ? (
              <p>No tienes categorías de gasto.</p>
            ) : (
              <ul id="categories-expense-list">{expenseTopLevel.map((c) => renderCategory(c))}</ul>
            )}
          </section>

          <section>
            <h2>Crear categoría</h2>
            <form onSubmit={handleCreate} noValidate>
              <div>
                <label htmlFor="newType">Tipo</label>
                <select
                  id="newType"
                  value={newType}
                  onChange={(e) => {
                    setNewType(e.target.value as MovementType);
                    setNewParentId('');
                  }}
                >
                  <option value="INCOME">Ingreso</option>
                  <option value="EXPENSE">Gasto</option>
                </select>
              </div>

              <div>
                <label htmlFor="newName">Nombre</label>
                <input id="newName" type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>

              {newType === 'EXPENSE' && (
                <div>
                  <label htmlFor="newParentId">Categoría padre (opcional, para crear una subcategoría)</label>
                  <select id="newParentId" value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
                    <option value="">— Ninguna (categoría de nivel superior) —</option>
                    {expenseTopLevel.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {createError && <p role="alert">{createError}</p>}

              <button type="submit" disabled={isCreating}>
                {isCreating ? 'Creando…' : 'Crear categoría'}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
