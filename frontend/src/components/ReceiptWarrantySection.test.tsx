import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptWarrantySection } from './ReceiptWarrantySection';
import * as groceriesApi from '../api/groceries';
import type { ReceiptDetail } from '../api/groceries';

const detail = (warrantyUntil: string | null) => ({ id: 'r1', warrantyUntil }) as ReceiptDetail;

describe('ReceiptWarrantySection (spec 051 H5 criterio 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 24, 12));
  });
  afterEach(() => vi.useRealTimers());

  function renderSection(warrantyUntil: string | null, onChanged = vi.fn()) {
    render(<ReceiptWarrantySection receiptId="r1" receiptDate="2026-10-15" warrantyUntil={warrantyUntil} onChanged={onChanged} />);
    return onChanged;
  }

  it('los atajos guardan la fecha del ticket más 2 o 3 años', async () => {
    const update = vi.spyOn(groceriesApi, 'updateReceiptDetails').mockResolvedValue(detail('2028-10-15'));
    const onChanged = renderSection(null);
    expect(screen.getByText(/Sin fecha de garantía/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+2 años' }));
    expect(update).toHaveBeenLastCalledWith('r1', { warrantyUntil: '2028-10-15' });
    expect(onChanged).toHaveBeenCalledWith(detail('2028-10-15'));
    await userEvent.click(screen.getByRole('button', { name: '+3 años' }));
    expect(update).toHaveBeenLastCalledWith('r1', { warrantyUntil: '2029-10-15' });
  });

  it('elegir una fecha la guarda; "Quitar" la quita', async () => {
    const update = vi.spyOn(groceriesApi, 'updateReceiptDetails').mockResolvedValue(detail(null));
    renderSection('2028-10-15');
    fireEvent.change(screen.getByLabelText('Fin de la garantía'), { target: { value: '2027-06-30' } });
    expect(update).toHaveBeenLastCalledWith('r1', { warrantyUntil: '2027-06-30' });
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(update).toHaveBeenLastCalledWith('r1', { warrantyUntil: null });
  });

  it('indica si está vigente, si caduca pronto o si ha caducado', () => {
    const { unmount } = render(<ReceiptWarrantySection receiptId="r1" receiptDate="2026-10-15" warrantyUntil="2028-10-15" onChanged={vi.fn()} />);
    expect(screen.getByText(/Garantía hasta el 15\/10\/2028/)).toBeInTheDocument();
    unmount();
    renderSection('2026-11-03');
    expect(screen.getByText(/La garantía caduca en 10 días/)).toHaveClass('warranty-expiring');
  });
});
