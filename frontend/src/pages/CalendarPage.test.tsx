import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as transactionsApi from '../api/transactions';
import * as recurringApi from '../api/recurring-transactions';
import type { Occurrence } from '../api/recurring-transactions';
import type { Category } from '../api/categories';
import type { ListTransactionsResult, Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';

const INCOME_CATEGORY: Category = {
  id: 'cat-income-1', userId: 'user-1', type: 'INCOME', name: 'Nómina', parentId: null,
  isDefault: true, icon: '💼', createdAt: '2026-01-01T00:00:00.000Z',
};
const EXPENSE_CATEGORY: Category = {
  id: 'cat-expense-1', userId: 'user-1', type: 'EXPENSE', name: 'Transporte', parentId: null,
  isDefault: true, icon: '🚌', createdAt: '2026-01-01T00:00:00.000Z',
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx', userId: 'user-1', type: 'EXPENSE', date: '2026-08-05', categoryId: 'cat-expense-1',
    subcategoryId: null, concept: 'Concepto', merchant: null, amount: '10.00', paymentMethod: null,
    createdAt: '2026-08-05T09:00:00.000Z', updatedAt: '2026-08-05T09:00:00.000Z', ...overrides,
  };
}

function result(items: Transaction[]): ListTransactionsResult {
  return {
    items, page: 1, limit: 200, totalItems: items.length,
    summary: { total: '0.00', averagePerMonth: null, byCategory: [], bySubcategory: [] },
  };
}

