import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShoppingListsPage } from './ShoppingListsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as shoppingListsApi from '../api/shopping-lists';
import type { ShoppingListSummary } from '../api/shopping-lists';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
};

const LISTS: ShoppingListSummary[] = [
  { id: 'l1', name: 'Compra semanal', itemCount: 3, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'l2', name: 'Básicos', itemCount: 0, createdAt: '2026-01-02T00:00:00.000Z' },
];

describe('ShoppingListsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/cesta']}>
          <ShoppingListsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('lista las listas de la compra con su nº de productos y enlace al detalle', async () => {
    vi.spyOn(shoppingListsApi, 'listShoppingLists').mockResolvedValue(LISTS);

    renderPage();

    expect(await screen.findByRole('link', { name: 'Compra semanal' })).toHaveAttribute('href', '/tickets/cesta/l1');
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Básicos' })).toHaveAttribute('href', '/tickets/cesta/l2');
  });

  it('sin listas todavía, muestra un mensaje claro', async () => {
    vi.spyOn(shoppingListsApi, 'listShoppingLists').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Todavía no tienes ninguna lista de la compra.')).toBeInTheDocument();
  });

  it('crea una lista nueva y la muestra en el listado', async () => {
    vi.spyOn(shoppingListsApi, 'listShoppingLists').mockResolvedValue([]);
    vi.spyOn(shoppingListsApi, 'createShoppingList').mockResolvedValue({
      id: 'l3',
      name: 'Compra del finde',
      itemCount: 0,
      createdAt: '2026-01-03T00:00:00.000Z',
    });

    renderPage();
    await screen.findByText('Todavía no tienes ninguna lista de la compra.');

    await userEvent.type(screen.getByLabelText('Nueva lista'), 'Compra del finde');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lista' }));

    expect(shoppingListsApi.createShoppingList).toHaveBeenCalledWith('Compra del finde');
    expect(await screen.findByRole('link', { name: 'Compra del finde' })).toBeInTheDocument();
  });

  it('borra una lista tras confirmar', async () => {
    vi.spyOn(shoppingListsApi, 'listShoppingLists').mockResolvedValue(LISTS);
    vi.spyOn(shoppingListsApi, 'deleteShoppingList').mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('link', { name: 'Compra semanal' });

    const [borrarSemanal] = screen.getAllByRole('button', { name: 'Borrar' });
    await userEvent.click(borrarSemanal);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }));

    expect(shoppingListsApi.deleteShoppingList).toHaveBeenCalledWith('l1');
    expect(screen.queryByRole('link', { name: 'Compra semanal' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Básicos' })).toBeInTheDocument();
  });
});
