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
    startDate: '2026-01-05', endDate: null, active: true, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  };
}

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    recurringId: 'rec-1', date: '2026-08-05', status: 'OVERDUE', transactionId: null, type: 'EXPENSE',
    categoryId: 'cat-expense-1', subcategoryId: null, concept: 'Alquiler', merchant: null, amount: '600.00',
    paymentMethod: null, ...overrides,
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
      status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', hasPassword: true,
    });
    vi.spyOn(categoriesApi, 'listCategories').mockImplementation(async (type) =>
      type === 'INCOME' ? [INCOME_CATEGORY] : [EXPENSE_CATEGORY],
    );
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 't' });
    vi.spyOn(recurringApi, 'listRecurring').mockResolvedValue([template()]);
    vi.spyOn(recurringApi, 'listOccurrences').mockResolvedValue([occurrence()]);
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
});
