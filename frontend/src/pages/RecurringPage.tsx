import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useCategoriesForType } from '../hooks/useCategoriesForType';
import {
  createRecurring,
  deleteRecurring,
  getReconciliationOverview,
  listOccurrences,
  listRecurring,
  updateRecurring,
} from '../api/recurring-transactions';
import type { Occurrence, ReconciliationOverview, RecurringFrequency, RecurringTransaction } from '../api/recurring-transactions';
import type { MovementType, PaymentMethod } from '../api/transactions';
import { ApiError } from '../api/client';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { ReconciliationPanel } from '../components/ReconciliationPanel';
import { categoryIcon, categoryName, PAYMENT_METHOD_LABELS, todayIso } from './movements-shared';
import { formatCurrency } from './home-shared';
import { describeRecurrence, FREQUENCY_LABELS } from './recurring-shared';

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    categoryId: '',
    subcategoryId: '',
    concept: '',
    merchant: '',
    amount: '',
    paymentMethod: '' as PaymentMethod | '',
    frequency: 'MONTHLY' as RecurringFrequency,
    startDate: todayIso(),
    endDate: '',
    variableAmount: false,
  };
}

/**
 * Spec 047 (H1/H3). Plantillas de movimientos recurrentes (mensuales o
 * anuales) y las ocurrencias pendientes de confirmar. Editar una plantilla
 * solo afecta a las ocurrencias futuras: los movimientos ya confirmados son
 * copias independientes.
 */
