import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as dashboardApi from '../api/dashboard';
import type { Category } from '../api/categories';
import type { MonthSummary, YearSummary } from '../api/dashboard';
import { ApiError } from '../api/client';

const INCOME_CATEGORY: Category = {
  id: 'cat-income-1',
  userId: 'user-1',
  type: 'INCOME',
  name: 'Nómina',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_FOOD: Category = {
  id: 'cat-expense-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Comida',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_TRANSPORT: Category = {
  id: 'cat-expense-2',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Transporte',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MONTH_SUMMARY: MonthSummary = {
  month: '2026-08',
  income: '2000.00',
  expense: '350.00',
  savings: '1650.00',
  savingsPercent: '82.50',
  byCategory: [
    { categoryId: 'cat-expense-2', total: '50.00' },
    { categoryId: 'cat-expense-1', total: '300.00' },
  ],
  dailyAverages: { income: '71.43', expense: '12.50', savings: '58.93' },
};

const MONTH_SUMMARY_SIN_GASTOS: MonthSummary = {
  month: '2026-08',
  income: '0.00',
  expense: '0.00',
  savings: '0.00',
  savingsPercent: null,
  byCategory: [],
  dailyAverages: { income: '0.00', expense: '0.00', savings: '0.00' },
};

function buildYearSummary(): YearSummary {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    income: i === 0 ? '2000.00' : '0.00',
    expense: i === 0 ? '300.00' : '0.00',
    savings: i === 0 ? '1700.00' : '0.00',
  }));
  return {
    year: 2026,
    months,
    totals: { income: '4100.00', expense: '700.00', savings: '3400.00', savingsPercent: '82.93' },
  };
}

describe('DashboardPage', () => {
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
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API del dashboard', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary');
    const yearSpy = vi.spyOn(dashboardApi, 'getYearSummary');
    const categoriesSpy = vi.spyOn(categoriesApi, 'listCategories');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(monthSpy).not.toHaveBeenCalled();
    expect(yearSpy).not.toHaveBeenCalled();
    expect(categoriesSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, muestra el resumen del mes y el desglose de gastos por categoría', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY, EXPENSE_FOOD, EXPENSE_TRANSPORT]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());

    renderPage();

    expect(await screen.findByText('Ingresos: 2000.00')).toBeInTheDocument();
    expect(screen.getByText('Gastos: 350.00')).toBeInTheDocument();
    expect(screen.getByText('Ahorro: 1650.00')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro: 82.50%')).toBeInTheDocument();
    expect(screen.getByText('Ingreso medio/día: 71.43')).toBeInTheDocument();

    // Tabla del desglose por categoría, ordenada por total descendente y con el nombre resuelto.
    const table = screen.getByRole('table', { name: 'Gastos por categoría (tabla)' });
    const rows = within(table).getAllByRole('row').slice(1); // sin la fila de cabecera
    expect(within(rows[0]).getByText('Comida')).toBeInTheDocument();
    expect(within(rows[0]).getByText('300.00')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Transporte')).toBeInTheDocument();
    expect(within(rows[1]).getByText('50.00')).toBeInTheDocument();
  });

  it('sin gastos en el mes, no muestra la tabla y el % de ahorro aparece como "sin datos"', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY_SIN_GASTOS);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());

    renderPage();

    expect(await screen.findByText('Sin gastos en este mes.')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro: sin datos')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Gastos por categoría (tabla)' })).not.toBeInTheDocument();
  });

  it('muestra los acumulados anuales y la tabla de evolución mensual con los 12 meses', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY, EXPENSE_FOOD]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());

    renderPage();

    expect(await screen.findByText('Ingresos totales: 4100.00')).toBeInTheDocument();
    expect(screen.getByText('Gastos totales: 700.00')).toBeInTheDocument();
    expect(screen.getByText('Ahorro total: 3400.00')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro global: 82.93%')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Evolución mensual (tabla)' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    expect(within(rows[0]).getByText('2026-01')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2000.00')).toBeInTheDocument();
  });

  it('cambia el mes seleccionado y vuelve a pedir el resumen de ese mes', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());

    renderPage();
    await screen.findByText('Ingresos: 2000.00');

    const monthInput = screen.getByLabelText('Mes');
    await userEvent.clear(monthInput);
    await userEvent.type(monthInput, '2026-03');

    await waitFor(() => expect(monthSpy).toHaveBeenLastCalledWith('2026-03'));
  });

  it('cambia el año seleccionado y vuelve a pedir el resumen de ese año', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    const yearSpy = vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());

    renderPage();
    await screen.findByText('Ingresos totales: 4100.00');

    const yearInput = screen.getByLabelText('Año');
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, '2025');

    await waitFor(() => expect(yearSpy).toHaveBeenLastCalledWith('2025'));
  });
});
