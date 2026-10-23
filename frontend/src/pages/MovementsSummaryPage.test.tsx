import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementsSummaryPage } from './MovementsSummaryPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as transactionsApi from '../api/transactions';
import type { Category } from '../api/categories';
import type { ListTransactionsResult } from '../api/transactions';
import { ApiError } from '../api/client';
import { putTransactions } from '../offline/db';
import { resetForTests } from '../offline/connectivity';

const EXPENSE_PARENT: Category = {
  id: 'cat-expense-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Transporte',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_CHILD: Category = {
  id: 'cat-expense-2',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Gasolina',
  parentId: 'cat-expense-1',
  isDefault: false,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const INCOME_CATEGORY: Category = {
  id: 'cat-income-1',
  userId: 'user-1',
  type: 'INCOME',
  name: 'Nómina',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_RESULT: ListTransactionsResult = {
  items: [],
  page: 1,
  limit: 20,
  totalItems: 0,
  summary: {
    total: '45.00',
    averagePerMonth: '45.00',
    byCategory: [{ categoryId: 'cat-expense-1', total: '45.00' }],
    bySubcategory: [{ subcategoryId: 'cat-expense-2', total: '45.00' }],
  },
};

const INCOME_RESULT: ListTransactionsResult = {
  items: [],
  page: 1,
  limit: 20,
  totalItems: 0,
  summary: {
    total: '2000.00',
    averagePerMonth: '2000.00',
    byCategory: [{ categoryId: 'cat-income-1', total: '2000.00' }],
    bySubcategory: [],
  },
};

describe('MovementsSummaryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetForTests(true);
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: true, recurringReminderEmails: true,
    });
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <MovementsSummaryPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  function mockCategoriesApi() {
    return vi.spyOn(categoriesApi, 'listCategories').mockImplementation(async (type) => {
      if (type === 'INCOME') return [INCOME_CATEGORY];
      return [EXPENSE_PARENT, EXPENSE_CHILD];
    });
  }

  it('sin sesión activa, pide iniciar sesión y no llama a categorías ni movimientos', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listCategoriesSpy = vi.spyOn(categoriesApi, 'listCategories');
    const listTransactionsSpy = vi.spyOn(transactionsApi, 'listTransactions');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(listCategoriesSpy).not.toHaveBeenCalled();
    expect(listTransactionsSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, muestra el total, la media y el desglose por categoría y subcategoría de los gastos', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();

    expect(await screen.findByText(/Total: 45\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Media mensual: 45\.00/)).toBeInTheDocument();
    expect(screen.getByText('Transporte: 45.00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Por subcategoría' })).toBeInTheDocument();
    expect(screen.getByText('Gasolina: 45.00')).toBeInTheDocument();
  });

  it('no muestra el listado detallado de movimientos ni el formulario de registro (H1 criterio 1)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText(/Total: 45\.00/);

    expect(screen.queryByRole('heading', { name: 'Movimientos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Concepto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('no muestra ningún filtro (fechas, categoría, comercio, búsqueda) — eso vive en MovementsListPage', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText(/Total: 45\.00/);

    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hasta')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Comercio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar en el concepto')).not.toBeInTheDocument();
  });

  it('pide el resumen sin ningún filtro, solo el tipo (plan.md §5: sobre todo el histórico)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText(/Total: 45\.00/);

    expect(listSpy).toHaveBeenCalledWith({ type: 'EXPENSE' });
  });

  it('cambia el selector a ingresos y recalcula el resumen', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockImplementation(async (filters = {}) =>
      filters.type === 'INCOME' ? INCOME_RESULT : EXPENSE_RESULT,
    );

    renderPage();
    await screen.findByText(/Total: 45\.00/);

    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));

    await waitFor(() => expect(screen.getByText(/Total: 2000\.00/)).toBeInTheDocument());
    expect(screen.getByText('Nómina: 2000.00')).toBeInTheDocument();
  });

  it('sin conexión (T3.3, spec 011), calcula el resumen sobre la caché local en vez de llamar a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions');
    await putTransactions([
      {
        id: 'tx-1',
        userId: 'user-1',
        type: 'EXPENSE',
        date: '2026-08-01',
        categoryId: 'cat-expense-1',
        subcategoryId: 'cat-expense-2',
        concept: 'Depósito gasolina',
        merchant: 'Repsol',
        amount: '45.00',
        paymentMethod: 'CARD',
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
        pending: false,
        pendingAction: null,
      },
    ]);
    resetForTests(false);

    renderPage();

    expect(await screen.findByText(/Total: 45\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(listSpy).not.toHaveBeenCalled();
  });
});
