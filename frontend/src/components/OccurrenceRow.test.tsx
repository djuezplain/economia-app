import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OccurrenceRow } from './OccurrenceRow';
import * as recurringApi from '../api/recurring-transactions';
import type { Occurrence } from '../api/recurring-transactions';
import type { Transaction } from '../api/transactions';

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    recurringId: 'rec-luz', date: '2026-08-10', status: 'PENDING', transactionId: null, type: 'EXPENSE',
    categoryId: 'cat-1', subcategoryId: null, concept: 'Luz', merchant: null, amount: '64.20',
    paymentMethod: null, estimated: false, ...overrides,
  };
}

function renderRow(o: Occurrence, onResolved = vi.fn()) {
  render(
    <ul>
      <OccurrenceRow occurrence={o} categories={[]} onResolved={onResolved} />
    </ul>,
  );
  return onResolved;
}

// Spec 049 H2 (criterios 3 y 4).
describe('OccurrenceRow — importe estimado', () => {
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.restoreAllMocks();
    confirm = vi.spyOn(recurringApi, 'confirmOccurrence').mockResolvedValue({} as Transaction);
  });

  it('marca el importe estimado con "≈"; uno fijo no', () => {
    renderRow(occurrence({ estimated: true }));
    expect(screen.getByLabelText('aproximadamente')).toHaveTextContent('≈');
    expect(screen.getByTitle('Importe estimado a partir de los últimos recibos')).toBeInTheDocument();
  });

  it('un importe fijo no lleva "≈" y se confirma con un solo clic, como en la spec 047', async () => {
    const onResolved = renderRow(occurrence());
    expect(screen.queryByLabelText('aproximadamente')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(confirm).toHaveBeenCalledWith('rec-luz', '2026-08-10', undefined);
    expect(onResolved).toHaveBeenCalled();
  });

  it('en un estimado, el primer clic pone el foco en el importe y pide revisarlo sin llamar a la API', async () => {
    renderRow(occurrence({ estimated: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Importe real de Luz')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('revisa el importe real');
    expect(screen.getByRole('button', { name: 'Confirmar importe' })).toBeInTheDocument();
  });

  it('el segundo clic confirma enviando siempre el importe, aunque no se haya cambiado', async () => {
    renderRow(occurrence({ estimated: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importe' }));
    expect(confirm).toHaveBeenCalledWith('rec-luz', '2026-08-10', '64.20');
  });

  it('confirma con el importe corregido', async () => {
    renderRow(occurrence({ estimated: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const input = screen.getByLabelText('Importe real de Luz');
    await userEvent.clear(input);
    await userEvent.type(input, '71.85');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importe' }));
    expect(confirm).toHaveBeenCalledWith('rec-luz', '2026-08-10', '71.85');
  });
});
