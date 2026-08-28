import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementsPage } from './MovementsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as transactionsApi from '../api/transactions';
import type { Category } from '../api/categories';
import type { ListTransactionsResult, Transaction } from '../api/transactions';
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

const INCOME_EMPTY_RESULT: ListTransactionsResult = {
  items: [],
  page: 1,
  limit: 20,
  totalItems: 0,
  summary: { total: '0.00', averagePerMonth: null, byCategory: [], bySubcategory: [] },
};

describe('MovementsPage', () => {
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
          <MovementsPage />
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

  it('con sesión activa, lista los gastos por defecto junto con el resumen', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);

    renderPage();

    expect(await screen.findByText('Depósito gasolina')).toBeInTheDocument();
    expect(screen.getByText(/Total: 45\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Media mensual: 45\.00/)).toBeInTheDocument();
    expect(screen.getByText('Transporte: 45.00')).toBeInTheDocument();
    // Desglose por subcategoría (H2 criterio 4), aparte del desglose por categoría.
    expect(screen.getByRole('heading', { name: 'Por subcategoría' })).toBeInTheDocument();
    expect(screen.getByText('Gasolina: 45.00')).toBeInTheDocument();
    // Datos del movimiento: subcategoría (en el propio listado, no en el resumen), comercio y tipo de pago.
    expect(screen.getByText(/Gasolina/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Repsol/)).toBeInTheDocument();
    expect(screen.getByText(/Tarjeta/, { selector: 'span' })).toBeInTheDocument();
  });

  it('cambia el selector a ingresos y recarga el listado filtrado por ese tipo', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const listSpy = vi.spyOn(transactionsApi, 'listTransactions').mockImplementation(async (filters = {}) =>
      filters.type === 'INCOME' ? INCOME_RESULT : EXPENSE_RESULT,
    );

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));

    expect(await screen.findByText('Nómina agosto')).toBeInTheDocument();
    await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INCOME' })));
    expect(screen.getByText(/Total: 2000\.00/)).toBeInTheDocument();
  });

  it('crea un ingreso nuevo y aparece en la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    let incomeListCalls = 0;
    vi.spyOn(transactionsApi, 'listTransactions').mockImplementation(async (filters = {}) => {
      if (filters.type !== 'INCOME') return EXPENSE_EMPTY_RESULT;
      incomeListCalls += 1;
      return incomeListCalls === 1 ? INCOME_EMPTY_RESULT : INCOME_RESULT;
    });
    const createSpy = vi.spyOn(transactionsApi, 'createTransaction').mockResolvedValue(INCOME_TX);

    renderPage();
    await screen.findByText('No hay movimientos con estos filtros.');

    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));

    const categorySelect = screen.getByLabelText('Categoría', { selector: '#categoryId' });
    await waitFor(() => expect(within(categorySelect).getByText('Nómina')).toBeInTheDocument());
    await userEvent.selectOptions(categorySelect, 'cat-income-1');
    await userEvent.type(screen.getByLabelText('Concepto'), 'Nómina agosto');
    await userEvent.type(screen.getByLabelText('Importe'), '2000.00');

    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INCOME',
          categoryId: 'cat-income-1',
          concept: 'Nómina agosto',
          amount: '2000.00',
          subcategoryId: undefined,
          merchant: undefined,
          paymentMethod: undefined,
        }),
      ),
    );
    expect(await screen.findByText('Nómina agosto')).toBeInTheDocument();
  });

  it('crea un gasto con subcategoría, comercio y tipo de pago', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_EMPTY_RESULT);
    const createSpy = vi.spyOn(transactionsApi, 'createTransaction').mockResolvedValue(EXPENSE_TX);

    renderPage();
    await screen.findByText('No hay movimientos con estos filtros.');

    const categorySelect = screen.getByLabelText('Categoría', { selector: '#categoryId' });
    await waitFor(() => expect(within(categorySelect).getByText('Transporte')).toBeInTheDocument());
    await userEvent.selectOptions(categorySelect, 'cat-expense-1');

    const subcategorySelect = await screen.findByLabelText('Subcategoría (opcional)');
    await userEvent.selectOptions(subcategorySelect, 'cat-expense-2');

    await userEvent.type(screen.getByLabelText('Concepto'), 'Depósito gasolina');
    await userEvent.type(screen.getByLabelText('Comercio (opcional)'), 'Repsol');
    await userEvent.type(screen.getByLabelText('Importe'), '45.00');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de pago (opcional)'), 'CARD');

    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXPENSE',
          categoryId: 'cat-expense-1',
          subcategoryId: 'cat-expense-2',
          concept: 'Depósito gasolina',
          merchant: 'Repsol',
          amount: '45.00',
          paymentMethod: 'CARD',
        }),
      ),
    );
  });

  it('edita un movimiento existente', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EXPENSE_RESULT);
    const updateSpy = vi.spyOn(transactionsApi, 'updateTransaction').mockResolvedValue({
      ...EXPENSE_TX,
      concept: 'Depósito gasolina (editado)',
    });

    renderPage();
    await screen.findByText('Depósito gasolina');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('heading', { name: 'Editar movimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText('Importe')).toHaveValue('45.00');

    const conceptInput = screen.getByLabelText('Concepto');
    await userEvent.clear(conceptInput);
    await userEvent.type(conceptInput, 'Depósito gasolina (editado)');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'tx-1',
        expect.objectContaining({
          concept: 'Depósito gasolina (editado)',
          categoryId: 'cat-expense-1',
          subcategoryId: 'cat-expense-2',
          merchant: 'Repsol',
          amount: '45.00',
          paymentMethod: 'CARD',
        }),
      ),
    );
    // Tras guardar, vuelve al modo de creación.
    expect(await screen.findByRole('heading', { name: 'Registrar gasto' })).toBeInTheDocument();
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
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'EXPENSE', dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
      ),
    );
  });
});
