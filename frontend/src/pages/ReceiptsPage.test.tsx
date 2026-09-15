import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsPage } from './ReceiptsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import type { ReceiptSummary } from '../api/groceries';

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

const RECEIPTS: ReceiptSummary[] = [
  {
    id: 'r2',
    date: '2026-04-15',
    supermarketId: 's1',
    supermarketName: 'Mercadona',
    printedTotal: '20.00',
    linesTotal: '20.00',
  },
  {
    id: 'r1',
    date: '2026-04-01',
    supermarketId: 's1',
    supermarketName: 'Mercadona',
    printedTotal: '10.00',
    linesTotal: '10.00',
  },
];

describe('ReceiptsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tickets']}>
          <ReceiptsPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('lista los tickets ya ordenados tal como los devuelve la API, con enlace a cada uno', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);

    renderPage();

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('2026-04-15');
    expect(items[1]).toHaveTextContent('2026-04-01');
    expect(screen.getByRole('link', { name: '2026-04-15' })).toHaveAttribute('href', '/tickets/r2');
  });

  it('sin tickets importados, muestra un mensaje en vez de una lista vacía', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Todavía no has importado ningún ticket.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