export function RecurringPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [type, setType] = useState<MovementType>('EXPENSE');
  const { categories } = useCategoriesForType(type);
  // Para el nombre/icono de las plantillas de cualquier tipo en el listado.
  const { categories: otherCategories } = useCategoriesForType(type === 'EXPENSE' ? 'INCOME' : 'EXPENSE');
  const allCategories = categories || otherCategories ? [...(categories ?? []), ...(otherCategories ?? [])] : null;

  const [templates, setTemplates] = useState<RecurringTransaction[] | null>(null);
  const [pending, setPending] = useState<Occurrence[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const today = todayIso();
      const [list, occurrences] = await Promise.all([
        listRecurring(),
        // Vencidas de los últimos ~10 meses y previstas del próximo mes.
        listOccurrences(shiftDays(today, -300), shiftDays(today, 30)),
      ]);
      setTemplates(list);
      setPending(occurrences.filter((o) => o.status === 'PENDING' || o.status === 'OVERDUE'));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los movimientos recurrentes.');
    }
    // Spec 049 H3: aparte, para que un fallo aquí no impida ver plantillas y pendientes.
    try {
      setReconciliation(await getReconciliationOverview());
    } catch {
      setReconciliation(null);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void reload();
  }, [isAuthenticated, reload]);

  function startCreate() {
    setEditingId(null);
    setType('EXPENSE');
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function startEdit(t: RecurringTransaction) {
    setEditingId(t.id);
    setType(t.type);
    setForm({
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId ?? '',
      concept: t.concept,
      merchant: t.merchant ?? '',
      amount: t.amount,
      paymentMethod: t.paymentMethod ?? '',
      frequency: t.frequency,
      startDate: t.startDate,
      endDate: t.endDate ?? '',
      variableAmount: t.variableAmount,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      const isExpense = type === 'EXPENSE';
      const common = {
        categoryId: form.categoryId,
        subcategoryId: isExpense && form.subcategoryId ? form.subcategoryId : undefined,
        concept: form.concept,
        merchant: isExpense && form.merchant ? form.merchant : undefined,
        amount: form.amount,
        paymentMethod: isExpense && form.paymentMethod ? form.paymentMethod : undefined,
        frequency: form.frequency,
        startDate: form.startDate,
        variableAmount: form.variableAmount,
      };
      if (editingId) {
        await updateRecurring(editingId, { ...common, endDate: form.endDate || null });
      } else {
        await createRecurring({ type, ...common, endDate: form.endDate || undefined });
      }
      setShowForm(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se ha podido guardar el movimiento recurrente.');
    } finally {
      setIsSaving(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
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
        <h1>Recurrentes</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const topLevelCategories = categories?.filter((c) => !c.parentId) ?? [];
  const subcategories = categories?.filter((c) => c.parentId === form.categoryId) ?? [];

  return (
    <main>
      <h1>Recurrentes</h1>
      <p className="card-meta">
        Define ingresos y gastos que se repiten. Nada se crea solo: cada ocurrencia se confirma a mano y solo entonces cuenta en tus movimientos.
      </p>

      {loadError && <p role="alert">{loadError}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      {reconciliation && <ReconciliationPanel overview={reconciliation} onChanged={() => void reload()} />}

      <section aria-label="Pendientes de confirmar">
        <h2>Pendientes de confirmar</h2>
        {templates && pending.length === 0 && <p>No hay ocurrencias pendientes en los próximos 30 días.</p>}
        {pending.length > 0 && (
          <ul id="recurring-pending">
            {pending.map((o) => (
              <OccurrenceRow key={`${o.recurringId}|${o.date}`} occurrence={o} categories={allCategories} showDate onResolved={() => void reload()} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Plantillas">
        <h2>Plantillas</h2>
        {!showForm && (
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            + Nuevo recurrente
          </button>
        )}

        {showForm && (
          <form className="card" onSubmit={handleSubmit} noValidate aria-label={editingId ? 'Editar recurrente' : 'Nuevo recurrente'}>
            {!editingId && (
              <div className="seg" role="radiogroup" aria-label="Tipo de movimiento">
                {(['EXPENSE', 'INCOME'] as const).map((value) => (
                  <label className="seg-opt" key={value}>
                    <input
                      type="radio"
                      name="recurring-type"
                      value={value}
                      checked={type === value}
                      onChange={() => {
                        setType(value);
                        setForm((f) => ({ ...f, categoryId: '', subcategoryId: '', merchant: '', paymentMethod: '' }));
                      }}
                    />
                    {value === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                  </label>
                ))}
              </div>
            )}

            <div className="field">
              <label htmlFor="rec-concept">Concepto</label>
              <input id="rec-concept" className="input" type="text" required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="rec-category">Categoría</label>
              <select
                id="rec-category"
                className="input"
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
              <div className="field">
                <label htmlFor="rec-subcategory">Subcategoría (opcional)</label>
                <select id="rec-subcategory" className="input" value={form.subcategoryId} onChange={(e) => setForm({ ...form, subcategoryId: e.target.value })}>
                  <option value="">— Ninguna —</option>
                  {subcategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {type === 'EXPENSE' && (
              <div className="field">
                <label htmlFor="rec-merchant">Comercio (opcional)</label>
                <input id="rec-merchant" className="input" type="text" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label htmlFor="rec-amount">Importe</label>
              <input
                id="rec-amount"
                className="input"
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="rec-variable">
                <input
                  id="rec-variable"
                  type="checkbox"
                  checked={form.variableAmount}
                  onChange={(e) => setForm({ ...form, variableAmount: e.target.checked })}
                />{' '}
                Importe variable
              </label>
              {form.variableAmount && (
                <p className="card-meta">
                  Para recibos que cambian cada vez (luz, agua…). El importe indicado se usa hasta que haya recibos reales; después, la
                  previsión es la media de los 3 últimos.
                </p>
              )}
            </div>
            {type === 'EXPENSE' && (
              <div className="field">
                <label htmlFor="rec-payment">Tipo de pago (opcional)</label>
                <select id="rec-payment" className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod | '' })}>
                  <option value="">— Ninguno —</option>
                  {(Object.entries(PAYMENT_METHOD_LABELS) as Array<[PaymentMethod, string]>).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="rec-frequency">Frecuencia</label>
              <select id="rec-frequency" className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RecurringFrequency })}>
                {(Object.entries(FREQUENCY_LABELS) as Array<[RecurringFrequency, string]>).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rec-start">Primera fecha</label>
              <input id="rec-start" className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="rec-end">Hasta (opcional)</label>
              <input id="rec-end" className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>

            {formError && <p role="alert">{formError}</p>}
            <div>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear'}
              </button>{' '}
              <button type="button" className="btn" disabled={isSaving} onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        {templates && templates.length === 0 && !showForm && <p>Todavía no tienes movimientos recurrentes.</p>}
        {templates && templates.length > 0 && (
          <ul id="recurring-list">
            {templates.map((t) => (
              <li className="card card-row" key={t.id}>
                <div>
                  <span className={`category-icon${t.type === 'INCOME' ? ' category-icon-accent' : ''}`} aria-hidden="true">
                    {categoryIcon(allCategories, t.categoryId)}
                  </span>{' '}
                  <strong>{t.concept}</strong> <span className="tag tag-neutral">{categoryName(allCategories, t.categoryId)}</span>
                  {t.variableAmount && <span className="tag tag-neutral">importe variable</span>}
                  {!t.active && <span className="tag tag-accent">en pausa</span>}
                  <p className="card-meta">
                    {describeRecurrence(t.frequency, t.startDate)}
                    {t.endDate ? ` · hasta ${t.endDate}` : ''}
                  </p>
                  <p className="card-meta">
                    <span className={t.type === 'INCOME' ? 'cal-income' : 'cal-expense'}>
                      {t.type === 'INCOME' ? '+' : '−'}
                      {formatCurrency(t.amount)}
                    </span>
                  </p>
                </div>
                <div>
                  <button type="button" className="btn" onClick={() => startEdit(t)}>
                    Editar
                  </button>{' '}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => runAction(() => updateRecurring(t.id, { active: !t.active }), 'No se ha podido cambiar el estado.')}
                  >
                    {t.active ? 'Pausar' : 'Reanudar'}
                  </button>{' '}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar "${t.concept}"? Los movimientos ya confirmados no se borran.`)) {
                        void runAction(() => deleteRecurring(t.id), 'No se ha podido eliminar el movimiento recurrente.');
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
