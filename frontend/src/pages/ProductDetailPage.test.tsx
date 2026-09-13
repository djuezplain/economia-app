import { render, screen, within } from '@testing-library/react';
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
  { receiptId: 'r1', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-04-01', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30' },
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

  it('cada fila de precio enlaza a su ticket', async () => {
    renderPage();

    const row = await screen.findByRole('row', { name: /Mercadona/ });
    expect(within(row).getByRole('link', { name: 'Ver ticket' })).toHaveAttribute('href', '/tickets/r1');
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

  it('sin ningún ticket con el producto, muestra un mensaje en vez de una tabla vacía, sin estadísticas', async () => {
    vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Todavía no tienes ningún ticket con este producto.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Estadísticas' })).not.toBeInTheDocument();
  });

  describe('solo el precio más reciente por defecto, con historial bajo un botón', () => {
    const TWO_DATES_SAME_SUPERMARKET: ProductPrice[] = [
      { receiptId: 'r1', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-03-01', unit: 'unidad', pricePerUnit: '1.200', amount: '1.20' },
      { receiptId: 'r2', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-04-01', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30' },
    ];

    it('por defecto muestra solo el precio más reciente de cada supermercado', async () => {
      vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue(TWO_DATES_SAME_SUPERMARKET);

      renderPage();
      await screen.findByRole('heading', { name: 'Chocolate Classic', level: 1 });

      const rows = await screen.findAllByRole('row', { name: /Mercadona/ });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent('2026-04-01');
      expect(rows[0]).toHaveTextContent('1.300');
    });

    it('el botón "Historial" muestra todas las fechas, y se puede volver a filtrar', async () => {
      vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue(TWO_DATES_SAME_SUPERMARKET);

      renderPage();
      await screen.findByRole('heading', { name: 'Chocolate Classic', level: 1 });

      await userEvent.click(screen.getByRole('button', { name: 'Historial' }));

      const historyRows = await screen.findAllByRole('row', { name: /Mercadona/ });
      expect(historyRows).toHaveLength(2);
      expect(historyRows.some((row) => row.textContent?.includes('2026-03-01'))).toBe(true);
      expect(historyRows.some((row) => row.textContent?.includes('2026-04-01'))).toBe(true);

      await userEvent.click(screen.getByRole('button', { name: 'Ver solo el precio más reciente' }));
      const filteredRows = await screen.findAllByRole('row', { name: /Mercadona/ });
      expect(filteredRows).toHaveLength(1);
    });
  });

  describe('estadísticas (spec 037, H1)', () => {
    const MULTI_SUPERMARKET_PRICES: ProductPrice[] = [
      { receiptId: 'r1', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-03-01', unit: 'unidad', pricePerUnit: '1.00', amount: '1.00' },
      { receiptId: 'r2', supermarketId: 's1', supermarketName: 'Mercadona', date: '2026-04-01', unit: 'unidad', pricePerUnit: '2.00', amount: '2.00' },
      { receiptId: 'r3', supermarketId: 's2', supermarketName: 'Carrefour', date: '2026-04-02', unit: 'unidad', pricePerUnit: '3.00', amount: '3.00' },
    ];

    it('calcula mínimo/medio/máximo, supermercado más barato de media, y gasto total', async () => {
      vi.spyOn(groceriesApi, 'getProductPrices').mockResolvedValue(MULTI_SUPERMARKET_PRICES);

      renderPage();

      const stats = await screen.findByRole('heading', { name: 'Estadísticas' });
      const list = stats.nextElementSibling as HTMLElement;
      // mínimo 1.00, medio (1+2+3)/3=2.00, máximo 3.00
      expect(list).toHaveTextContent('1.00 € / 2.00 € / 3.00 €');
      // Mercadona: media (1+2)/2 = 1.50 — más barata que Carrefour (3.00)
      expect(list).toHaveTextContent('Mercadona (1.50 €)');
      // gasto total 1+2+3 = 6.00, en 3 compras
      expect(list).toHaveTextContent('6.00 € en 3 compras');
    });
  });
});
