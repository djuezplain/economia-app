import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringPage } from './RecurringPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as recurringApi from '../api/recurring-transactions';
import type { Category } from '../api/categories';
import type { Occurrence, RecurringTransaction } from '../api/recurring-transactions';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';

const EXPENSE_CATEGORY: Category = {
  id: 'cat-expense-1', userId: 'user-1', type: 'EXPENSE', name: 'Vivienda', parentId: null,
  isDefault: true, icon: '🏠', createdAt: '2026-01-01T00:00:00.000Z',
};
const INCOME_CATEGORY: Category = {
  id: 'cat-income-1', userId: 'user-1', type: 'INCOME', name: 'Nómina', parentId: null,
  isDefault: true, icon: '💼', createdAt: '2026-01-01T00:00:00.000Z',
};

function template(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: 'rec-1', userId: 'user-1', type: 'EXPENSE', categoryId: 'cat-expense-1', subcategoryId: null,
    concept: 'Alquiler', merchant: null, amount: '600.00', paymentMethod: null, frequency: 'MONTHLY',
    startDate: '2026-01-05', endDate: null, active: true, variableAmount: false, reminderEnabled: false, reminderDaysBefore: 2, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  };
}

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    recurringId: 'rec-1', date: '2026-08-05', status: 'OVERDUE', transactionId: null, type: 'EXPENSE',
    categoryId: 'cat-expense-1', subcategoryId: null, concept: 'Alquiler', merchant: null, amount: '600.00',
    paymentMethod: null, estimated: false, ...overrides,
  };
}

