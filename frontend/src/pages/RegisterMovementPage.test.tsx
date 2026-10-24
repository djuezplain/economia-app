import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterMovementPage } from './RegisterMovementPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as transactionsApi from '../api/transactions';
import type { Category } from '../api/categories';
import type { Transaction } from '../api/transactions';
import { api, ApiError } from '../api/client';
import { putCategories, putTransaction } from '../offline/db';
import { resetForTests } from '../offline/connectivity';

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

describe('RegisterMovementPage', () => {
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
      hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
    });
  });

  function renderPage(initialEntry: string) {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/movements/register" element={<RegisterMovementPage />} />
            <Route path="/movements/register/:id" element={<RegisterMovementPage />} />
            <Route path="/movements" element={<h1>Página de movimientos (destino de la navegación)</h1>} />
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

  it('sin sesión activa, pide iniciar sesión y no llama a categorías', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listCategoriesSpy = vi.spyOn(categoriesApi, 'listCategories');

    renderPage('/movements/register');

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(listCategoriesSpy).not.toHaveBeenCalled();
  });

  it('sin :id (alta), muestra el formulario vacío con el título "Registrar gasto" y el selector de tipo', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();

    renderPage('/movements/register');

    expect(await screen.findByRole('heading', { name: 'Registrar gasto' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Tipo de movimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText('Concepto')).toHaveValue('');
  });

  it('crea un ingreso nuevo y navega a /movements al guardar', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const createSpy = vi.spyOn(transactionsApi, 'createTransaction').mockResolvedValue({
      ...EXPENSE_TX,
      id: 'tx-2',
      type: 'INCOME',
      categoryId: 'cat-income-1',
    });

    renderPage('/movements/register');
    await screen.findByRole('heading', { name: 'Registrar gasto' });

    await userEvent.click(screen.getByRole('radio', { name: 'Ingresos' }));

    const categorySelect = screen.getByLabelText('Categoría', { selector: '#categoryId' });
    await waitFor(() => expect(within(categorySelect).getByText('Nómina')).toBeInTheDocument());
    await userEvent.selectOptions(categorySelect, 'cat-income-1');
    await userEvent.type(screen.getByLabelText('Concepto'), 'Nómina agosto');
    await userEvent.type(screen.getByLabelText('Importe'), '2000.00');

    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'INCOME', categoryId: 'cat-income-1', concept: 'Nómina agosto', amount: '2000.00' }),
      ),
    );
    expect(await screen.findByText('Página de movimientos (destino de la navegación)')).toBeInTheDocument();
  });

  it('crea un gasto con subcategoría, comercio y tipo de pago', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const createSpy = vi.spyOn(transactionsApi, 'createTransaction').mockResolvedValue(EXPENSE_TX);

    renderPage('/movements/register');
    await screen.findByRole('heading', { name: 'Registrar gasto' });

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

  it('con :id (edición), carga el movimiento con getTransaction y rellena el formulario campo a campo (H3 criterio 1), y oculta el selector de tipo', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    const getSpy = vi.spyOn(transactionsApi, 'getTransaction').mockResolvedValue(EXPENSE_TX);

    renderPage('/movements/register/tx-1');

    expect(await screen.findByRole('heading', { name: 'Editar movimiento' })).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledWith('tx-1');
    // Los 7 campos del movimiento, no solo concepto/importe — "mismo campo a
    // campo" (spec.md H3 criterio 1).
    await waitFor(() => expect(screen.getByLabelText('Concepto')).toHaveValue('Depósito gasolina'));
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-08-01');
    await waitFor(() => expect(screen.getByLabelText('Categoría', { selector: '#categoryId' })).toHaveValue('cat-expense-1'));
    expect(await screen.findByLabelText('Subcategoría (opcional)')).toHaveValue('cat-expense-2');
    expect(screen.getByLabelText('Comercio (opcional)')).toHaveValue('Repsol');
    expect(screen.getByLabelText('Importe')).toHaveValue('45.00');
    expect(screen.getByLabelText('Tipo de pago (opcional)')).toHaveValue('CARD');
    expect(screen.queryByRole('radiogroup', { name: 'Tipo de movimiento' })).not.toBeInTheDocument();
  });

  it('no muestra el resumen ni el listado de movimientos, solo el formulario (H1 criterio 3)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();

    renderPage('/movements/register');
    await screen.findByRole('heading', { name: 'Registrar gasto' });

    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Movimientos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('edición: guardar llama a updateTransaction y navega a /movements', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'getTransaction').mockResolvedValue(EXPENSE_TX);
    const updateSpy = vi.spyOn(transactionsApi, 'updateTransaction').mockResolvedValue({
      ...EXPENSE_TX,
      concept: 'Depósito gasolina (editado)',
    });

    renderPage('/movements/register/tx-1');
    await screen.findByRole('heading', { name: 'Editar movimiento' });
    await waitFor(() => expect(screen.getByLabelText('Concepto')).toHaveValue('Depósito gasolina'));

    const conceptInput = screen.getByLabelText('Concepto');
    await userEvent.clear(conceptInput);
    await userEvent.type(conceptInput, 'Depósito gasolina (editado)');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'tx-1',
        expect.objectContaining({ concept: 'Depósito gasolina (editado)', categoryId: 'cat-expense-1' }),
      ),
    );
    expect(await screen.findByText('Página de movimientos (destino de la navegación)')).toBeInTheDocument();
  });

  it('edición: "Cancelar edición" navega a /movements sin guardar', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'getTransaction').mockResolvedValue(EXPENSE_TX);
    const updateSpy = vi.spyOn(transactionsApi, 'updateTransaction');

    renderPage('/movements/register/tx-1');
    await screen.findByRole('heading', { name: 'Editar movimiento' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));

    expect(await screen.findByText('Página de movimientos (destino de la navegación)')).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('con un :id de un movimiento ajeno o inexistente, muestra un mensaje de error en vez del formulario', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'getTransaction').mockRejectedValue(new ApiError(404, 'Movimiento no encontrado.'));

    renderPage('/movements/register/tx-ajeno');

    expect(await screen.findByRole('alert')).toHaveTextContent('Movimiento no encontrado.');
    expect(screen.queryByLabelText('Concepto')).not.toBeInTheDocument();
  });

  it('sin conexión (H2 criterio 3, spec 011), edita un movimiento ya cacheado — carga y guarda desde la caché local', async () => {
    await putCategories([INCOME_CATEGORY, EXPENSE_PARENT, EXPENSE_CHILD]);
    await putTransaction({ ...EXPENSE_TX, pending: false, pendingAction: null });
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    resetForTests(false);
    const apiGetSpy = vi.spyOn(api, 'get');
    const listCategoriesSpy = vi.spyOn(categoriesApi, 'listCategories');

    renderPage('/movements/register/tx-1');

    expect(await screen.findByDisplayValue('Depósito gasolina')).toBeInTheDocument();
    // No se comprueba "cero llamadas a `api.get`" en general: `AuthContext`
    // intenta su propia hidratación de fondo (`syncFullHistory`) sin mirar
    // `isOnline` de antemano (falla sola si no hay red) — lo relevante aquí
    // es que la propia carga del movimiento no pase por la red.
    expect(apiGetSpy).not.toHaveBeenCalledWith('/transactions/tx-1');
    expect(listCategoriesSpy).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Concepto'));
    await userEvent.type(screen.getByLabelText('Concepto'), 'Gasolina (editado offline)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Página de movimientos (destino de la navegación)')).toBeInTheDocument();
  });

  it('al editar un movimiento con ticket enlazado, enlaza al ticket (spec 048 H3)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    mockCategoriesApi();
    vi.spyOn(transactionsApi, 'getTransaction').mockResolvedValue({ ...EXPENSE_TX, receiptId: 'r-9' });

    renderPage('/movements/register/tx-1');

    expect(await screen.findByRole('link', { name: 'ver' })).toHaveAttribute('href', '/tickets/r-9');
  });
});
