import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { listCategories } from '../api/categories';
import type { Category } from '../api/categories';
import { createSavingsGoal, deleteSavingsGoal, listSavingsGoals, updateSavingsGoal } from '../api/savings-goals';
import type { GoalPeriod, SavingsGoal, TargetType } from '../api/savings-goals';
import { createExpenseBudget, deleteExpenseBudget, listExpenseBudgets, updateExpenseBudget } from '../api/expense-budgets';
import type { ExpenseBudget } from '../api/expense-budgets';
import { getMonthProgress, getYearProgress } from '../api/goals-progress';
import type { BudgetProgress, GoalProgress, MonthProgress, ProgressStatus, YearProgress } from '../api/goals-progress';
import { ApiError } from '../api/client';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return todayIso().slice(0, 7);
}

function currentYear(): string {
  return todayIso().slice(0, 4);
}

// H4 criterio 2 (spec.md): el estado del progreso lo calcula el backend de
// forma neutral (`resolveProgressStatus`) — aquí se traduce a la etiqueta
// correcta según si es un objetivo de ahorro (superarlo es bueno) o un
// presupuesto de gasto (superarlo es malo).
function savingsStatusLabel(status: ProgressStatus): string {
  switch (status) {
    case 'AT_OR_ABOVE_TARGET':
      return 'cumplido';
    case 'NEAR_THRESHOLD':
      return 'cerca de conseguirlo';
    default:
      return 'por debajo del umbral de aviso';
  }
}

function budgetStatusLabel(status: ProgressStatus): string {
  switch (status) {
    case 'AT_OR_ABOVE_TARGET':
      return 'superado';
    case 'NEAR_THRESHOLD':
      return 'cerca del límite';
    default:
      return 'dentro de lo previsto';
  }
}

interface GoalFormState {
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
}

const EMPTY_FORM: GoalFormState = { targetType: 'AMOUNT', targetValue: '', alertThresholdPercent: '80.00' };

function goalFormFromEntity(entity: { targetType: TargetType; targetValue: string; alertThresholdPercent: string } | undefined): GoalFormState {
  if (!entity) return EMPTY_FORM;
  return { targetType: entity.targetType, targetValue: entity.targetValue, alertThresholdPercent: entity.alertThresholdPercent };
}

