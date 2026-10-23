import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  hasPassword: true, recurringReminderEmails: true,
};

const RECEIPT: ReceiptDetail = {
  id: 'r1',
  date: '2026-04-01',
  supermarketId: 's1',
  supermarketName: 'Mercadona',
  printedTotal: '1.30',
  linesTotal: '1.30',
  total: '1.30',
  transactionId: null,
  document: null,
  lines: [
    { id: 'l1', description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30', productId: 'p1', productName: 'Chocolate Classic' },
  ],
};

describe('ReceiptDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(PROFILE);
    vi.spyOn(groceriesApi, 'listSupermarkets').mockResolvedValue([{ id: 's1', name: 'Mercadona' }]);
    vi.spyOn(groceriesApi, 'searchProducts').mockResolvedValue([{ id: 'p1', name: 'Chocolate Classic' }]);
    // Spec 048 H3: la sección "Movimiento" pide candidatos al cargar.
    vi.spyOn(groceriesApi, 'getLinkCandidates').mockResolvedValue([]);
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

  it('en una línea a peso (kg) muestra el importe en la columna de precio/unidad, no el precio por kg', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue({
      ...RECEIPT,
      lines: [
        { id: 'l1', description: 'CHOCOLATE CLASSIC', quantity: '1', unit: 'unidad', pricePerUnit: '1.300', amount: '1.30', productId: 'p1', productName: 'Chocolate Classic' },
        { id: 'l2', description: 'PLATANO', quantity: '0.850', unit: 'kg', pricePerUnit: '1.99', amount: '1.69', productId: 'p2', productName: 'Plátano' },
      ],
    });

    renderPage();
    await screen.findByRole('heading', { name: /Mercadona/ });

    const unidadRow = screen.getByRole('row', { name: /CHOCOLATE CLASSIC/ });
    expect(unidadRow).toHaveTextContent('1.300 €');

    const kgRow = screen.getByRole('row', { name: /PLATANO/ });
    expect(kgRow).not.toHaveTextContent('1.99 €');
    const amountCells = [...kgRow.querySelectorAll('td')].filter((cell) => cell.textContent === '1.69 €');
    expect(amountCells).toHaveLength(2);
  });

  it('editar, cambiar un campo y guardar llama a updateReceipt con el payload correcto', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(RECEIPT);
    const updateSpy = vi.spyOn(groceriesApi, 'updateReceipt').mockResolvedValue({ ...RECEIPT, printedTotal: '2.00' });

    renderPage();
    await screen.findByRole('heading', { name: /Mercadona/ });

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(await screen.findByRole('heading', { name: 'Editar ticket' })).toBeInTheDocument();

    const totalInput = screen.getByLabelText('Total impreso en el ticket');
    await userEvent.clear(totalInput);
    await userEvent.type(totalInput, '2.00');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(updateSpy).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        printedTotal: '2.00',
        lines: [expect.objectContaining({ description: 'CHOCOLATE CLASSIC', product: { id: 'p1' } })],
      }),
    );
    expect(await screen.findByRole('heading', { name: /Mercadona/ })).toBeInTheDocument();
  });

  it('cancelar la edición no llama a updateReceipt', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(RECEIPT);
    const updateSpy = vi.spyOn(groceriesApi, 'updateReceipt');

    renderPage();
    await screen.findByRole('heading', { name: /Mercadona/ });
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByRole('heading', { name: 'Editar ticket' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('heading', { name: /Mercadona/ })).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('borrar pide confirmación antes de llamar a deleteReceipt', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(RECEIPT);
    const deleteSpy = vi.spyOn(groceriesApi, 'deleteReceipt').mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole('heading', { name: /Mercadona/ });

    await userEvent.click(screen.getByRole('button', { name: 'Borrar ticket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('¿Seguro que quieres borrar');
    expect(deleteSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }));
    expect(deleteSpy).toHaveBeenCalledWith('r1');
  });

  it('cancelar la confirmación de borrado no borra nada', async () => {
    vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(RECEIPT);
    const deleteSpy = vi.spyOn(groceriesApi, 'deleteReceipt');

    renderPage();
    await screen.findByRole('heading', { name: /Mercadona/ });

    await userEvent.click(screen.getByRole('button', { name: 'Borrar ticket' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  describe('cualquier comercio (spec 048 H2)', () => {
    const FACTURA: ReceiptDetail = { ...RECEIPT, supermarketName: 'Iberdrola', printedTotal: '64.20', linesTotal: '0.00', total: '64.20', lines: [] };

    it('una factura sin desglose muestra su total y no pinta la tabla de líneas', async () => {
      vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue(FACTURA);
      renderPage();
      expect(await screen.findByText(/Total: 64.20 €/)).toBeInTheDocument();
      expect(screen.getByText('Sin desglose por líneas.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('una línea sin producto se muestra como tal y se edita con "— Sin producto —" elegido', async () => {
      const update = vi.spyOn(groceriesApi, 'updateReceipt').mockResolvedValue(RECEIPT);
      vi.spyOn(groceriesApi, 'getReceipt').mockResolvedValue({
        ...RECEIPT,
        lines: [{ ...RECEIPT.lines[0], productId: null, productName: null }],
      });
      renderPage();
      expect(await screen.findByText('Sin producto')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
      expect(screen.getByLabelText('Producto')).toHaveValue('__sin-producto__');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect(update).toHaveBeenCalledWith('r1', expect.objectContaining({ lines: [expect.objectContaining({ product: null })] }));
    });
  });
});