describe('RecurringPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    resetForTests(true);
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1', email: 'ana@example.com', name: 'Ana', currency: 'EUR', locale: 'es',
      status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', hasPassword: true, recurringReminderEmails: true, warrantyReminderEmails: true,
    });
    vi.spyOn(categoriesApi, 'listCategories').mockImplementation(async (type) =>
      type === 'INCOME' ? [INCOME_CATEGORY] : [EXPENSE_CATEGORY],
    );
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    vi.spyOn(recurringApi, 'listRecurring').mockResolvedValue([template()]);
    vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
    vi.spyOn(recurringApi, 'getReconciliationOverview').mockResolvedValue({ suggestions: [], possibleDuplicates: [], recentlyReconciled: [] });
  });
  afterEach(() => vi.useRealTimers());

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión pide iniciar sesión y no llama a la API', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(recurringApi.listRecurring).not.toHaveBeenCalled();
  });

  it('lista las plantillas con su frecuencia y las ocurrencias pendientes (vencida marcada)', async () => {
    renderPage();
    expect(await screen.findByText('Cada mes, el día 5')).toBeInTheDocument();
    expect(screen.getByText('vencido')).toBeInTheDocument();
    expect(recurringApi.listOccurrences).toHaveBeenCalledWith('2025-10-14', '2026-09-09');
  });

  it('crea una plantilla con los datos del formulario', async () => {
    const create = vi.spyOn(recurringApi, 'createRecurring').mockResolvedValue(template({ id: 'rec-2' }));
    renderPage();
    await screen.findByText('Cada mes, el día 5');

    await userEvent.click(screen.getByRole('button', { name: '+ Nuevo recurrente' }));
    const form = screen.getByRole('form', { name: 'Nuevo recurrente' });
    await userEvent.type(within(form).getByLabelText('Concepto'), 'Seguro coche');
    await userEvent.selectOptions(within(form).getByLabelText('Categoría'), 'cat-expense-1');
    await userEvent.type(within(form).getByLabelText('Importe'), '320.00');
    await userEvent.selectOptions(within(form).getByLabelText('Frecuencia'), 'YEARLY');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXPENSE', concept: 'Seguro coche', categoryId: 'cat-expense-1', amount: '320.00', frequency: 'YEARLY' }),
    );
  });

  it('crea una plantilla de importe variable (spec 049 H2) con texto de ayuda', async () => {
    const create = vi.spyOn(recurringApi, 'createRecurring').mockResolvedValue(template({ id: 'rec-2', variableAmount: true }));
    renderPage();
    await screen.findByText('Cada mes, el día 5');

    await userEvent.click(screen.getByRole('button', { name: '+ Nuevo recurrente' }));
    const form = screen.getByRole('form', { name: 'Nuevo recurrente' });
    expect(within(form).queryByText(/media de los 3 últimos/)).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Concepto'), 'Luz');
    await userEvent.selectOptions(within(form).getByLabelText('Categoría'), 'cat-expense-1');
    await userEvent.type(within(form).getByLabelText('Importe'), '55.00');
    await userEvent.click(within(form).getByLabelText('Importe variable'));
    expect(within(form).getByText(/media de los 3 últimos/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Crear' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ concept: 'Luz', amount: '55.00', variableAmount: true }));
  });

  it('al editar una plantilla variable la casilla sale marcada y se guarda sin cambios; el listado la etiqueta', async () => {
    vi.spyOn(recurringApi, 'listRecurring').mockResolvedValue([template({ concept: 'Luz', variableAmount: true })]);
    const update = vi.spyOn(recurringApi, 'updateRecurring').mockResolvedValue(template({ variableAmount: true }));
    renderPage();
    expect(await screen.findByText('importe variable')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar recurrente' });
    expect(within(form).getByLabelText('Importe variable')).toBeChecked();
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }));
    expect(update).toHaveBeenCalledWith('rec-1', expect.objectContaining({ variableAmount: true }));
  });

  it('configura el aviso por email: los días solo aparecen con la casilla marcada (spec 049 H1)', async () => {
    const create = vi.spyOn(recurringApi, 'createRecurring').mockResolvedValue(template({ id: 'rec-2' }));
    renderPage();
    await screen.findByText('Cada mes, el día 5');

    await userEvent.click(screen.getByRole('button', { name: '+ Nuevo recurrente' }));
    const form = screen.getByRole('form', { name: 'Nuevo recurrente' });
    expect(within(form).queryByLabelText('Con cuánta antelación')).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Concepto'), 'Seguro');
    await userEvent.selectOptions(within(form).getByLabelText('Categoría'), 'cat-expense-1');
    await userEvent.type(within(form).getByLabelText('Importe'), '30.00');
    await userEvent.click(within(form).getByLabelText('Avisarme por email'));
    await userEvent.selectOptions(within(form).getByLabelText('Con cuánta antelación'), 'El mismo día');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ reminderEnabled: true, reminderDaysBefore: 0 }));
  });

  it('al editar, carga la configuración del aviso y el listado la etiqueta', async () => {
    vi.spyOn(recurringApi, 'listRecurring').mockResolvedValue([template({ reminderEnabled: true, reminderDaysBefore: 5 })]);
    renderPage();
    expect(await screen.findByText('aviso por email')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar recurrente' });
    expect(within(form).getByLabelText('Avisarme por email')).toBeChecked();
    expect(within(form).getByLabelText('Con cuánta antelación')).toHaveValue('5');
  });

  it('muestra el error del servidor al guardar', async () => {
    vi.spyOn(recurringApi, 'createRecurring').mockRejectedValue(new ApiError(400, 'La fecha de fin no puede ser anterior a la de inicio.'));
    renderPage();
    await screen.findByText('Cada mes, el día 5');
    await userEvent.click(screen.getByRole('button', { name: '+ Nuevo recurrente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.')).toBeInTheDocument();
  });

  it('pausa una plantilla', async () => {
    const update = vi.spyOn(recurringApi, 'updateRecurring').mockResolvedValue(template({ active: false }));
    renderPage();
    await screen.findByText('Cada mes, el día 5');
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(update).toHaveBeenCalledWith('rec-1', { active: false });
  });

  it('elimina una plantilla solo tras confirmar', async () => {
    const del = vi.spyOn(recurringApi, 'deleteRecurring').mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    await screen.findByText('Cada mes, el día 5');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(del).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('rec-1');
  });

  describe('conciliación (spec 049 H3)', () => {
    it('sin nada por conciliar no muestra las secciones', async () => {
      renderPage();
      await screen.findByText('Cada mes, el día 5');
      expect(screen.queryByRole('region', { name: 'Por conciliar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Conciliados recientemente' })).not.toBeInTheDocument();
    });

    it('muestra la sección por conciliar y recarga todo tras conciliar', async () => {
      vi.spyOn(recurringApi, 'getReconciliationOverview')
        .mockResolvedValueOnce({
          suggestions: [
            {
              occurrence: {
                recurringId: 'rec-1', date: '2026-08-05', status: 'OVERDUE', type: 'EXPENSE', categoryId: 'cat-expense-1',
                expectedAmount: '600.00', variableAmount: false, concept: 'Alquiler', merchant: null,
              },
              candidates: [
                {
                  id: 'tx-1', userId: 'user-1', type: 'EXPENSE', date: '2026-08-06', categoryId: 'cat-expense-1', subcategoryId: null,
                  concept: 'RECIBO ALQUILER', merchant: 'Banco', amount: '600.00', paymentMethod: 'DIRECT_DEBIT',
                  createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
                },
              ],
            },
          ],
          possibleDuplicates: [],
          recentlyReconciled: [],
        })
        .mockResolvedValue({ suggestions: [], possibleDuplicates: [], recentlyReconciled: [] });
      const reconcile = vi.spyOn(recurringApi, 'reconcileOccurrence').mockResolvedValue(undefined);
      renderPage();

      const section = await screen.findByRole('region', { name: 'Por conciliar' });
      await userEvent.click(within(section).getByRole('button', { name: /Conciliar Alquiler/ }));
      expect(reconcile).toHaveBeenCalledWith('rec-1', '2026-08-05', 'tx-1');
      expect(await screen.findByText('Cada mes, el día 5')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Por conciliar' })).not.toBeInTheDocument();
      expect(recurringApi.listRecurring).toHaveBeenCalledTimes(2);
    });

    it('si falla la carga de la conciliación, el resto de la página se ve igual', async () => {
      vi.spyOn(recurringApi, 'getReconciliationOverview').mockRejectedValue(new ApiError(500, 'Error'));
      renderPage();
      expect(await screen.findByText('Cada mes, el día 5')).toBeInTheDocument();
      expect(screen.getByText('vencido')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
