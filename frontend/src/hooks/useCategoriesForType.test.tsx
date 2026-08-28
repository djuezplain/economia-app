import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCategoriesForType } from './useCategoriesForType';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import type { Category, MovementType } from '../api/categories';
import { ApiError } from '../api/client';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

function category(id: string, type: MovementType, name: string): Category {
  return { id, userId: 'user-1', type, name, parentId: null, isDefault: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

function Probe({ type, label }: { type: MovementType; label: string }) {
  const { categories, categoriesError } = useCategoriesForType(type);
  return (
    <div>
      {categories === null && <p>{label}: cargando…</p>}
      {categories && (
        <ul aria-label={label}>
          {categories.map((c) => (
            <li key={c.id}>{c.name}</li>
          ))}
        </ul>
      )}
      {categoriesError && <p role="alert">{`${label}: ${categoriesError}`}</p>}
    </div>
  );
}

describe('useCategoriesForType', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  it('sin sesión, no llama a listCategories', () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const listCategories = vi.spyOn(categoriesApi, 'listCategories');

    render(
      <AuthProvider>
        <Probe type="EXPENSE" label="Gastos" />
      </AuthProvider>,
    );

    expect(listCategories).not.toHaveBeenCalled();
  });

  it('con sesión, carga las categorías del tipo indicado', async () => {
    vi.spyOn(categoriesApi, 'listCategories').mockImplementation((type) =>
      Promise.resolve(type === 'EXPENSE' ? [category('c1', 'EXPENSE', 'Ocio')] : [category('c2', 'INCOME', 'Nómina')]),
    );

    render(
      <AuthProvider>
        <Probe type="EXPENSE" label="Gastos" />
      </AuthProvider>,
    );

    expect(await screen.findByText('Ocio')).toBeInTheDocument();
  });

  it('dos instancias del hook a la vez (una por Gastos, otra por Ingresos) mantienen listas independientes', async () => {
    vi.spyOn(categoriesApi, 'listCategories').mockImplementation((type) =>
      Promise.resolve(type === 'EXPENSE' ? [category('c1', 'EXPENSE', 'Ocio')] : [category('c2', 'INCOME', 'Nómina')]),
    );

    render(
      <AuthProvider>
        <Probe type="EXPENSE" label="Gastos" />
        <Probe type="INCOME" label="Ingresos" />
      </AuthProvider>,
    );

    const expenseList = await screen.findByRole('list', { name: 'Gastos' });
    const incomeList = await screen.findByRole('list', { name: 'Ingresos' });
    expect(expenseList).toHaveTextContent('Ocio');
    expect(expenseList).not.toHaveTextContent('Nómina');
    expect(incomeList).toHaveTextContent('Nómina');
    expect(incomeList).not.toHaveTextContent('Ocio');
  });

  it('si cambia el tipo, vuelve a cargar las categorías de ese tipo', async () => {
    const listCategories = vi.spyOn(categoriesApi, 'listCategories').mockImplementation((type) =>
      Promise.resolve(type === 'EXPENSE' ? [category('c1', 'EXPENSE', 'Ocio')] : [category('c2', 'INCOME', 'Nómina')]),
    );

    const { rerender } = render(
      <AuthProvider>
        <Probe type="EXPENSE" label="Movimientos" />
      </AuthProvider>,
    );
    await screen.findByText('Ocio');

    rerender(
      <AuthProvider>
        <Probe type="INCOME" label="Movimientos" />
      </AuthProvider>,
    );

    expect(await screen.findByText('Nómina')).toBeInTheDocument();
    expect(listCategories).toHaveBeenCalledWith('EXPENSE');
    expect(listCategories).toHaveBeenCalledWith('INCOME');
  });

  it('si la carga falla, expone el mensaje de error', async () => {
    vi.spyOn(categoriesApi, 'listCategories').mockRejectedValue(new ApiError(500, 'No se han podido cargar.'));

    render(
      <AuthProvider>
        <Probe type="EXPENSE" label="Gastos" />
      </AuthProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('No se han podido cargar.');
  });
});
