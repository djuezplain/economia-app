import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationPanel } from './ReconciliationPanel';
import * as recurringApi from '../api/recurring-transactions';
import type { OpenOccurrence, ReconciliationOverview } from '../api/recurring-transactions';
import type { Transaction } from '../api/transactions';
import { ApiError } from '../api/client';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1', userId: 'user-1', type: 'EXPENSE', date: '2026-10-02', categoryId: 'cat-1', subcategoryId: null,
    concept: 'RECIBO ALQUILER', merchant: 'Banco', amount: '800.00', paymentMethod: 'DIRECT_DEBIT',
    createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', ...overrides,
  };
}

function open(overrides: Partial<OpenOccurrence> = {}): OpenOccurrence {
  return {
    recurringId: 'rec-1', date: '2026-10-01', status: 'OVERDUE', type: 'EXPENSE', categoryId: 'cat-1',
    expectedAmount: '800.00', variableAmount: false, concept: 'Alquiler', merchant: null, ...overrides,
  };
}

const EMPTY: ReconciliationOverview = { suggestions: [], possibleDuplicates: [], recentlyReconciled: [] };

function renderPanel(overview: Partial<ReconciliationOverview>) {
  const onChanged = vi.fn();
  render(<ReconciliationPanel overview={{ ...EMPTY, ...overview }} onChanged={onChanged} />);
  return onChanged;
}

