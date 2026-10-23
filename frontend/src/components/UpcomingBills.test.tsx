import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpcomingBills } from './UpcomingBills';
import * as recurringApi from '../api/recurring-transactions';
import type { Occurrence } from '../api/recurring-transactions';
import { ApiError } from '../api/client';

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    recurringId: 'rec-1', date: '2026-10-26', status: 'PENDING', transactionId: null, type: 'EXPENSE', categoryId: 'cat-1',
    subcategoryId: null, concept: 'Seguro hogar', merchant: null, amount: '30.00', estimated: false, paymentMethod: null,
    ...overrides,
  };
}

function renderBills() {
  return render(
    <MemoryRouter>
      <UpcomingBills />
    </MemoryRouter>,
  );
}

// Spec 049 H1 criterio 5.
describe('UpcomingBills', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('pide los 90 días anteriores y los 7 siguientes', async () => {
    const list = vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
    renderBills();
    await screen.findByRole('region', { name: 'Próximos recibos' });
    expect(list).toHaveBeenCalledWith('2026-07-25', '2026-10-30');
  });

  it('muestra primero las vencidas, marcadas, y luego las próximas por fecha; ignora las resueltas', async () => {
    vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([
      occurrence({ recurringId: 'a', concept: 'Agua', date: '2026-10-28' }),
      occurrence({ recurringId: 'b', concept: 'Gimnasio', date: '2026-10-25' }),
      occurrence({ recurringId: 'c', concept: 'Alquiler', date: '2026-10-01', status: 'OVERDUE' }),
      occurrence({ recurringId: 'd', concept: 'Seguro confirmado', date: '2026-10-24', status: 'CONFIRMED' }),
      occurrence({ recurringId: 'e', concept: 'Luz conciliada', date: '2026-10-20', status: 'RECONCILED' }),
    ]);
    renderBills();

    const items = within(await screen.findByRole('region', { name: 'Próximos recibos' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Alquiler'),
      expect.stringContaining('Gimnasio'),
      expect.stringContaining('Agua'),
    ]);
    expect(within(items[0]).getByText('vencido')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Alquiler|Gimnasio|Agua/ })[0]).toHaveAttribute('href', '/recurring');
  });

  it('marca los importes estimados con "≈"', async () => {
    vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence({ concept: 'Luz', estimated: true, amount: '64.20' })]);
    renderBills();
    expect(await screen.findByText(/≈/)).toHaveClass('amount-estimated');
  });

  it('sin ocurrencias abiertas no pinta nada', async () => {
    const list = vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence({ status: 'SKIPPED' })]);
    const { container } = renderBills();
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('si falla la carga no pinta nada (ni un error)', async () => {
    const list = vi.spyOn(recurringApi, 'listOccurrences').mockRejectedValue(new ApiError(500, 'Error'));
    const { container } = renderBills();
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
