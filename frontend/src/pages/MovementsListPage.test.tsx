import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementsListPage } from './MovementsListPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as transactionsApi from '../api/transactions';
import type { Category } from '../api/categories';
import type { ListTransactionsResult, Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { putTransactions } from '../offline/db';
import { resetForTests } from '../offline/connectivity';

const INCOME_CATEGORY: Category = {
  id: 'cat-income-1',
  userId: 'user-1',
  type: 'INCOME',
  name: 'Nómina',
  parentId: null,
  isDefault: true,
  icon: '💼',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_PARENT: Category = {
  id: 'cat-expense-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Transporte',
  parentId: null,
  isDefault: true,
  icon: '🚌',
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

const EXPENSE_TX: Transaction = {
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
};

const INCOME_TX: Transaction = {
  id: 'tx-2',
  userId: 'user-1',
  type: 'INCOME',
  date: '2026-08-05',
  categoryId: 'cat-income-1',
  subcategoryId: null,
  concept: 'Nómina agosto',
  merchant: null,
  amount: '2000.00',
  paymentMethod: null,
  createdAt: '2026-08-05T09:00:00.000Z',
  updatedAt: '2026-08-05T09:00:00.000Z',
};

const EXPENSE_RESULT: ListTransactionsResult = {
  items: [EXPENSE_TX],
  page: 1,
  limit: 20,
  totalItems: 1,
  summary: {
    total: '45.00',
    averagePerMonth: '45.00',
    byCategory: [{ categoryId: 'cat-expense-1', total: '45.00' }],
    bySubcategory: [{ subcategoryId: 'cat-expense-2', total: '45.00' }],
  },
};

const EXPENSE_EMPTY_RESULT: ListTransactionsResult = {
  items: [],
  page: 1,
  limit: 20,
  totalItems: 0,
  summary: { total: '0.00', averagePerMonth: null, byCategory: [], bySubcategory: [] },
};

const INCOME_RESULT: ListTransactionsResult = {
  items: [INCOME_TX],
  page: 1,
  limit: 20,
  totalItems: 1,
  summary: {
    total: '2000.00',
    averagePerMonth: '2000.00',
    byCategory: [{ categoryId: 'cat-income-1', total: '2000.00' }],
    bySubcategory: [],
  },
};

describe('MovementsListPage', () => {
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
        <MemoryRouter initialEntries={['/movements']}>
          <Routes>
            <Route path="/movements" element={<MovementsListPage />} />
            <Route path="/movements/register/:id" element={<h1>Página de registro (destino de la navegación)</h1>} />
          </Routes>
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

  it('con sesión activa, lista los gastos por defecto (sin resumen, eso vive en MovementsSummaryPage)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();

    expect(await screen.findByText('Depósito gasolina')).toBeInTheDocument();
    expect(screen.getByText(/Repsol/)).toBeInTheDocument();
    expect(screen.getByText(/Tarjeta/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
  });

  it('muestra el icono de la categoría de cada movimiento', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();

    await screen.findByText('Depósito gasolina');
    expect(screen.getByText('🚌')).toBeInTheDocument();
  });

  it('no muestra el resumen ni el formulario de registro a la vez (H1 criterio 2)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText('Depósito gasolina');

    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Concepto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('cambia el selector a ingresos y recarga el listado filtrado por ese tipo', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi
      .spyOn(transactionsApi, 'listTransactions')
      .mockImplementation(async (filters = {}) => (filters.type === 'INCOME' ? INCOME_RESULT : EXPENSE_RESULT));

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));

    expect(await screen.findByText('Nómina agosto')).toBeInTheDocument();
    await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INCOME' })));
  });

  it('"Editar" navega a /movements/register/:id, no abre nada inline', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Página de registro (destino de la navegación)')).toBeInTheDocument();
  });

  it('elimina un movimiento y lo quita de la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValueOnce(EXPENSE_RESULT).mockResolvedValueOnce(EXPENSE_EMPTY_RESULT);
    const deleteSpy = vi.spyOn(transactionsApi, 'deleteTransaction').mockResolvedValue(undefined);

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('tx-1'));
    expect(await screen.findByText('No hay movimientos con estos filtros.')).toBeInTheDocument();
  });

  it('aplica un filtro de fechas y vuelve a pedir el listado con esos filtros', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-08-31');

    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'EXPENSE', dateFrom: '2026-08-01', dateTo: '2026-08-31' })),
    );
  });

  it('sin conexión (T3.3, spec 011), muestra los movimientos de la caché local en vez de llamar a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions');
    await putTransactions([{ ...EXPENSE_TX, pending: false, pendingAction: null }]);
    resetForTests(false);

    renderPage();

    expect(await screen.findByText('Depósito gasolina')).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('un movimiento con pending:true en la caché se marca "pendiente de sincronizar" (T4.2, spec 011)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    await putTransactions([{ ...EXPENSE_TX, pending: true, pendingAction: 'CREATE' }]);
    resetForTests(false);

    renderPage();

    expect(await screen.findByText('Depósito gasolina')).toBeInTheDocument();
    expect(screen.getByText('pendiente de sincronizar')).toBeInTheDocument();
  });

  it('marca los movimientos con ticket enlazado y enlaza al ticket (spec 048 H3)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({ ...EXPENSE_RESULT, items: [{ ...EXPENSE_TX, receiptId: 'r-9' }] });

    renderPage();

    const tag = await screen.findByRole('link', { name: 'Ver el ticket de Depósito gasolina' });
    expect(tag).toHaveAttribute('href', '/tickets/r-9');
  });

  it('sin ticket enlazado no muestra la etiqueta', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();

    expect(await screen.findByText('Depósito gasolina')).toBeInTheDocument();
    expect(screen.queryByText('🧾 ticket')).not.toBeInTheDocument();
  });
});