// Spec 049 H3 (criterios 3, 5, 7, 8).
describe('ReconciliationPanel', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sin nada que mostrar no pinta ninguna sección', () => {
    renderPanel({});
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  describe('sugerencias', () => {
    it('elegir un candidato concilia con él y avisa a la página', async () => {
      const reconcile = vi.spyOn(recurringApi, 'reconcileOccurrence').mockResolvedValue(undefined);
      const onChanged = renderPanel({ suggestions: [{ occurrence: open(), candidates: [tx()] }] });

      const section = screen.getByRole('region', { name: 'Por conciliar' });
      expect(within(section).getByText(/RECIBO ALQUILER/)).toBeInTheDocument();
      await userEvent.click(within(section).getByRole('button', { name: /Conciliar Alquiler/ }));
      expect(reconcile).toHaveBeenCalledWith('rec-1', '2026-10-01', 'tx-1');
      expect(onChanged).toHaveBeenCalled();
    });

    it('"Ninguno de estos" descarta todos los candidatos mostrados', async () => {
      const dismiss = vi.spyOn(recurringApi, 'dismissCandidate').mockResolvedValue(undefined);
      renderPanel({ suggestions: [{ occurrence: open(), candidates: [tx({ id: 'a' }), tx({ id: 'b', date: '2026-09-29' })] }] });

      await userEvent.click(screen.getByRole('button', { name: 'Ninguno de estos' }));
      expect(dismiss).toHaveBeenCalledTimes(2);
      expect(dismiss).toHaveBeenCalledWith('rec-1', '2026-10-01', 'a');
      expect(dismiss).toHaveBeenCalledWith('rec-1', '2026-10-01', 'b');
    });

    it('con un solo candidato el botón dice "No es este"', () => {
      renderPanel({ suggestions: [{ occurrence: open(), candidates: [tx()] }] });
      expect(screen.getByRole('button', { name: 'No es este' })).toBeInTheDocument();
    });

    it('un recibo variable muestra el importe previsto como estimado', () => {
      renderPanel({ suggestions: [{ occurrence: open({ variableAmount: true, expectedAmount: '64.20' }), candidates: [tx()] }] });
      expect(screen.getByText(/≈/)).toHaveClass('amount-estimated');
    });

    it('muestra el error del servidor', async () => {
      vi.spyOn(recurringApi, 'reconcileOccurrence').mockRejectedValue(new ApiError(409, 'Esta ocurrencia ya está resuelta.'));
      const onChanged = renderPanel({ suggestions: [{ occurrence: open(), candidates: [tx()] }] });
      await userEvent.click(screen.getByRole('button', { name: /Conciliar Alquiler/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Esta ocurrencia ya está resuelta.');
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('posibles duplicados', () => {
    const duplicate = {
      recurringId: 'rec-1', date: '2026-01-01', concept: 'Alquiler',
      createdTransaction: tx({ id: 'creado', concept: 'Alquiler', date: '2026-01-01', merchant: null }),
      candidates: [tx({ id: 'importado', date: '2026-01-02' })],
    };

    it('muestra el creado y el importado lado a lado', () => {
      renderPanel({ possibleDuplicates: [duplicate] });
      const item = screen.getByRole('listitem', { name: /Posible duplicado de Alquiler/ });
      expect(within(item).getByText(/Creado al confirmar/)).toBeInTheDocument();
      expect(within(item).getByText(/RECIBO ALQUILER/)).toBeInTheDocument();
    });

    it('"Quedarme con el importado" pide confirmación; si se cancela no llama a la API', async () => {
      const resolve = vi.spyOn(recurringApi, 'resolveDuplicate').mockResolvedValue(undefined);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderPanel({ possibleDuplicates: [duplicate] });

      await userEvent.click(screen.getByRole('button', { name: 'Quedarme con el importado' }));
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Se borrará el movimiento creado al confirmar'));
      expect(resolve).not.toHaveBeenCalled();
    });

    it('si se acepta, resuelve conservando el importado', async () => {
      const resolve = vi.spyOn(recurringApi, 'resolveDuplicate').mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const onChanged = renderPanel({ possibleDuplicates: [duplicate] });

      await userEvent.click(screen.getByRole('button', { name: 'Quedarme con el importado' }));
      expect(resolve).toHaveBeenCalledWith('rec-1', '2026-01-01', 'importado');
      expect(onChanged).toHaveBeenCalled();
    });

    it('"No es un duplicado" descarta ese candidato sin borrar nada', async () => {
      const dismiss = vi.spyOn(recurringApi, 'dismissCandidate').mockResolvedValue(undefined);
      const resolve = vi.spyOn(recurringApi, 'resolveDuplicate');
      renderPanel({ possibleDuplicates: [duplicate] });

      await userEvent.click(screen.getByRole('button', { name: 'No es un duplicado' }));
      expect(dismiss).toHaveBeenCalledWith('rec-1', '2026-01-01', 'importado');
      expect(resolve).not.toHaveBeenCalled();
    });
  });

  describe('conciliados recientemente', () => {
    const recent = [
      { recurringId: 'rec-1', date: '2026-10-01', concept: 'Alquiler', reconciledAutomatically: true, reconciledAt: '2026-10-02T08:00:00Z', transaction: tx() },
      { recurringId: 'rec-2', date: '2026-09-15', concept: 'Luz', reconciledAutomatically: false, reconciledAt: '2026-09-16T08:00:00Z', transaction: null },
    ];

    it('se muestran plegados, con su tipo y el movimiento enlazado', async () => {
      renderPanel({ recentlyReconciled: recent });
      const details = screen.getByRole('group');
      expect(details).not.toHaveAttribute('open');
      await userEvent.click(screen.getByText('Conciliados recientemente (2)'));
      expect(details).toHaveAttribute('open');
      expect(screen.getByText('automática')).toBeInTheDocument();
      expect(screen.getByText('manual')).toBeInTheDocument();
      expect(screen.getByText('El movimiento enlazado se borró.')).toBeInTheDocument();
    });

    it('"Deshacer" deshace esa conciliación', async () => {
      const undo = vi.spyOn(recurringApi, 'undoReconciliation').mockResolvedValue(undefined);
      const onChanged = renderPanel({ recentlyReconciled: recent });
      await userEvent.click(screen.getByText('Conciliados recientemente (2)'));
      await userEvent.click(screen.getByRole('button', { name: /Deshacer la conciliación de Luz/ }));
      expect(undo).toHaveBeenCalledWith('rec-2', '2026-09-15');
      expect(onChanged).toHaveBeenCalled();
    });
  });
});
