import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptMovementSection } from './ReceiptMovementSection';
import * as groceriesApi from '../api/groceries';
import * as transactionsApi from '../api/transactions';
import type { Transaction } from '../api/transactions';
import type { ReceiptDetail } from '../api/groceries';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'm1', userId: 'u1', type: 'EXPENSE', date: '2026-10-15', categoryId: 'c1', subcategoryId: null,
    concept: 'COMPRA MERCADONA', merchant: 'Mercadona', amount: '39.27', paymentMethod: 'CARD',
    createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', receiptId: null, ...overrides,
  };
}

function renderSection(transactionId: string | null, onChanged = vi.fn()) {
  render(
    <MemoryRouter>
      <ReceiptMovementSection receiptId="r1" receiptDate="2026-10-15" transactionId={transactionId} onChanged={onChanged} />
    </MemoryRouter>,
  );
  return onChanged;
}

// Spec 048 H3.
describe('ReceiptMovementSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sin enlace, sugiere candidatos y enlaza el elegido', async () => {
    vi.spyOn(groceriesApi, 'getLinkCandidates').mockResolvedValue([tx()]);
    const link = vi.spyOn(groceriesApi, 'linkReceiptTransaction').mockResolvedValue({} as ReceiptDetail);
    const onChanged = renderSection(null);

    expect(await screen.findByText('Este gasto parece corresponder al ticket:')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Enlazar con COMPRA MERCADONA/ }));
    expect(link).toHaveBeenCalledWith('r1', 'm1');
    expect(onChanged).toHaveBeenCalledWith('m1');
  });

  it('sin candidatos lo dice, ofrece buscar y nunca ofrece crear un movimiento', async () => {
    vi.spyOn(groceriesApi, 'getLinkCandidates').mockResolvedValue([]);
    renderSection(null);

    expect(await screen.findByText(/No hay ningún gasto con este importe cerca de esta fecha/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Buscar un movimiento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear|registrar/i })).not.toBeInTheDocument();
  });

  it('el buscador usa GET /transactions con gastos, texto y fechas ±15 días; un gasto con otro ticket no se puede enlazar', async () => {
    vi.spyOn(groceriesApi, 'getLinkCandidates').mockResolvedValue([]);
    const list = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [tx({ id: 'libre', concept: 'TARJETA 1234' }), tx({ id: 'ocupado', concept: 'OTRA COMPRA', receiptId: 'r-otro' })],
      page: 1, limit: 20, totalItems: 2,
      summary: { total: '0', averagePerMonth: null, byCategory: [], bySubcategory: [] },
    });
    renderSection(null);

    await userEvent.type(await screen.findByLabelText('Concepto'), 'tarjeta');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(list).toHaveBeenCalledWith({ type: 'EXPENSE', q: 'tarjeta', dateFrom: '2026-09-30', dateTo: '2026-10-30', limit: 20 });
    const results = await screen.findByRole('list', { name: 'Resultados de la búsqueda' });
    expect(within(results).getByRole('button', { name: /Enlazar con TARJETA 1234/ })).toBeInTheDocument();
    expect(within(results).getByText('ya tiene otro ticket')).toBeInTheDocument();
  });

  it('enlazado: muestra el movimiento, enlaza a su edición y permite quitar el enlace', async () => {
    vi.spyOn(transactionsApi, 'getTransaction').mockResolvedValue(tx({ receiptId: 'r1' }));
    const unlink = vi.spyOn(groceriesApi, 'unlinkReceiptTransaction').mockResolvedValue(undefined);
    const onChanged = renderSection('m1');

    expect(await screen.findByText(/COMPRA MERCADONA/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver el movimiento' })).toHaveAttribute('href', '/movements/register/m1');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar enlace' }));
    expect(unlink).toHaveBeenCalledWith('r1');
    expect(onChanged).toHaveBeenCalledWith(null);
  });
});
