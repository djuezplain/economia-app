import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
};

const RECEIPTS: ReceiptSummary[] = [
  {
    id: 'r2',
    date: '2026-04-15',
    supermarketId: 's1',
    supermarketName: 'Mercadona',
    printedTotal: '20.00',
    linesTotal: '20.00',
    total: '20.00',
    transactionId: null,
    document: null,
  tags: [],
  hasNote: false,
  warrantyUntil: null,
  },
  {
    id: 'r1',
    date: '2026-04-01',
    supermarketId: 's1',
    supermarketName: 'Mercadona',
    printedTotal: '10.00',
    linesTotal: '10.00',
    total: '10.00',
    transactionId: null,
    document: null,
  tags: [],
  hasNote: false,
  warrantyUntil: null,
  },
];

describe('ReceiptsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(groceriesApi, 'listSupermarkets').mockResolvedValue([{ id: 's1', name: 'Mercadona' }]);
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([{ id: 'p1', name: 'Leche' }]);
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

  it('muestra las etiquetas de cada ticket y enlaza a la pantalla de etiquetas (spec 051 H1)', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([{ ...RECEIPTS[0], tags: [{ id: 't1', name: 'Garantía', color: 'blue' }] }, RECEIPTS[1]]);

    renderPage();

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Garantía');
    expect(screen.getByRole('link', { name: 'Etiquetas' })).toHaveAttribute('href', '/tickets/etiquetas');
  });

  it('indica los tickets con nota y su garantía (spec 051 H4 y H5)', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([{ ...RECEIPTS[0], hasNote: true, warrantyUntil: '2099-01-31' }, RECEIPTS[1]]);

    renderPage();

    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]).getByLabelText('con nota')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Garantía hasta el 31/01/2099');
    expect(within(items[1]).queryByLabelText('con nota')).not.toBeInTheDocument();
  });

  it('sin tickets importados, muestra un mensaje en vez de una lista vacía', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Todavía no has importado ningún ticket.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('muestra la suma de líneas junto al total impreso', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);

    renderPage();

    expect(await screen.findByText('20.00 €')).toBeInTheDocument();
    expect(screen.getAllByText('Mercadona').length).toBeGreaterThan(0);
  });

  describe('spec 040, H1: filtros', () => {
    it('filtrar por supermercado llama a listReceipts con el filtro', async () => {
      const listSpy = vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);

      renderPage();
      await screen.findAllByRole('listitem');

      await userEvent.selectOptions(screen.getByLabelText('Comercio'), 's1');

      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ supermarketId: 's1' }));
    });

    it('combina varios filtros a la vez', async () => {
      const listSpy = vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);

      renderPage();
      await screen.findAllByRole('listitem');

      await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p1');
      await userEvent.type(screen.getByLabelText('Desde'), '2026-01-01');
      await userEvent.type(screen.getByLabelText('Importe mínimo'), '5');

      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ productId: 'p1', dateFrom: '2026-01-01', amountMin: '5' }),
      );
    });

    it('sin resultados con filtros activos, muestra un mensaje distinto del de "sin tickets"', async () => {
      vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValueOnce(RECEIPTS).mockResolvedValueOnce([]);

      renderPage();
      await screen.findAllByRole('listitem');

      await userEvent.selectOptions(screen.getByLabelText('Comercio'), 's1');

      expect(await screen.findByText('No hay tickets con estos filtros.')).toBeInTheDocument();
      expect(screen.queryByText('Todavía no has importado ningún ticket.')).not.toBeInTheDocument();
    });

    it('"Limpiar filtros" vuelve a listar sin ningún filtro', async () => {
      const listSpy = vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);

      renderPage();
      await screen.findAllByRole('listitem');

      await userEvent.selectOptions(screen.getByLabelText('Comercio'), 's1');
      expect(await screen.findByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

      expect(listSpy).toHaveBeenLastCalledWith({
        supermarketId: undefined,
        productId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        amountMin: undefined,
        amountMax: undefined,
      });
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });
  });

  it('marca los tickets que tienen documento (spec 048)', async () => {
    vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([
      { ...RECEIPTS[0], document: { id: 'd1', mimeType: 'application/pdf', sizeBytes: 1000, pageCount: 1, originalFilename: 'f.pdf', hasText: false, textReadAt: null } },
      RECEIPTS[1],
    ]);
    renderPage();
    expect(await screen.findByLabelText('con PDF')).toBeInTheDocument();
    expect(screen.getAllByText('📎')).toHaveLength(1);
  });
});
