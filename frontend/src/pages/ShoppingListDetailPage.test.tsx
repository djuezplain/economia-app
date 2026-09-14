import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShoppingListDetailPage } from './ShoppingListDetailPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as shoppingListsApi from '../api/shopping-lists';
import type { ShoppingListDetail } from '../api/shopping-lists';
import * as groceriesApi from '../api/groceries';
import type { Product } from '../api/groceries';

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'diego@example.com',
  name: 'Diego',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

const LIST: ShoppingListDetail = {
  id: 'l1',
  name: 'Compra semanal',
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [{ id: 'i1', productId: 'p1', productName: 'Leche' }],
};

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Leche' },
  { id: 'p2', name: 'Pan' },
];

describe('ShoppingListDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/cesta/l1']}>
          <Routes>
            <Route path="/tickets/cesta/:id" element={<ShoppingListDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('carga la lista y muestra sus productos', async () => {
    vi.spyOn(shoppingListsApi, 'getShoppingList').mockResolvedValue(LIST);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Compra semanal' })).toBeInTheDocument();
    expect(screen.getByText('Leche')).toBeInTheDocument();
  });

  it('añadir un producto excluye los ya presentes en la lista y lo muestra tras añadirlo', async () => {
    vi.spyOn(shoppingListsApi, 'getShoppingList').mockResolvedValue(LIST);
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue(PRODUCTS);
    vi.spyOn(shoppingListsApi, 'addShoppingListItem').mockResolvedValue({ id: 'i2', productId: 'p2', productName: 'Pan' });

    renderPage();
    await screen.findByRole('heading', { name: 'Compra semanal' });

    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    // "Leche" ya está en la lista: no debe ofrecerse para añadir de nuevo.
    expect(await screen.findByRole('button', { name: 'Añadir' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Añadir' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(shoppingListsApi.addShoppingListItem).toHaveBeenCalledWith('l1', 'p2');
    await screen.findByText('Pan');
    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  });

  it('quitar un producto lo elimina de la lista', async () => {
    vi.spyOn(shoppingListsApi, 'getShoppingList').mockResolvedValue(LIST);
    vi.spyOn(shoppingListsApi, 'removeShoppingListItem').mockResolvedValue(undefined);

    renderPage();
    await screen.findByText('Leche');

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(shoppingListsApi.removeShoppingListItem).toHaveBeenCalledWith('l1', 'i1');
    expect(await screen.findByText('Todavía no has añadido ningún producto a esta lista.')).toBeInTheDocument();
  });

  it('renombra la lista', async () => {
    vi.spyOn(shoppingListsApi, 'getShoppingList').mockResolvedValue(LIST);
    vi.spyOn(shoppingListsApi, 'renameShoppingList').mockResolvedValue({ id: 'l1', name: 'Compra del finde', itemCount: 1, createdAt: LIST.createdAt });

    renderPage();
    await screen.findByRole('heading', { name: 'Compra semanal' });

    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Compra del finde');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(shoppingListsApi.renameShoppingList).toHaveBeenCalledWith('l1', 'Compra del finde');
    expect(await screen.findByRole('heading', { name: 'Compra del finde' })).toBeInTheDocument();
  });
});
