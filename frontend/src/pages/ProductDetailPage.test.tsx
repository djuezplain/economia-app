import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductDetailPage } from './ProductDetailPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import type { Product, ProductPrice } from '../api/groceries';
import { ApiError } from '../api/client';

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

const PRODUCT: Product = { id: 'p1', name: 'Chocolate Classic' };
const PRICES: ProductPrice[] = [
  { receiptId: 'r1', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-04-01', unit: 'unidad', pricePerUnit: '1.300' },
];

describe('ProductDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(groceriesApi, 'getProduct').mockResolvedValue(PRODUCT);
    vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue(PRICES);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/productos/p1']}>
          <Routes>
            <Route path="/tickets/productos/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('muestra el nombre y la tabla de precios por supermercado', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chocolate Classic', level: 1 })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Mercadona/ });
    expect(row).toHaveTextContent('1.300');
  });

  it('editar el nombre y guardar llama a updateProduct', async () => {
    const updateSpy = vi.spyOn(groceriesApi, 'updateProduct').mockResolvedValue({ id: 'p1', name: 'Chocolate Classic Corregido' });

    renderPage();
    await screen.findByRole('heading', { name: 'Chocolate Classic', level: 1 });

    const nameInput = screen.getByLabelText('Nombre');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Chocolate Classic Corregido');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(updateSpy).toHaveBeenCalledWith('p1', 'Chocolate Classic Corregido');
    expect(await screen.findByRole('heading', { name: 'Chocolate Classic Corregido', level: 1 })).toBeInTheDocument();
  });

  it('un 409 del backend se muestra sin perder el valor editado', async () => {
    vi.spyOn(groceriesApi, 'updateProduct').mockRejectedValue(new ApiError(409, 'Ya tienes otro producto con ese nombre.'));

    renderPage();
    await screen.findByRole('heading', { name: 'Chocolate Classic', level: 1 });

    const nameInput = screen.getByLabelText('Nombre');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Nachos');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes otro producto con ese nombre.');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Nachos');
  });

  it('sin ningún ticket con el producto, muestra un mensaje en vez de una tabla vacía', async () => {
    vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Todavía no tienes ningún ticket con este producto.')).toBeInTheDocument();
  });
});
