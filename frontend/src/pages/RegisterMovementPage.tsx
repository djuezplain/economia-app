import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useCategoriesForType } from '../hooks/useCategoriesForType';
import { createTransaction, getTransaction, updateTransaction } from '../api/transactions';
import type { MovementType, PaymentMethod } from '../api/transactions';
import { ApiError } from '../api/client';
import { emptyForm, PAYMENT_METHOD_LABELS } from './movements-shared';

/**
 * Spec 006 (páginas de movimientos), H1 criterio 3 / H3. Solo el formulario
 * de alta o edición — sin resumen ni listado. Sirve los dos modos (plan.md
 * §1): sin `:id` en la URL es alta; con `:id`, edición — carga el movimiento
 * con `getTransaction` (no se pasa por `navigate(..., { state })`, para que
 * funcione igual tras recargar la página o al llegar por un enlace directo,
 * plan.md §3).
 */
export function RegisterMovementPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [type, setType] = useState<MovementType>('EXPENSE');
  const { categories } = useCategoriesForType(type);

  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isLoadingTransaction, setIsLoadingTransaction] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string | null>(null);

  // Carga el movimiento a editar (H3 criterio 1). Al resolver, `type` se
  // actualiza con el real del movimiento — `useCategoriesForType` vuelve a
  // pedir las categorías de ese tipo automáticamente (mismo mecanismo que
  // ya usa cuando el usuario cambia el selector en modo alta).
  useEffect(() => {
    if (!isAuthenticated || !id) return;
    let cancelled = false;
    setIsLoadingTransaction(true);
    (async () => {
      try {
        const transaction = await getTransaction(id);
        if (cancelled) return;
        setType(transaction.type);
        setForm({
          date: transaction.date,
          categoryId: transaction.categoryId,
          subcategoryId: transaction.subcategoryId ?? '',
          concept: transaction.concept,
          merchant: transaction.merchant ?? '',
          amount: transaction.amount,
          paymentMethod: transaction.paymentMethod ?? '',
        });
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el movimiento.');
      } finally {
        if (!cancelled) setIsLoadingTransaction(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, id]);

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
      if (id) {
        await updateTransaction(id, payload);
      } else {
        await createTransaction({ type, ...payload });
      }
      // H3 criterio 2: vuelve a "Movimientos", el sitio natural donde se
      // iba a editar (o donde tiene sentido ver el recién creado).
      navigate('/movements');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido guardar el movimiento.');
    } finally {
      setIsSaving(false);
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
        <h1>Registrar</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  if (id && isLoadingTransaction) {
    return (
      <main>
        <h1>Editar movimiento</h1>
        <p>Cargando…</p>
      </main>
    );
  }

  if (id && loadError) {
    return (
      <main>
        <h1>Editar movimiento</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }

  const topLevelCategories = categories?.filter((c) => !c.parentId) ?? [];
  const subcategories = categories?.filter((c) => c.parentId === form.categoryId) ?? [];

  return (
    <main>
      {/* H3 criterio 3: modo edición y modo alta se distinguen por el
          título — igual que ya hacía `MovementsPage` (spec 002). */}
      <h1>{id ? 'Editar movimiento' : `Registrar ${type === 'EXPENSE' ? 'gasto' : 'ingreso'}`}</h1>

      {/* El tipo no es editable una vez creado el movimiento (mismo
          criterio que el backend, `UpdateTransactionInput` no admite
          `type`) — el selector solo tiene sentido en modo alta. */}
      {!id && (
        <div role="radiogroup" aria-label="Tipo de movimiento">
          <label>
            <input
              type="radio"
              name="movement-type"
              value="EXPENSE"
              checked={type === 'EXPENSE'}
              onChange={() => {
                setType('EXPENSE');
                setForm(emptyForm());
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
                setForm(emptyForm());
              }}
            />
            Ingresos
          </label>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="date">Fecha</label>
          <input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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
          <input id="concept" type="text" required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
        </div>

        {type === 'EXPENSE' && (
          <div>
            <label htmlFor="merchant">Comercio (opcional)</label>
            <input id="merchant" type="text" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
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
          {isSaving ? 'Guardando…' : id ? 'Guardar cambios' : 'Registrar'}
        </button>
        {id && (
          <button type="button" disabled={isSaving} onClick={() => navigate('/movements')}>
            Cancelar edición
          </button>
        )}
      </form>
    </main>
  );
}
