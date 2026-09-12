import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPricesPage } from './ProductPricesPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import type { Product, ProductPrice } from '../api/groceries';

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

const LECHE: Product = { id: 'p1', name: 'Leche' };

const PRICES: ProductPrice[] = [
  { receiptId: 'r1', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-04-01', unit: 'unidad', pricePerUnit: '0.950' },
  { receiptId: 'r2', supermarketId: 's2', supermarketName: 'Carrefour', date: '2026-04-02', unit: 'unidad', pricePerUnit: '1.200' },
];

describe('ProductPricesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/productos']}>
          <ProductPricesPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('buscar sin resultados muestra un mensaje claro', async () => {
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([]);

    renderPage();
    await userEvent.type(await screen.findByLabelText('Producto'), 'inexistente');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No se ha encontrado ningún producto con ese nombre.')).toBeInTheDocument();
  });

  it('selecciona un producto y pinta la tabla de precios ordenada por precio', async () => {
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([LECHE]);
    vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue(PRICES);

    renderPage();
    await userEvent.type(await screen.findByLabelText('Producto'), 'leche');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Leche' }));

    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveTextContent('Mercadona');
    expect(rows[2]).toHaveTextContent('Carrefour');
  });
});
