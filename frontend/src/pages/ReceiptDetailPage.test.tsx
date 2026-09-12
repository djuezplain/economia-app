import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDetailPage } from './ReceiptDetailPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';

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

const RECEIPT: ReceiptDetail = {
  id: 'r1',
  date: '2026-04-01',
  supermarketId: 's1',
  supermarketName: 'Mercadona',
  printedTotal: '1.30',
  lines: [
    { id: 'l1', description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30', productId: 'p1', productName: 'Chocolate Classic' },
  ],
};

describe('ReceiptDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets/r1']}>
          <Routes>
            <Route path="/tickets/:id" element={<ReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('muestra el detalle con cada línea y el producto emparejado', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(RECEIPT);

    renderPage();

    expect(await screen.findByRole('heading', { name: /Mercadona/ })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /CHOCOLATE CLASSIC/ });
    expect(row).toHaveTextContent('Chocolate Classic');
    expect(row).toHaveTextContent('1.300');
  });
});
