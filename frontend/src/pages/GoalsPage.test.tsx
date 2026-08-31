import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalsPage } from './GoalsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as savingsGoalsApi from '../api/savings-goals';
import * as expenseBudgetsApi from '../api/expense-budgets';
import * as goalsProgressApi from '../api/goals-progress';
import type { Category } from '../api/categories';
import type { SavingsGoal } from '../api/savings-goals';
import type { ExpenseBudget } from '../api/expense-budgets';
import type { MonthProgress, YearProgress } from '../api/goals-progress';
import { ApiError } from '../api/client';

const FOOD_CATEGORY: Category = {
  id: 'cat-food',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Comida',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const TRANSPORT_CATEGORY: Category = {
  id: 'cat-transport',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Transporte',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MONTHLY_GOAL: SavingsGoal = {
  id: 'goal-monthly-1',
  userId: 'user-1',
  period: 'MONTHLY',
  targetType: 'AMOUNT',
  targetValue: '500.00',
  alertThresholdPercent: '80.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const FOOD_BUDGET: ExpenseBudget = {
  id: 'budget-food',
  userId: 'user-1',
  categoryId: FOOD_CATEGORY.id,
  targetType: 'AMOUNT',
  targetValue: '250.00',
  alertThresholdPercent: '80.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const EMPTY_MONTH_PROGRESS: MonthProgress = { month: '2026-08', savingsGoal: null, expenseBudgets: [] };
const EMPTY_YEAR_PROGRESS: YearProgress = { year: 2026, savingsGoal: null };

function monthProgressWithGoal(): MonthProgress {
  return {
    month: '2026-08',
    savingsGoal: {
      id: MONTHLY_GOAL.id,
      targetType: 'AMOUNT',
      targetValue: '500.00',
      alertThresholdPercent: '80.00',
      actualAmount: '1700.00',
      targetAmount: '500.00',
      deviation: '1200.00',
      progressPercent: '340.00',
      status: 'AT_OR_ABOVE_TARGET',
      projectedAmount: null,
    },
    expenseBudgets: [
      {
        id: FOOD_BUDGET.id,
        categoryId: FOOD_CATEGORY.id,
        targetType: 'AMOUNT',
        targetValue: '250.00',
        alertThresholdPercent: '80.00',
        actualAmount: '300.00',
        targetAmount: '250.00',
        deviation: '50.00',
        progressPercent: '120.00',
        status: 'AT_OR_ABOVE_TARGET',
        projectedAmount: null,
      },
    ],
  };
}

describe('GoalsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: true,
    });
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <GoalsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API de objetivos/presupuestos', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const goalsSpy = vi.spyOn(savingsGoalsApi, 'listSavingsGoals');
    const budgetsSpy = vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(goalsSpy).not.toHaveBeenCalled();
    expect(budgetsSpy).not.toHaveBeenCalled();
  });

  it('sin ningún objetivo ni presupuesto, muestra los mensajes de "todavía no tienes nada"', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY, TRANSPORT_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(EMPTY_MONTH_PROGRESS);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();

    expect(await screen.findByText('No tienes un objetivo de ahorro mensual definido todavía.')).toBeInTheDocument();
    expect(screen.getByText('No tienes un objetivo de ahorro anual definido todavía.')).toBeInTheDocument();
    expect(screen.getByText('No tienes presupuestos de gasto todavía.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear objetivo mensual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear objetivo anual' })).toBeInTheDocument();
  });

  it('muestra el progreso real de un objetivo mensual y de un presupuesto de categoría', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([MONTHLY_GOAL]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([FOOD_BUDGET]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgressWithGoal());
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();

    expect(await screen.findByText('Real: 1700.00')).toBeInTheDocument();
    expect(screen.getByText('Desviación: 1200.00')).toBeInTheDocument();
    expect(screen.getByText('% alcanzado: 340.00%')).toBeInTheDocument();
    expect(screen.getByText('Estado: cumplido')).toBeInTheDocument();

    // Spec 010 (rediseño editorial), T8: la tabla se sustituyó por una lista
    // de tarjetas, una por presupuesto (H8 criterio 1).
    const list = screen.getByRole('list', { name: 'Tus presupuestos de gasto' });
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0]).getByText('Comida')).toBeInTheDocument();
    expect(within(items[0]).getByText('300.00 de 250.00 (120.00%) · superado')).toBeInTheDocument();
  });

  it('H1/H3 (spec 007): un presupuesto superado se pinta en rojo y un objetivo de ahorro superado en verde (mismo dato, direcciones opuestas)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([MONTHLY_GOAL]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([FOOD_BUDGET]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgressWithGoal());
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();
    await screen.findByText('Real: 1700.00');

    const savingsBar = screen.getByRole('progressbar', { name: /Objetivo de ahorro/ });
    expect(savingsBar.querySelector('.progress-bar-fill')).toHaveStyle({ background: 'var(--status-green)' });

    const budgetBar = screen.getByRole('progressbar', { name: /^Comida:/ });
    expect(budgetBar.querySelector('.progress-bar-fill')).toHaveStyle({ background: 'var(--status-red)' });
  });

  it('H4 criterio 2: traduce NEAR_THRESHOLD y BELOW_THRESHOLD a la etiqueta correcta según el tipo', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([MONTHLY_GOAL]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([FOOD_BUDGET]);
    const progress = monthProgressWithGoal();
    progress.savingsGoal = { ...progress.savingsGoal!, status: 'NEAR_THRESHOLD' };
    progress.expenseBudgets = [{ ...progress.expenseBudgets[0], status: 'BELOW_THRESHOLD' }];
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(progress);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();

    expect(await screen.findByText('Estado: cerca de conseguirlo')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tus presupuestos de gasto' });
    expect(within(list).getByText(/dentro de lo previsto/)).toBeInTheDocument();
  });

  it('crea un objetivo de ahorro mensual desde el formulario', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([]);
    const listGoalsSpy = vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(EMPTY_MONTH_PROGRESS);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);
    const createSpy = vi.spyOn(savingsGoalsApi, 'createSavingsGoal').mockResolvedValue(MONTHLY_GOAL);

    renderPage();
    await screen.findByRole('button', { name: 'Crear objetivo mensual' });

    const form = screen.getByRole('form', { name: 'Objetivo de ahorro mensual' });
    await userEvent.type(within(form).getByLabelText('Importe objetivo'), '500.00');
    await userEvent.clear(within(form).getByLabelText('Umbral de aviso (%)'));
    await userEvent.type(within(form).getByLabelText('Umbral de aviso (%)'), '80.00');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear objetivo mensual' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        period: 'MONTHLY',
        targetType: 'AMOUNT',
        targetValue: '500.00',
        alertThresholdPercent: '80.00',
      }),
    );
    // Tras crear, vuelve a pedir la lista de objetivos.
    await waitFor(() => expect(listGoalsSpy).toHaveBeenCalledTimes(2));
  });

  it('edita un presupuesto existente desde la tabla', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([FOOD_BUDGET]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgressWithGoal());
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);
    const updateSpy = vi.spyOn(expenseBudgetsApi, 'updateExpenseBudget').mockResolvedValue(FOOD_BUDGET);

    renderPage();
    await screen.findByRole('list', { name: 'Tus presupuestos de gasto' });

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const editForm = screen.getByRole('form', { name: 'Editar presupuesto: Comida' });
    const valueInput = within(editForm).getByLabelText('Importe objetivo');
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, '300.00');
    await userEvent.click(within(editForm).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(FOOD_BUDGET.id, {
        targetType: 'AMOUNT',
        targetValue: '300.00',
        alertThresholdPercent: '80.00',
      }),
    );
  });

  it('elimina un presupuesto', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([FOOD_BUDGET]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgressWithGoal());
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);
    const deleteSpy = vi.spyOn(expenseBudgetsApi, 'deleteExpenseBudget').mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('list', { name: 'Tus presupuestos de gasto' });

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(FOOD_BUDGET.id));
  });

  it('crea un presupuesto de categoría desde el formulario de añadir', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY, TRANSPORT_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    const listBudgetsSpy = vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(EMPTY_MONTH_PROGRESS);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);
    const createSpy = vi.spyOn(expenseBudgetsApi, 'createExpenseBudget').mockResolvedValue(FOOD_BUDGET);

    renderPage();
    const form = await screen.findByRole('form', { name: 'Añadir presupuesto' });

    await userEvent.selectOptions(within(form).getByLabelText('Categoría'), FOOD_CATEGORY.id);
    await userEvent.type(within(form).getByLabelText('Importe objetivo'), '250.00');
    await userEvent.clear(within(form).getByLabelText('Umbral de aviso (%)'));
    await userEvent.type(within(form).getByLabelText('Umbral de aviso (%)'), '80.00');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear presupuesto' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        categoryId: FOOD_CATEGORY.id,
        targetType: 'AMOUNT',
        targetValue: '250.00',
        alertThresholdPercent: '80.00',
      }),
    );
    await waitFor(() => expect(listBudgetsSpy).toHaveBeenCalledTimes(2));
  });

  it('si ya existe un presupuesto global, la opción "global" no aparece en el desplegable', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([FOOD_CATEGORY]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockResolvedValue([]);
    const globalBudget: ExpenseBudget = { ...FOOD_BUDGET, id: 'budget-global', categoryId: null };
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([globalBudget]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(EMPTY_MONTH_PROGRESS);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();
    const form = await screen.findByRole('form', { name: 'Añadir presupuesto' });

    expect(within(form).queryByText('— Presupuesto global (todo el gasto) —')).not.toBeInTheDocument();
    expect(within(form).getByRole('option', { name: 'Comida' })).toBeInTheDocument();
  });

  it('muestra un error si falla la carga de objetivos y presupuestos', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([]);
    vi.spyOn(savingsGoalsApi, 'listSavingsGoals').mockRejectedValue(new ApiError(500, 'Error del servidor.'));
    vi.spyOn(expenseBudgetsApi, 'listExpenseBudgets').mockResolvedValue([]);
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(EMPTY_MONTH_PROGRESS);
    vi.spyOn(goalsProgressApi, 'getYearProgress').mockResolvedValue(EMPTY_YEAR_PROGRESS);

    renderPage();

    expect(await screen.findByText('Error del servidor.')).toBeInTheDocument();
  });
});
