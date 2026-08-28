import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../api/transactions';
import type { MovementType, PaymentMethod, Transaction } from '../api/transactions';
import { ApiError } from '../api/client';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Tarjeta',
  DIRECT_DEBIT: 'Recibo',
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    date: todayIso(),
    categoryId: '',
    subcategoryId: '',
    concept: '',
    merchant: '',
    amount: '',
    paymentMethod: '' as PaymentMethod | '',
  };
}

/**
 * H1/H2 (spec 002). Una sola página para ingresos y gastos, con un selector
 * de tipo, en vez de dos páginas casi idénticas — refleja el modelo unificado
 * del backend (`transactions`, discriminado por `type`) y evita duplicar el
 * formulario y el listado. Desviación deliberada de la redacción literal de
 * `tasks.md` T2.3 ("páginas de ingresos y gastos"), documentada aquí igual
 * que el panel de confirmación de borrado de cuenta (spec 001, H8, T8.3):
 * decisión de implementación de UI, no de alcance.
 */
export function MovementsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [type, setType] = useState<MovementType>('EXPENSE');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Filtros del listado (H1/H2 criterio 3).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('');
  const [q, setQ] = useState('');

  const [result, setResult] = useState<Awaited<ReturnType<typeof listTransactions>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario de creación/edición (H1/H2 criterios 1 y 2).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function reloadList() {
    const res = await listTransactions({
      type,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      categoryId: filterCategoryId || undefined,
      merchant: merchantFilter || undefined,
      q: q || undefined,
    });
    setResult(res);
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories(type);
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (!cancelled) setCategoriesError(err instanceof ApiError ? err.message : 'No se han podido cargar las categorías.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, type]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listTransactions({
          type,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          categoryId: filterCategoryId || undefined,
          merchant: merchantFilter || undefined,
          q: q || undefined,
        });
        if (!cancelled) setResult(res);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, type, dateFrom, dateTo, filterCategoryId, merchantFilter, q]);

  function startEdit(transaction: Transaction) {
    setFormError(null);
    setEditingId(transaction.id);
    setForm({
      date: transaction.date,
      categoryId: transaction.categoryId,
      subcategoryId: transaction.subcategoryId ?? '',
      concept: transaction.concept,
      merchant: transaction.merchant ?? '',
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      const payload = {
        date: form.date,
        categoryId: form.categoryId,
        subcategoryId: type === 'EXPENSE' && form.subcategoryId ? form.subcategoryId : undefined,
        concept: form.concept,
        merchant: type === 'EXPENSE' && form.merchant ? form.merchant : undefined,
        amount: form.amount,
        paymentMethod: type === 'EXPENSE' && form.paymentMethod ? form.paymentMethod : undefined,
      };
      if (editingId) {
        await updateTransaction(editingId, payload);
      } else {
        await createTransaction({ type, ...payload });
      }
      cancelEdit();
      await reloadList();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido guardar el movimiento.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteTransaction(id);
      if (editingId === id) cancelEdit();
      await reloadList();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el movimiento.');
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
        <h1>Ingresos y gastos</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const topLevelCategories = categories?.filter((c) => !c.parentId) ?? [];
  const subcategories = categories?.filter((c) => c.parentId === form.categoryId) ?? [];
  const categoryName = (id: string) => categories?.find((c) => c.id === id)?.name ?? id;

  return (
    <main>
      <h1>Ingresos y gastos</h1>

      <div role="radiogroup" aria-label="Tipo de movimiento">
        <label>
          <input
            type="radio"
            name="movement-type"
            value="EXPENSE"
            checked={type === 'EXPENSE'}
            onChange={() => {
              setType('EXPENSE');
              cancelEdit();
              setFilterCategoryId('');
            }}
          />
          Gastos
        </label>{' '}
        <label>
          <input
            type="radio"
            name="movement-type"
            value="INCOME"
            checked={type === 'INCOME'}
            onChange={() => {
              setType('INCOME');
              cancelEdit();
              setFilterCategoryId('');
            }}
          />
          Ingresos
        </label>
      </div>

      {categoriesError && <p role="alert">{categoriesError}</p>}

      <section>
        <h2>Filtros</h2>
        <div>
          <label htmlFor="dateFrom">Desde</label>
          <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="dateTo">Hasta</label>
          <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="filterCategoryId">Categoría</label>
          <select id="filterCategoryId" value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {topLevelCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {type === 'EXPENSE' && (
          <div>
            <label htmlFor="merchantFilter">Comercio</label>
            <input id="merchantFilter" type="text" value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="q">Buscar en el concepto</label>
          <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </section>

      {loadError && <p role="alert">{loadError}</p>}

      {result && (
        <section>
          <h2>Resumen {type === 'EXPENSE' ? 'de gastos' : 'de ingresos'}</h2>
          <p>
            Total: {result.summary.total} · Media mensual:{' '}
            {result.summary.averagePerMonth ?? 'sin datos'}
          </p>
          {result.summary.byCategory.length > 0 && (
            <ul>
              {result.summary.byCategory.map((entry) => (
                <li key={entry.categoryId}>
                  {categoryName(entry.categoryId)}: {entry.total}
                </li>
              ))}
            </ul>
          )}
          {/* H2 criterio 4 (spec.md §2): desglose también por subcategoría — solo
              hay subcategorías en gastos, así que en ingresos esta lista sale
              siempre vacía y no se muestra nada. */}
          {result.summary.bySubcategory.length > 0 && (
            <>
              <h3>Por subcategoría</h3>
              <ul>
                {result.summary.bySubcategory.map((entry) => (
                  <li key={entry.subcategoryId}>
                    {categoryName(entry.subcategoryId)}: {entry.total}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {deleteError && <p role="alert">{deleteError}</p>}

      <section>
        <h2>Movimientos</h2>
        {result && result.items.length === 0 && <p>No hay movimientos con estos filtros.</p>}
        {result && result.items.length > 0 && (
          <ul>
            {result.items.map((t) => (
              <li key={t.id}>
                <span>{t.date}</span> · <span>{categoryName(t.categoryId)}</span>
                {t.subcategoryId && <span> / {categoryName(t.subcategoryId)}</span>}
                {' · '}
                <span>{t.concept}</span> · <span>{t.amount}</span>
                {t.merchant && <span> · {t.merchant}</span>}
                {t.paymentMethod && <span> · {PAYMENT_METHOD_LABELS[t.paymentMethod]}</span>}
                {' · '}
                <button type="button" onClick={() => startEdit(t)}>
                  Editar
                </button>{' '}
                <button type="button" disabled={pendingDeleteId === t.id} onClick={() => void handleDelete(t.id)}>
                  {pendingDeleteId === t.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{editingId ? 'Editar movimiento' : `Registrar ${type === 'EXPENSE' ? 'gasto' : 'ingreso'}`}</h2>
        <form onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="date">Fecha</label>
            <input
              id="date"
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="categoryId">Categoría</label>
            <select
              id="categoryId"
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value, subcategoryId: '' })}
            >
              <option value="">— Selecciona —</option>
              {topLevelCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {type === 'EXPENSE' && subcategories.length > 0 && (
            <div>
              <label htmlFor="subcategoryId">Subcategoría (opcional)</label>
              <select
                id="subcategoryId"
                value={form.subcategoryId}
                onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })}
              >
                <option value="">— Ninguna —</option>
                {subcategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="concept">Concepto</label>
            <input
              id="concept"
              type="text"
              required
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
            />
          </div>

          {type === 'EXPENSE' && (
            <div>
              <label htmlFor="merchant">Comercio (opcional)</label>
              <input
                id="merchant"
                type="text"
                value={form.merchant}
                onChange={(e) => setForm({ ...form, merchant: e.target.value })}
              />
            </div>
          )}

          <div>
            <label htmlFor="amount">Importe</label>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>

          {type === 'EXPENSE' && (
            <div>
              <label htmlFor="paymentMethod">Tipo de pago (opcional)</label>
              <select
                id="paymentMethod"
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod | '' })}
              >
                <option value="">— Ninguno —</option>
                {(Object.entries(PAYMENT_METHOD_LABELS) as Array<[PaymentMethod, string]>).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formError && <p role="alert">{formError}</p>}

          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar'}
          </button>
          {editingId && (
            <button type="button" disabled={isSaving} onClick={cancelEdit}>
              Cancelar edición
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
