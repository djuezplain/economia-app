import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesPage } from './CategoriesPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import type { Category } from '../api/categories';
import * as transactionsApi from '../api/transactions';
import type { ListTransactionsResult } from '../api/transactions';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';
import { putCategories } from '../offline/db';
import { resetForTests } from '../offline/connectivity';

// Mismo motivo que `HomePage.test.tsx`: `Intl.NumberFormat` usa un espacio
// de no separación (U+00A0) que `getByText` normaliza en el DOM pero no en
// el string de comparación.
function eur(amount: string): string {
  return formatCurrency(amount).replace(/ /g, ' ');
}

// Spec 010 (rediseño editorial), T4. Un mes sin gastos (el caso por
// defecto de la mayoría de tests, que no ejercitan las tarjetas de gasto)
// para que `listTransactions` no falle por falta de mock.
const EMPTY_MONTH_RESULT: ListTransactionsResult = {
  items: [],
  page: 1,
  limit: 200,
  totalItems: 0,
  summary: { total: '0.00', averagePerMonth: null, byCategory: [], bySubcategory: [] },
};

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
  icon: '🚌',
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('CategoriesPage', () => {
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
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(EMPTY_MONTH_RESULT);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <CategoriesPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a la API de categorías', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listSpy = vi.spyOn(categoriesApi, 'listCategories');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, lista ingresos y gastos con sus subcategorías anidadas', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY, EXPENSE_PARENT, EXPENSE_CHILD]);

    renderPage();

    expect(await screen.findByText('Nómina')).toBeInTheDocument();
    // "Transporte" también aparece como opción del select de categoría padre
    // del formulario de creación — se busca el <span> del listado en concreto.
    expect(screen.getByText('Transporte', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Gasolina')).toBeInTheDocument();
  });

  it('crea una categoría nueva y recarga la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories')
      .mockResolvedValueOnce([INCOME_CATEGORY])
      .mockResolvedValueOnce([INCOME_CATEGORY, EXPENSE_PARENT]);
    const createSpy = vi.spyOn(categoriesApi, 'createCategory').mockResolvedValue(EXPENSE_PARENT);

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'EXPENSE');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Transporte');
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({ type: 'EXPENSE', name: 'Transporte', parentId: undefined, icon: undefined }),
    );
    expect(await screen.findAllByText('Transporte')).not.toHaveLength(0);
  });

  it('crea una categoría nueva con un icono elegido explícitamente', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories')
      .mockResolvedValueOnce([INCOME_CATEGORY])
      .mockResolvedValueOnce([INCOME_CATEGORY, EXPENSE_PARENT]);
    const createSpy = vi.spyOn(categoriesApi, 'createCategory').mockResolvedValue(EXPENSE_PARENT);

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'EXPENSE');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Transporte');
    await userEvent.selectOptions(screen.getByLabelText('Icono'), '🚌');
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({ type: 'EXPENSE', name: 'Transporte', parentId: undefined, icon: '🚌' }),
    );
  });

  it('renombra una categoría existente sin tocar su icono', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories')
      .mockResolvedValueOnce([INCOME_CATEGORY])
      .mockResolvedValueOnce([{ ...INCOME_CATEGORY, name: 'Salario' }]);
    const updateSpy = vi
      .spyOn(categoriesApi, 'updateCategory')
      .mockResolvedValue({ ...INCOME_CATEGORY, name: 'Salario' });

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nuevo nombre');
    await userEvent.clear(input);
    await userEvent.type(input, 'Salario');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // El selector de icono se preselecciona con el actual (💼) — sin
    // tocarlo, se manda de vuelta tal cual, no "Automático".
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('cat-income-1', { name: 'Salario', icon: '💼' }));
    expect(await screen.findByText('Salario')).toBeInTheDocument();
  });

  it('cambia el icono de una categoría existente desde el formulario de edición', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    const updateSpy = vi
      .spyOn(categoriesApi, 'updateCategory')
      .mockResolvedValue({ ...INCOME_CATEGORY, icon: '🏦' });

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    await userEvent.selectOptions(screen.getByLabelText('Nuevo icono'), '🏦');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('cat-income-1', { name: 'Nómina', icon: '🏦' }));
  });

  it('elimina una categoría sin uso y la quita de la lista', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValueOnce([INCOME_CATEGORY]).mockResolvedValueOnce([]);
    const deleteSpy = vi.spyOn(categoriesApi, 'deleteCategory').mockResolvedValue(undefined);

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('cat-income-1'));
    await waitFor(() => expect(screen.queryByText('Nómina')).not.toBeInTheDocument());
  });

  it('si el borrado falla por estar en uso (409), muestra el error del backend', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(categoriesApi, 'deleteCategory').mockRejectedValue(
      new ApiError(409, 'No se puede eliminar: tiene movimientos o subcategorías asociadas. Elimínalos primero.'),
    );

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tiene movimientos o subcategorías asociadas');
    // La categoría sigue en la lista: el borrado falló y no se optimiza de forma optimista.
    expect(screen.getByText('Nómina')).toBeInTheDocument();
  });

  it('con gastos este mes, la tarjeta de la categoría muestra nº de movimientos, importe y % del gasto total', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([EXPENSE_PARENT]);
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [
        {
          id: 't1',
          userId: 'user-1',
          type: 'EXPENSE',
          date: '2026-08-05',
          categoryId: 'cat-expense-1',
          subcategoryId: null,
          concept: 'Gasolina',
          merchant: null,
          amount: '30.00',
          paymentMethod: null,
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
        {
          id: 't2',
          userId: 'user-1',
          type: 'EXPENSE',
          date: '2026-08-10',
          categoryId: 'cat-expense-1',
          subcategoryId: null,
          concept: 'Peaje',
          merchant: null,
          amount: '20.00',
          paymentMethod: null,
          createdAt: '2026-08-10T00:00:00.000Z',
          updatedAt: '2026-08-10T00:00:00.000Z',
        },
      ],
      page: 1,
      limit: 200,
      totalItems: 2,
      summary: {
        total: '50.00',
        averagePerMonth: '50.00',
        byCategory: [{ categoryId: 'cat-expense-1', total: '50.00' }],
        bySubcategory: [],
      },
    });

    renderPage();

    expect(await screen.findByText('2 movimientos')).toBeInTheDocument();
    expect(screen.getByText(eur('50.00'))).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('sin gastos este mes, la tarjeta de la categoría muestra ceros en vez de ocultarse', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([EXPENSE_PARENT]);
    // `EMPTY_MONTH_RESULT` ya está montado por `beforeEach`.

    renderPage();

    expect(await screen.findByText('0 movimientos')).toBeInTheDocument();
    expect(screen.getByText(eur('0.00'))).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('sin conexión (T3.3, spec 011), muestra las categorías cacheadas y deshabilita crear/renombrar/eliminar', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const listSpy = vi.spyOn(categoriesApi, 'listCategories');
    await putCategories([INCOME_CATEGORY]);
    resetForTests(false);

    renderPage();

    expect(await screen.findByText('Nómina')).toBeInTheDocument();
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument();
    expect(listSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Crear categoría' })).toBeDisabled();
  });
});
