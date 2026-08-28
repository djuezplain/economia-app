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

describe('CategoriesPage', () => {
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

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith({ type: 'EXPENSE', name: 'Transporte', parentId: undefined }));
    expect(await screen.findAllByText('Transporte')).not.toHaveLength(0);
  });

  it('renombra una categoría existente', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories')
      .mockResolvedValueOnce([INCOME_CATEGORY])
      .mockResolvedValueOnce([{ ...INCOME_CATEGORY, name: 'Salario' }]);
    const renameSpy = vi.spyOn(categoriesApi, 'renameCategory').mockResolvedValue({ ...INCOME_CATEGORY, name: 'Salario' });

    renderPage();
    await screen.findByText('Nómina');

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nuevo nombre');
    await userEvent.clear(input);
    await userEvent.type(input, 'Salario');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(renameSpy).toHaveBeenCalledWith('cat-income-1', 'Salario'));
    expect(await screen.findByText('Salario')).toBeInTheDocument();
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
});
