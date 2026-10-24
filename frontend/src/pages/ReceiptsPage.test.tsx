import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsPage } from './ReceiptsPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as groceriesApi from '../api/groceries';
import * as tagsApi from '../api/receipt-tags';
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
    vi.spyOn(tagsApi, 'listReceiptTags').mockResolvedValue([
      { id: 't1', name: 'Garantía', color: 'blue', receiptCount: 2 },
      { id: 't2', name: 'Hogar', color: null, receiptCount: 1 },
    ]);
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

  describe('buscador y filtros de la spec 051', () => {
    it('busca lo escrito tras una pequeña espera, con una sola petición por búsqueda', async () => {
      const listSpy = vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);
      renderPage();
      await screen.findAllByRole('listitem');
      listSpy.mockClear();

      await userEvent.type(screen.getByLabelText('Buscar tickets'), 'lavadora');
      await vi.waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ q: 'lavadora' })));
      expect(listSpy.mock.calls.filter(([filters]) => filters?.q !== undefined)).toHaveLength(1);
    });

    it('cada resultado indica dónde ha coincidido, con el fragmento', async () => {
      vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([
        { ...RECEIPTS[0], match: { field: 'document', snippet: '…LAVADORA BOSCH SERIE 6…' } },
        { ...RECEIPTS[1], match: { field: 'merchant', snippet: null } },
      ]);
      renderPage();
      const items = await screen.findAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Coincide en el documento: «…LAVADORA BOSCH SERIE 6…»');
      expect(items[1]).not.toHaveTextContent('Coincide en');
    });

    it('filtra por etiquetas (todas las marcadas) y por garantía; "Limpiar filtros" lo quita todo', async () => {
      const listSpy = vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);
      renderPage();
      const group = await screen.findByRole('group', { name: 'Filtrar por etiquetas' });
      const garantia = within(group).getAllByRole('button')[0];

      await userEvent.click(garantia);
      expect(garantia).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(within(group).getAllByRole('button')[1]);
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: ['t1', 't2'] }));

      await userEvent.selectOptions(screen.getByLabelText('Garantía'), 'Caduca en los próximos 30 días');
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: ['t1', 't2'], warranty: 'expiring' }));

      await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ tagIds: undefined, warranty: undefined, q: undefined }));
      expect(garantia).toHaveAttribute('aria-pressed', 'false');
    });

    it('con una búsqueda sin resultados, lo dice', async () => {
      vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([]);
      renderPage();
      await userEvent.type(await screen.findByLabelText('Buscar tickets'), 'secadora');
      expect(await screen.findByText('No hay tickets con estos filtros.')).toBeInTheDocument();
    });
  });

  describe('galería (spec 051 H6)', () => {
    beforeEach(() => {
      window.localStorage.clear();
      URL.createObjectURL = vi.fn(() => 'blob:miniatura');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(groceriesApi, 'getReceiptThumbnail').mockResolvedValue(new Blob(['x']));
    });

    it('cambia a galería, con cada ticket enlazado a su detalle, y lo recuerda en el dispositivo', async () => {
      vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue([{ ...RECEIPTS[0], tags: [{ id: 't1', name: 'Garantía', color: 'blue' }] }, RECEIPTS[1]]);
      const { unmount } = renderPage();
      await screen.findAllByRole('listitem');
      expect(screen.getByRole('radio', { name: 'Lista' })).toBeChecked();

      await userEvent.click(screen.getByRole('radio', { name: 'Galería' }));
      const gallery = screen.getByRole('list', { name: 'Galería de tickets' });
      const cards = within(gallery).getAllByRole('link');
      expect(cards[0]).toHaveAttribute('href', '/tickets/r2');
      expect(cards[0]).toHaveAccessibleName('Mercadona, 15/04/2026');
      expect(within(gallery).getByText('Garantía')).toBeInTheDocument();
      expect(window.localStorage.getItem('receipts-view')).toBe('gallery');

      unmount();
      renderPage();
      expect(await screen.findByRole('list', { name: 'Galería de tickets' })).toBeInTheDocument();
    });

    it('si el almacenamiento no está disponible, la vista funciona igual', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('bloqueado');
      });
      vi.spyOn(groceriesApi, 'listReceipts').mockResolvedValue(RECEIPTS);
      renderPage();
      await userEvent.click(await screen.findByRole('radio', { name: 'Galería' }));
      expect(screen.getByRole('list', { name: 'Galería de tickets' })).toBeInTheDocument();
    });
  });
});