/** Los tres campos comunes a un objetivo de ahorro y a un presupuesto de gasto (mismo `targetType`/`targetValue`/`alertThresholdPercent`, plan.md §5). */
function GoalFormFields({
  idPrefix,
  form,
  onChange,
}: {
  idPrefix: string;
  form: GoalFormState;
  onChange: (form: GoalFormState) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-targetType`}>Tipo de objetivo</label>
        <select
          id={`${idPrefix}-targetType`}
          value={form.targetType}
          onChange={(e) => onChange({ ...form, targetType: e.target.value as TargetType })}
        >
          <option value="AMOUNT">Importe fijo</option>
          <option value="PERCENT">% de los ingresos del periodo</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-targetValue`}>{form.targetType === 'AMOUNT' ? 'Importe objetivo' : '% objetivo'}</label>
        <input
          id={`${idPrefix}-targetValue`}
          type="text"
          inputMode="decimal"
          required
          placeholder={form.targetType === 'AMOUNT' ? '0.00' : '0-100'}
          value={form.targetValue}
          onChange={(e) => onChange({ ...form, targetValue: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-alertThresholdPercent`}>Umbral de aviso (%)</label>
        <input
          id={`${idPrefix}-alertThresholdPercent`}
          type="text"
          inputMode="decimal"
          required
          placeholder="80.00"
          value={form.alertThresholdPercent}
          onChange={(e) => onChange({ ...form, alertThresholdPercent: e.target.value })}
        />
      </div>
    </>
  );
}

/** H3/H4: progreso de un objetivo/presupuesto en texto plano (sin barra de progreso, plan.md §7). */
function GoalProgressSummary({ progress, statusLabel }: { progress: GoalProgress; statusLabel: (status: ProgressStatus) => string }) {
  return (
    <ul>
      <li>Importe objetivo: {progress.targetAmount ?? 'sin datos (sin ingresos en este periodo)'}</li>
      <li>Real: {progress.actualAmount}</li>
      <li>Desviación: {progress.deviation ?? 'sin datos'}</li>
      <li>% alcanzado: {progress.progressPercent === null ? 'sin datos' : `${progress.progressPercent}%`}</li>
      <li>Proyección de cierre del periodo: {progress.projectedAmount ?? 'sin proyección (periodo cerrado o sin datos)'}</li>
      <li>Estado: {statusLabel(progress.status)}</li>
    </ul>
  );
}

function budgetProgressCellText(progress: BudgetProgress | null | undefined): string {
  if (!progress) return 'cargando…';
  const target = progress.targetAmount ?? 'sin datos';
  const percent = progress.progressPercent === null ? 'sin datos' : `${progress.progressPercent}%`;
  return `${progress.actualAmount} de ${target} (${percent}) · ${budgetStatusLabel(progress.status)}`;
}

/**
 * H1-H4 (spec 004). Una sola página: objetivo de ahorro (mensual + anual,
 * cada uno con su progreso del periodo en curso o consultado) y
 * presupuestos de gasto (global + por categoría, progreso del mes
 * consultado). Mismo criterio del resto de la app: HTML semántico plano,
 * sin gráficos ni componente de "barra de progreso" (plan.md §7) — el
 * progreso se expresa en texto/tabla. Nombres de categoría resueltos en el
 * cliente contra `/categories`, igual que `DashboardPage`.
 */
export function GoalsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[] | null>(null);
  const [expenseBudgets, setExpenseBudgets] = useState<ExpenseBudget[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [month, setMonth] = useState(currentMonth());
  const [monthProgress, setMonthProgress] = useState<MonthProgress | null>(null);
  const [monthProgressError, setMonthProgressError] = useState<string | null>(null);

  const [year, setYear] = useState(currentYear());
  const [yearProgress, setYearProgress] = useState<YearProgress | null>(null);
  const [yearProgressError, setYearProgressError] = useState<string | null>(null);

  const [monthlyForm, setMonthlyForm] = useState<GoalFormState>(EMPTY_FORM);
  const [monthlyFormError, setMonthlyFormError] = useState<string | null>(null);
  const [isSavingMonthly, setIsSavingMonthly] = useState(false);

  const [annualForm, setAnnualForm] = useState<GoalFormState>(EMPTY_FORM);
  const [annualFormError, setAnnualFormError] = useState<string | null>(null);
  const [isSavingAnnual, setIsSavingAnnual] = useState(false);

  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetForm, setEditingBudgetForm] = useState<GoalFormState>(EMPTY_FORM);
  const [editBudgetError, setEditBudgetError] = useState<string | null>(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [pendingDeleteBudgetId, setPendingDeleteBudgetId] = useState<string | null>(null);
  const [budgetActionError, setBudgetActionError] = useState<string | null>(null);

  const [newBudgetCategoryId, setNewBudgetCategoryId] = useState('');
  const [newBudgetForm, setNewBudgetForm] = useState<GoalFormState>(EMPTY_FORM);
  const [createBudgetError, setCreateBudgetError] = useState<string | null>(null);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);

  async function reloadGoals() {
    const [goals, budgets] = await Promise.all([listSavingsGoals(), listExpenseBudgets()]);
    setSavingsGoals(goals);
    setExpenseBudgets(budgets);
    setMonthlyForm(goalFormFromEntity(goals.find((g) => g.period === 'MONTHLY')));
    setAnnualForm(goalFormFromEntity(goals.find((g) => g.period === 'ANNUAL')));
  }

  async function reloadMonthProgress(value: string) {
    try {
      setMonthProgress(await getMonthProgress(value));
    } catch (err) {
      setMonthProgressError(err instanceof ApiError ? err.message : 'No se ha podido cargar el progreso del mes.');
    }
  }

  async function reloadYearProgress(value: string) {
    try {
      setYearProgress(await getYearProgress(value));
    } catch (err) {
      setYearProgressError(err instanceof ApiError ? err.message : 'No se ha podido cargar el progreso del año.');
    }
  }

  async function refreshAfterMutation() {
    await reloadGoals();
    await Promise.all([reloadMonthProgress(month), reloadYearProgress(year)]);
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCategories('EXPENSE');
        if (!cancelled) setCategories(list);
      } catch {
        // El nombre de categoría es solo un adorno de la lista de presupuestos — no bloquea el resto de la página.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadGoals();
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar tus objetivos y presupuestos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setMonthProgressError(null);
    void reloadMonthProgress(month);
  }, [isAuthenticated, month]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setYearProgressError(null);
    void reloadYearProgress(year);
  }, [isAuthenticated, year]);

  async function saveSavingsGoal(
    period: GoalPeriod,
    form: GoalFormState,
    setError: (message: string | null) => void,
    setSaving: (value: boolean) => void,
  ) {
    const existing = savingsGoals?.find((g) => g.period === period) ?? null;
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await updateSavingsGoal(existing.id, form);
      } else {
        await createSavingsGoal({ period, ...form });
      }
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido guardar el objetivo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMonthlyGoalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSavingsGoal('MONTHLY', monthlyForm, setMonthlyFormError, setIsSavingMonthly);
  }

  async function handleAnnualGoalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSavingsGoal('ANNUAL', annualForm, setAnnualFormError, setIsSavingAnnual);
  }

  async function handleDeleteSavingsGoal(
    period: GoalPeriod,
    setError: (message: string | null) => void,
    setSaving: (value: boolean) => void,
  ) {
    const existing = savingsGoals?.find((g) => g.period === period);
    if (!existing) return;
    setError(null);
    setSaving(true);
    try {
      await deleteSavingsGoal(existing.id);
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el objetivo.');
    } finally {
      setSaving(false);
    }
  }

  function startEditBudget(budget: ExpenseBudget) {
    setEditBudgetError(null);
    setEditingBudgetId(budget.id);
    setEditingBudgetForm(goalFormFromEntity(budget));
  }

  async function handleEditBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBudgetId) return;
    setEditBudgetError(null);
    setIsSavingBudget(true);
    try {
      await updateExpenseBudget(editingBudgetId, editingBudgetForm);
      setEditingBudgetId(null);
      await refreshAfterMutation();
    } catch (err) {
      setEditBudgetError(err instanceof ApiError ? err.message : 'No se ha podido guardar el presupuesto.');
    } finally {
      setIsSavingBudget(false);
    }
  }

  async function handleDeleteBudget(id: string) {
    setBudgetActionError(null);
    setPendingDeleteBudgetId(id);
    try {
      await deleteExpenseBudget(id);
      await refreshAfterMutation();
    } catch (err) {
      setBudgetActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el presupuesto.');
    } finally {
      setPendingDeleteBudgetId(null);
    }
  }

  async function handleCreateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBudgetError(null);
    if (hasGlobalBudget && newBudgetCategoryId === '') {
      setCreateBudgetError('Ya tienes un presupuesto global — elige una categoría, o edita el existente en la tabla de arriba.');
      return;
    }
    setIsCreatingBudget(true);
    try {
      await createExpenseBudget({ categoryId: newBudgetCategoryId || undefined, ...newBudgetForm });
      setNewBudgetCategoryId('');
      setNewBudgetForm(EMPTY_FORM);
      await refreshAfterMutation();
    } catch (err) {
      setCreateBudgetError(err instanceof ApiError ? err.message : 'No se ha podido crear el presupuesto.');
    } finally {
      setIsCreatingBudget(false);
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
        <h1>Objetivos y presupuestos</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  const hasMonthlyGoal = savingsGoals?.some((g) => g.period === 'MONTHLY') ?? false;
  const hasAnnualGoal = savingsGoals?.some((g) => g.period === 'ANNUAL') ?? false;

  const topLevelExpenseCategories = categories?.filter((c) => !c.parentId) ?? [];
  const budgetedCategoryIds = new Set((expenseBudgets ?? []).map((b) => b.categoryId).filter((id): id is string => id !== null));
  const hasGlobalBudget = (expenseBudgets ?? []).some((b) => b.categoryId === null);
  const availableCategories = topLevelExpenseCategories.filter((c) => !budgetedCategoryIds.has(c.id));
  const canCreateBudget = !hasGlobalBudget || availableCategories.length > 0;

  return (
    <main>
      <h1>Objetivos y presupuestos</h1>
      <p>Define un objetivo de ahorro (mensual y/o anual) y presupuestos de gasto, con tu progreso real del periodo.</p>

      {loadError && <p role="alert">{loadError}</p>}

      <section>
        <h2>Objetivo de ahorro</h2>

        <h3>Mensual</h3>
        <div>
          <label htmlFor="goals-month">Mes a consultar</label>
          <input id="goals-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        {monthProgressError && <p role="alert">{monthProgressError}</p>}
        {monthProgress?.savingsGoal && <GoalProgressSummary progress={monthProgress.savingsGoal} statusLabel={savingsStatusLabel} />}
        {monthProgress && !monthProgress.savingsGoal && <p>No tienes un objetivo de ahorro mensual definido todavía.</p>}

        <form onSubmit={handleMonthlyGoalSubmit} aria-label="Objetivo de ahorro mensual" noValidate>
          <GoalFormFields idPrefix="monthly-goal" form={monthlyForm} onChange={setMonthlyForm} />
          {monthlyFormError && <p role="alert">{monthlyFormError}</p>}
          <button type="submit" disabled={isSavingMonthly}>
            {isSavingMonthly ? 'Guardando…' : hasMonthlyGoal ? 'Guardar objetivo mensual' : 'Crear objetivo mensual'}
          </button>{' '}
          {hasMonthlyGoal && (
            <button
              type="button"
              disabled={isSavingMonthly}
              onClick={() => void handleDeleteSavingsGoal('MONTHLY', setMonthlyFormError, setIsSavingMonthly)}
            >
              Eliminar objetivo mensual
            </button>
          )}
        </form>

        <h3>Anual</h3>
        <div>
          <label htmlFor="goals-year">Año a consultar</label>
          <input id="goals-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        {yearProgressError && <p role="alert">{yearProgressError}</p>}
        {yearProgress?.savingsGoal && <GoalProgressSummary progress={yearProgress.savingsGoal} statusLabel={savingsStatusLabel} />}
        {yearProgress && !yearProgress.savingsGoal && <p>No tienes un objetivo de ahorro anual definido todavía.</p>}

        <form onSubmit={handleAnnualGoalSubmit} aria-label="Objetivo de ahorro anual" noValidate>
          <GoalFormFields idPrefix="annual-goal" form={annualForm} onChange={setAnnualForm} />
          {annualFormError && <p role="alert">{annualFormError}</p>}
          <button type="submit" disabled={isSavingAnnual}>
            {isSavingAnnual ? 'Guardando…' : hasAnnualGoal ? 'Guardar objetivo anual' : 'Crear objetivo anual'}
          </button>{' '}
          {hasAnnualGoal && (
            <button
              type="button"
              disabled={isSavingAnnual}
              onClick={() => void handleDeleteSavingsGoal('ANNUAL', setAnnualFormError, setIsSavingAnnual)}
            >
              Eliminar objetivo anual
            </button>
          )}
        </form>
      </section>

      <section>
        <h2>Presupuestos de gasto</h2>
        <p>El progreso se calcula sobre el mes seleccionado arriba ({month}).</p>

        {budgetActionError && <p role="alert">{budgetActionError}</p>}

        {expenseBudgets && expenseBudgets.length === 0 && <p>No tienes presupuestos de gasto todavía.</p>}

        {expenseBudgets && expenseBudgets.length > 0 && (
          <table>
            <caption>Tus presupuestos de gasto</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Tipo</th>
                <th scope="col">Objetivo</th>
                <th scope="col">Umbral de aviso</th>
                <th scope="col">Progreso del mes</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenseBudgets.map((budget) => {
                const isEditing = editingBudgetId === budget.id;
                const progress = monthProgress?.expenseBudgets.find((p) => p.id === budget.id);
                const categoryName = budget.categoryId
                  ? (categories?.find((c) => c.id === budget.categoryId)?.name ?? budget.categoryId)
                  : 'Global (todo el gasto)';

                if (isEditing) {
                  return (
                    <tr key={budget.id}>
                      <td>{categoryName}</td>
                      <td colSpan={5}>
                        <form onSubmit={handleEditBudget} aria-label={`Editar presupuesto: ${categoryName}`} noValidate>
                          <GoalFormFields idPrefix={`budget-${budget.id}`} form={editingBudgetForm} onChange={setEditingBudgetForm} />
                          {editBudgetError && <p role="alert">{editBudgetError}</p>}
                          <button type="submit" disabled={isSavingBudget}>
                            {isSavingBudget ? 'Guardando…' : 'Guardar'}
                          </button>{' '}
                          <button type="button" disabled={isSavingBudget} onClick={() => setEditingBudgetId(null)}>
                            Cancelar
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={budget.id}>
                    <td>{categoryName}</td>
                    <td>{budget.targetType === 'AMOUNT' ? 'Importe' : '% de ingresos'}</td>
                    <td>{budget.targetValue}</td>
                    <td>{budget.alertThresholdPercent}%</td>
                    <td>{budgetProgressCellText(progress)}</td>
                    <td>
                      <button type="button" onClick={() => startEditBudget(budget)}>
                        Editar
                      </button>{' '}
                      <button
                        type="button"
                        disabled={pendingDeleteBudgetId === budget.id}
                        onClick={() => void handleDeleteBudget(budget.id)}
                      >
                        {pendingDeleteBudgetId === budget.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h3>Añadir presupuesto</h3>
        {expenseBudgets && !canCreateBudget && <p>Ya tienes presupuestos para todas tus categorías de gasto y el global.</p>}
        {expenseBudgets && canCreateBudget && (
          <form onSubmit={handleCreateBudget} aria-label="Añadir presupuesto" noValidate>
            <div>
              <label htmlFor="newBudgetCategoryId">Categoría</label>
              <select id="newBudgetCategoryId" value={newBudgetCategoryId} onChange={(e) => setNewBudgetCategoryId(e.target.value)}>
                {!hasGlobalBudget && <option value="">— Presupuesto global (todo el gasto) —</option>}
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <GoalFormFields idPrefix="new-budget" form={newBudgetForm} onChange={setNewBudgetForm} />
            {createBudgetError && <p role="alert">{createBudgetError}</p>}
            <button type="submit" disabled={isCreatingBudget}>
              {isCreatingBudget ? 'Creando…' : 'Crear presupuesto'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
