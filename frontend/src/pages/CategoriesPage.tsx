import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../api/categories';
import type { Category, MovementType } from '../api/categories';
import { listTransactions } from '../api/transactions';
import { ApiError } from '../api/client';
import { getAllCachedCategories, getAllCachedTransactions, getMeta } from '../offline/db';
import { buildOfflineListResult } from '../offline/queries';
import { LAST_FULL_SYNC_AT_KEY } from '../offline/sync';
import { formatCurrency, lastDayOfMonth } from './home-shared';
import { CATEGORY_ICON_OPTIONS } from './category-icons';

// Valor del <select> para "que el backend lo infiera del nombre" — nunca un
// icono real (todos los de `CATEGORY_ICON_OPTIONS` son un único emoji).
const AUTO_ICON = '';
// Respaldo solo para el caso, no esperado contra el backend real (que
// siempre manda un icono resuelto), de un fixture de test o una respuesta
// antigua sin el campo — evita mostrar "undefined" en la tarjeta.
const FALLBACK_ICON = '🏷️';
function categoryIcon(category: Category): string {
  return category.icon || FALLBACK_ICON;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

interface CategoryMonthStats {
  totalExpense: number;
  byCategory: Map<string, { count: number; total: number }>;
}

export function CategoriesPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Spec 011 (modo offline), H3 criterio 3.
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Spec 010 (rediseño editorial), plan.md §4.2. "Nº de movimientos/importe/%"
  // de cada categoría de gasto no lo calcula ningún endpoint dedicado — se
  // deriva de `GET /transactions` (mismos filtros ya usados por
  // `MovementsListPage`/`HomePage`, sin inventar un endpoint nuevo). Si falla
  // o no hay datos, las tarjetas caen a "0 movimientos" / "0,00 €" / "0%" en
  // vez de mostrar un error — es un adorno de la tarjeta, no bloquea el resto
  // de la página (mismo criterio que el nombre de categoría en `HomePage`).
  const [monthStats, setMonthStats] = useState<CategoryMonthStats | null>(null);

  // Formulario de creación (H3 criterio 2).
  const [newType, setNewType] = useState<MovementType>('EXPENSE');
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [newIcon, setNewIcon] = useState(AUTO_ICON);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Editar (nombre e icono, una categoría a la vez).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingIcon, setEditingIcon] = useState(AUTO_ICON);
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
        // Spec 011 (modo offline), H3: sin conexión, se lee la copia local.
        const list = isOnline ? await listCategories() : await getAllCachedCategories();
        if (cancelled) return;
        setCategories(list);
        if (!isOnline) setLastSyncAt((await getMeta(LAST_FULL_SYNC_AT_KEY)) ?? null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las categorías.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const month = currentMonth();
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}`;
        // Límite máximo del endpoint (200, ver `ListTransactionsQueryDto`):
        // el nº de movimientos por categoría se cuenta sobre `items`, así
        // que en un mes con más de 200 gastos (caso extremo, no visto en la
        // app hoy) podría quedarse corto — el importe y el % no, porque
        // salen de `summary`, calculado sobre todo lo filtrado, no solo la
        // página (`transactions.service.ts`).
        const filters = { type: 'EXPENSE' as const, dateFrom, dateTo, limit: 200 };
        const result = isOnline
          ? await listTransactions(filters)
          : buildOfflineListResult(await getAllCachedTransactions(), filters);
        if (cancelled) return;
        const byCategory = new Map<string, { count: number; total: number }>();
        for (const t of result.items) {
          const entry = byCategory.get(t.categoryId) ?? { count: 0, total: 0 };
          entry.count += 1;
          byCategory.set(t.categoryId, entry);
        }
        for (const entry of result.summary.byCategory) {
          const existing = byCategory.get(entry.categoryId);
          const total = parseFloat(entry.total);
          if (existing) existing.total = total;
          else byCategory.set(entry.categoryId, { count: 0, total });
        }
        setMonthStats({ totalExpense: parseFloat(result.summary.total), byCategory });
      } catch {
        // Ver comentario del estado: adorno de la tarjeta, no bloquea nada.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);
    try {
      await createCategory({
        type: newType,
        name: newName,
        parentId: newType === 'EXPENSE' && newParentId ? newParentId : undefined,
        icon: newIcon || undefined,
      });
      setNewName('');
      setNewParentId('');
      setNewIcon(AUTO_ICON);
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
    // `category.icon` ya viene resuelto por el backend (nunca vacío) — se
    // preselecciona tal cual, no como "Automático", para que guardar sin
    // tocar el selector conserve el mismo icono que ya se veía.
    setEditingIcon(categoryIcon(category));
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setRenameError(null);
    setIsRenaming(true);
    try {
      await updateCategory(editingId, { name: editingName, icon: editingIcon });
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

  // Spec 010 (rediseño editorial), plan.md §4.2. Una tarjeta por categoría
  // de nivel superior (`.card.elev-sm`, cuadrícula de 3 columnas vía CSS en
  // `#categories-income-list`/`#categories-expense-list`); `showStats` solo
  // se activa para las de gasto — el handoff (`% del gasto total`, H4
  // criterio 1) no tiene equivalente de sentido para ingresos, y no se
  // inventa uno. Las subcategorías (solo existen en gasto) se muestran
  // dentro de la propia tarjeta del padre como `.tag-neutral`, en vez del
  // `<ul>` anidado de antes (mismo dato, presentación nueva).
  function renderCategory(category: Category, showStats = false) {
    const isEditing = editingId === category.id;
    const stats = monthStats?.byCategory.get(category.id);
    const count = stats?.count ?? 0;
    const total = stats?.total ?? 0;
    const percent = monthStats && monthStats.totalExpense > 0 ? Math.round((total / monthStats.totalExpense) * 100) : 0;
    const children = childrenOf(category.id);

    return (
      <li className="card elev-sm" key={category.id}>
        <div>
          <span className={`category-icon${category.type === 'INCOME' ? ' category-icon-accent' : ''}`} aria-hidden="true">
            {categoryIcon(category)}
          </span>{' '}
          <span className="card-title">{category.name}</span>
          {category.isDefault && <span className="card-body"> (por defecto)</span>}
        </div>

        {isEditing ? (
          <form onSubmit={handleRename}>
            <div className="field">
              <label htmlFor={`rename-${category.id}`}>Nuevo nombre</label>
              <input
                id={`rename-${category.id}`}
                type="text"
                className="input"
                required
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
              />
            </div>
            <div className="field">
              {/* "Nuevo icono" (no "Icono"), mismo motivo que "Nuevo nombre"
                  arriba: el formulario de creación, siempre visible, ya
                  tiene su propio campo "Icono" — un nombre distinto evita
                  dos controles con el mismo nombre accesible a la vez. */}
              <label htmlFor={`rename-icon-${category.id}`}>Nuevo icono</label>
              <select
                id={`rename-icon-${category.id}`}
                className="input"
                value={editingIcon}
                onChange={(e) => setEditingIcon(e.target.value)}
              >
                <option value={AUTO_ICON}>Automático (según el nombre)</option>
                {CATEGORY_ICON_OPTIONS.map(({ icon, label }) => (
                  <option key={icon} value={icon}>
                    {icon} {label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={isRenaming}>
              {isRenaming ? 'Guardando…' : 'Guardar'}
            </button>{' '}
            <button type="button" className="btn btn-secondary" disabled={isRenaming} onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </form>
        ) : (
          <>
            {showStats && (
              <>
                <p className="card-body">{count === 1 ? '1 movimiento' : `${count} movimientos`}</p>
                <p className="card-meta" style={{ justifyContent: 'space-between' }}>
                  <span>{formatCurrency(total.toFixed(2))}</span>
                  <span>{percent}%</span>
                </p>
              </>
            )}

            {children.length > 0 && (
              <div className="card-body">
                {children.map((child) => (
                  <span className="tag tag-neutral" key={child.id}>
                    {child.name}
                  </span>
                ))}
              </div>
            )}

            <div>
              <button type="button" className="btn btn-secondary" disabled={!isOnline} onClick={() => startRename(category)}>
                Renombrar
              </button>{' '}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!isOnline || pendingDeleteId === category.id}
                onClick={() => void handleDelete(category.id)}
              >
                {pendingDeleteId === category.id ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </>
        )}
        {renameError && isEditing && <p role="alert">{renameError}</p>}
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

      {!isOnline && (
        <p role="status">
          Sin conexión: mostrando los datos de la última sincronización{lastSyncAt ? ` (${new Date(lastSyncAt).toLocaleString('es-ES')})` : ''}.
          Crear, renombrar o eliminar categorías requiere conexión.
        </p>
      )}
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
            <p className="card-body">Cómo se reparte el gasto de este mes por categoría.</p>
            {expenseTopLevel.length === 0 ? (
              <p>No tienes categorías de gasto.</p>
            ) : (
              <ul id="categories-expense-list">{expenseTopLevel.map((c) => renderCategory(c, true))}</ul>
            )}
          </section>

          <section>
            <h2>Crear categoría</h2>
            <form onSubmit={handleCreate} noValidate>
              <div className="field">
                <label htmlFor="newType">Tipo</label>
                <select
                  id="newType"
                  className="input"
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

              <div className="field">
                <label htmlFor="newName">Nombre</label>
                <input
                  id="newName"
                  type="text"
                  className="input"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="newIcon">Icono</label>
                <select id="newIcon" className="input" value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
                  <option value={AUTO_ICON}>Automático (según el nombre)</option>
                  {CATEGORY_ICON_OPTIONS.map(({ icon, label }) => (
                    <option key={icon} value={icon}>
                      {icon} {label}
                    </option>
                  ))}
                </select>
              </div>

              {newType === 'EXPENSE' && (
                <div className="field">
                  <label htmlFor="newParentId">Categoría padre (opcional, para crear una subcategoría)</label>
                  <select id="newParentId" className="input" value={newParentId} onChange={(e) => setNewParentId(e.target.value)}>
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

              <button type="submit" className="btn btn-primary" disabled={isCreating || !isOnline}>
                {isCreating ? 'Creando…' : 'Crear categoría'}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