const AUGUST = [
  tx({ id: 'a', date: '2026-08-05', concept: 'Gasolina', amount: '45.00', merchant: 'Repsol', paymentMethod: 'CARD' }),
  tx({ id: 'b', date: '2026-08-05', type: 'INCOME', categoryId: 'cat-income-1', concept: 'Nómina agosto', amount: '2000.00' }),
  tx({ id: 'c', date: '2026-08-20', concept: 'Cena', amount: '30.00' }),
];

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-05T10:00:00Z'));
    resetForTests(true);
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1', email: 'ana@example.com', name: 'Ana', currency: 'EUR', locale: 'es',
      status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', hasPassword: true,
    });
    // Spec 047: por defecto, sin recurrentes (cada test que los necesita lo sobrescribe).
    vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([]);
    vi.spyOn(categoriesApi, 'listCategories').mockImplementation(async (type) =>
      type === 'INCOME' ? [INCOME_CATEGORY] : [EXPENSE_CATEGORY],
    );
  });
  afterEach(() => vi.useRealTimers());

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión pide iniciar sesión y no carga movimientos', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const spy = vi.spyOn(transactionsApi, 'listTransactions');
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(spy).not.toHaveBeenCalled();
  });

  it('pide el mes actual, muestra el resumen y el detalle de hoy', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    const list = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
    renderPage();

    expect(await screen.findByText('Gasolina')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }));
    expect(screen.getByRole('heading', { name: 'agosto 2026' })).toBeInTheDocument();
    expect(screen.getByText('Nómina agosto')).toBeInTheDocument();
    // Cena es de otro día: no aparece en el detalle de hoy.
    expect(screen.queryByText('Cena')).not.toBeInTheDocument();
    // Ingresos 2000, gastos 75, balance 1925.
    const totals = document.querySelector('.cal-totals') as HTMLElement;
    expect(totals.textContent).toMatch(/2000,00/);
    expect(totals.textContent).toMatch(/75,00/);
    expect(totals.textContent).toMatch(/1925,00/);
  });

  it('al pulsar otro día muestra sus movimientos; un día vacío muestra el mensaje', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
    renderPage();
    await screen.findByText('Gasolina');

    await userEvent.click(screen.getByRole('gridcell', { name: /20 de agosto, 1 movimiento/ }));
    expect(screen.getByText('Cena')).toBeInTheDocument();
    expect(screen.queryByText('Gasolina')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('gridcell', { name: /^martes, 11 de agosto$/ }));
    expect(screen.getByText('No hay movimientos este día.')).toBeInTheDocument();
  });

  it('muestra "+N" cuando un día tiene más de 3 movimientos', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    const many = [1, 2, 3, 4, 5].map((i) => tx({ id: `m${i}`, date: '2026-08-12', concept: `Gasto ${i}` }));
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(many));
    renderPage();
    const cell = await screen.findByRole('gridcell', { name: /12 de agosto, 5 movimientos/ });
    expect(within(cell).getByText('+3')).toBeInTheDocument();
  });

  it('el botón de mes siguiente carga septiembre y selecciona el día 1', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    const list = vi.spyOn(transactionsApi, 'listTransactions').mockImplementation(async (f) =>
      result(f?.dateFrom === '2026-09-01' ? [tx({ id: 's', date: '2026-09-01', concept: 'Alquiler' })] : AUGUST),
    );
    renderPage();
    await screen.findByText('Gasolina');

    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(await screen.findByText('Alquiler')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'septiembre 2026' })).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }));
  });

  describe('movimientos previstos (spec 047)', () => {
    function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
      return {
        recurringId: 'rec-1', date: '2026-08-05', status: 'PENDING', transactionId: null, type: 'EXPENSE',
        categoryId: 'cat-expense-1', subcategoryId: null, concept: 'Alquiler', merchant: null, amount: '600.00',
        paymentMethod: null, ...overrides,
      };
    }

    it('pide las ocurrencias del mes y las muestra como previstas en el detalle del día, sin tocar los totales', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
      const list = vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([
        occurrence(),
        occurrence({ date: '2026-08-06', concept: 'Ya confirmado', status: 'CONFIRMED' }),
      ]);
      renderPage();

      expect(await screen.findByText('Alquiler')).toBeInTheDocument();
      expect(list).toHaveBeenCalledWith('2026-08-01', '2026-08-31');
      expect(screen.getByText('previsto')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Omitir' })).toBeInTheDocument();
      // Las confirmadas no se pintan como previstas.
      expect(screen.queryByText('Ya confirmado')).not.toBeInTheDocument();
      // Total de gastos sigue siendo solo el de los reales (45 + 30).
      expect((document.querySelector('.cal-totals') as HTMLElement).textContent).toMatch(/75,00/);
      expect(screen.getByRole('gridcell', { name: /5 de agosto, 2 movimientos, 1 previsto/ })).toBeInTheDocument();
    });

    it('confirmar llama a la API con el importe ajustado y recarga movimientos y previstos', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
      const listTx = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
      const listOcc = vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
      const confirm = vi.spyOn(recurringApi, 'confirmOccurrence').mockResolvedValue(tx({ id: 'nuevo' }));
      renderPage();
      await screen.findByText('Alquiler');

      const input = screen.getByLabelText('Importe real de Alquiler');
      await userEvent.clear(input);
      await userEvent.type(input, '612.34');
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      expect(confirm).toHaveBeenCalledWith('rec-1', '2026-08-05', '612.34');
      await vi.waitFor(() => expect(listTx).toHaveBeenCalledTimes(2));
      expect(listOcc).toHaveBeenCalledTimes(2);
    });

    it('confirmar sin cambiar el importe no lo envía, y omitir llama a skip', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
      vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
      const confirm = vi.spyOn(recurringApi, 'confirmOccurrence').mockResolvedValue(tx({}));
      const skip = vi.spyOn(recurringApi, 'skipOccurrence').mockResolvedValue(undefined);
      renderPage();
      await screen.findByText('Alquiler');

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(confirm).toHaveBeenCalledWith('rec-1', '2026-08-05', undefined);
      await userEvent.click(screen.getByRole('button', { name: 'Omitir' }));
      expect(skip).toHaveBeenCalledWith('rec-1', '2026-08-05');
    });

    it('si fallan las ocurrencias, el calendario sigue con los movimientos reales y avisa', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
      vi.spyOn(recurringApi, 'listOccurrences').mockRejectedValue(new ApiError(500, 'boom'));
      renderPage();

      expect(await screen.findByText('Gasolina')).toBeInTheDocument();
      expect(await screen.findByText('No se han podido cargar los movimientos previstos.')).toBeInTheDocument();
    });

    it('un error al confirmar se muestra y no recarga', async () => {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
      const listTx = vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(result(AUGUST));
      vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
      vi.spyOn(recurringApi, 'confirmOccurrence').mockRejectedValue(new ApiError(409, 'Esta ocurrencia ya estaba resuelta.'));
      renderPage();
      await screen.findByText('Alquiler');

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
      expect(await screen.findByText('Esta ocurrencia ya estaba resuelta.')).toBeInTheDocument();
      expect(listTx).toHaveBeenCalledTimes(1);
    });
  });
});
