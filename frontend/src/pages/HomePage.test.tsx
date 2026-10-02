import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as dashboardApi from '../api/dashboard';
import * as goalsProgressApi from '../api/goals-progress';
import * as transactionsApi from '../api/transactions';
import type { MonthSummary, YearSummary } from '../api/dashboard';
import type { MonthProgress, GoalProgress } from '../api/goals-progress';
import type { ListTransactionsResult, Transaction } from '../api/transactions';
import { ApiError } from '../api/client';
import { resetForTests } from '../offline/connectivity';
import { formatCurrency } from './home-shared';

// `screen.getByText` normaliza los espacios en blanco del DOM (colapsa el
// espacio de no separación — U+00A0 — que usa `Intl.NumberFormat` a un
// espacio normal), pero no normaliza el string que se le pasa a comparar —
// así que el propio texto esperado necesita el mismo colapso para no fallar
// por una diferencia invisible de codepoint.
function eur(amount: string): string {
  return formatCurrency(amount).replace(/ /g, ' ');
}

const PROFILE: usersApi.UserProfile = {
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  currency: 'EUR',
  locale: 'es',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
};

function monthSummary(overrides: Partial<MonthSummary> = {}): MonthSummary {
  return {
    month: '2026-08',
    income: '0.00',
    expense: '0.00',
    savings: '0.00',
    savingsPercent: null,
    byCategory: [],
    dailyAverages: { income: '0.00', expense: '0.00', savings: '0.00' },
    ...overrides,
  };
}

/** Evolución mensual de 2026 con los meses indicados (el resto a 0, como
 *  los meses futuros que devuelve el backend). */
function yearSummary(months: Record<string, { income: string; expense: string }>): YearSummary {
  return {
    year: 2026,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = `2026-${String(index + 1).padStart(2, '0')}`;
      const { income, expense } = months[month] ?? { income: '0.00', expense: '0.00' };
      return { month, income, expense, savings: (parseFloat(income) - parseFloat(expense)).toFixed(2) };
    }),
    totals: { income: '0.00', expense: '0.00', savings: '0.00', savingsPercent: null },
  };
}

function monthProgress(savingsGoal: GoalProgress | null = null): MonthProgress {
  return { month: '2026-08', savingsGoal, expenseBudgets: [] };
}

function transactionsResult(items: Transaction[] = []): ListTransactionsResult {
  return {
    items,
    page: 1,
    limit: 5,
    totalItems: items.length,
    summary: { total: '0.00', averagePerMonth: null, byCategory: [], bySubcategory: [] },
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    userId: 'user-1',
    type: 'EXPENSE',
    date: '2026-08-26',
    categoryId: 'cat-1',
    subcategoryId: null,
    concept: 'Café',
    merchant: 'Gallofa',
    amount: '1.60',
    paymentMethod: 'CARD',
    createdAt: '2026-08-26T09:00:00.000Z',
    updatedAt: '2026-08-26T09:00:00.000Z',
    ...overrides,
  };
}

/** Sin actividad: ninguna tarjeta ni listado se pinta (H3 criterio 6), así
 *  que los tests que no giran en torno a esos datos no necesitan más mocks
 *  para evitar que un fetch real (sin mockear) rompa el test con un error
 *  inesperado. */
function mockEmptyMonth() {
  vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary());
  vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgress());
  vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult());
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mismo motivo que siempre: sin esto, AuthProvider intentaría un
    // refresco silencioso real contra la red al montar.
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    // Spec 045 (H3): la evolución anual de las tarjetas KPI es opcional — por
    // defecto falla, y los tests que la necesitan la sobrescriben.
    vi.spyOn(dashboardApi, 'getYearSummary').mockRejectedValue(new ApiError(500, 'Sin evolución anual.'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderHome() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  function mockLoggedIn(profile: usersApi.UserProfile = PROFILE) {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue(profile);
  }

  it('muestra el título de la aplicación y enlaces a crear cuenta e iniciar sesión sin sesión activa', async () => {
    renderHome();

    expect(screen.getByText('App de Gestión de Economía Personal')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con sesión activa muestra el nombre del usuario (spec 005: el botón de cerrar sesión ya vive en AppLayout, no aquí)', async () => {
    mockLoggedIn();
    mockEmptyMonth();

    renderHome();

    expect(await screen.findByText(/Sesión iniciada como Ana\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con la cuenta sin verificar, muestra un aviso persistente para reenviar el enlace (H2 criterio 3, spec 001)', async () => {
    mockLoggedIn({ ...PROFILE, status: 'PENDING_VERIFICATION' });
    mockEmptyMonth();

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no has verificado tu email/i);
    expect(screen.getByRole('link', { name: 'Reenviar el enlace' })).toBeInTheDocument();
  });

  it('con movimientos en el mes, muestra las 3 tarjetas de resumen y los últimos movimientos (H3 criterios 1 y 3)', async () => {
    mockLoggedIn();
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2410.00', expense: '1761.80' }));
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(
      monthProgress({
        id: 'goal-1',
        targetType: 'AMOUNT',
        targetValue: '500.00',
        alertThresholdPercent: '80',
        actualAmount: '648.20',
        targetAmount: '500.00',
        deviation: '148.20',
        progressPercent: '129.64',
        status: 'AT_OR_ABOVE_TARGET',
        projectedAmount: null,
      }),
    );
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(
      transactionsResult([
        transaction({ id: 'tx-1', concept: 'Café', merchant: 'Gallofa', amount: '1.60', type: 'EXPENSE', date: '2026-08-26' }),
        transaction({ id: 'tx-2', concept: 'Nómina', merchant: 'Empresa S.L.', amount: '2100.00', type: 'INCOME', date: '2026-08-25' }),
      ]),
    );

    renderHome();

    expect(await screen.findByText('Balance del mes')).toBeInTheDocument();
    expect(screen.getByText(eur('648.20'))).toBeInTheDocument();
    expect(screen.getByText(`Sobre un objetivo de ${eur('500.00')}`)).toBeInTheDocument();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getByText(eur('2410.00'))).toBeInTheDocument();
    expect(screen.getByText('Gastos')).toBeInTheDocument();
    expect(screen.getByText(eur('1761.80'))).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Últimos movimientos' })).toBeInTheDocument();
    expect(screen.getByText('Café')).toBeInTheDocument();
    expect(screen.getByText('Nómina')).toBeInTheDocument();
    expect(screen.getByText(`-${eur('1.60')}`)).toBeInTheDocument();
    expect(screen.getByText(`+${eur('2100.00')}`)).toBeInTheDocument();
  });

  it('en un mes sin movimientos, muestra un estado vacío explícito en vez de tarjetas o listado (H3 criterio 6)', async () => {
    mockLoggedIn();
    mockEmptyMonth();

    renderHome();

    expect(await screen.findByText('Sin movimientos registrados este mes.')).toBeInTheDocument();
    expect(screen.queryByText('Balance del mes')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Últimos movimientos' })).not.toBeInTheDocument();
  });

  it('sin un objetivo de ahorro configurado, la tarjeta de balance lo indica sin romper (H3 criterio 2)', async () => {
    mockLoggedIn();
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2410.00', expense: '1761.80' }));
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgress(null));
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult([transaction()]));

    renderHome();

    expect(await screen.findByText(/No tienes un objetivo de ahorro mensual definido/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configúralo' })).toHaveAttribute('href', '/goals');
  });

  it('si falla una de las tres llamadas, las otras dos se siguen mostrando (mismo criterio que DashboardPage)', async () => {
    mockLoggedIn();
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2410.00', expense: '1761.80' }));
    vi.spyOn(goalsProgressApi, 'getMonthProgress').mockRejectedValue(new ApiError(500, 'Error de prueba.'));
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult([transaction()]));

    renderHome();

    expect(await screen.findByText('Balance del mes')).toBeInTheDocument();
    expect(screen.getByText('Café')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Error de prueba.');
  });

  it('sin conexión (H6, spec 011), avisa de que la página requiere conexión sin llamar a la API', async () => {
    mockLoggedIn();
    resetForTests(false);
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary');

    renderHome();

    expect(await screen.findByText('Esta página requiere conexión a internet.')).toBeInTheDocument();
    expect(monthSpy).not.toHaveBeenCalled();
  });

  it('sin conexión, el aviso de verificación pendiente se sigue mostrando (no depende de la red)', async () => {
    mockLoggedIn({ ...PROFILE, status: 'PENDING_VERIFICATION' });
    resetForTests(false);

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Todavía no has verificado tu email.');
  });

  describe('tarjetas KPI (spec 045, H3)', () => {
    beforeEach(() => {
      // Solo se falsea `Date` (no los temporizadores): fija el "mes actual"
      // de Inicio a agosto de 2026 sin afectar a las promesas del test.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    });

    it('muestra la variación respecto al mes anterior, en verde si es favorable y en rojo si no', async () => {
      mockLoggedIn();
      vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2200.00', expense: '1100.00' }));
      vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgress(null));
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult([transaction()]));
      vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(
        yearSummary({
          '2026-07': { income: '2000.00', expense: '1000.00' },
          '2026-08': { income: '2200.00', expense: '1100.00' },
        }),
      );

      renderHome();

      // Ingresos +10 % (favorable) y gastos +10 % (desfavorable); balance de
      // 1000 € a 1100 €, +10 % (favorable).
      const deltas = await screen.findAllByText(/\+10 % vs\. mes anterior/);
      expect(deltas).toHaveLength(3);
      expect(deltas.map((delta) => delta.getAttribute('data-tone'))).toEqual(['positive', 'positive', 'negative']);
      expect(dashboardApi.getYearSummary).toHaveBeenCalledWith('2026');
    });

    it('sin datos del mes anterior (vale 0), no muestra variación', async () => {
      mockLoggedIn();
      vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2200.00', expense: '1100.00' }));
      vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgress(null));
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult([transaction()]));
      vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(yearSummary({ '2026-08': { income: '2200.00', expense: '1100.00' } }));

      renderHome();

      expect(await screen.findByText(eur('2200.00'))).toBeInTheDocument();
      await screen.findByText('Café');
      expect(screen.queryByText(/vs\. mes anterior/)).not.toBeInTheDocument();
    });

    it('si falla la evolución anual, las tarjetas se ven igual, sin variación ni error', async () => {
      mockLoggedIn();
      vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(monthSummary({ income: '2200.00', expense: '900.00' }));
      vi.spyOn(goalsProgressApi, 'getMonthProgress').mockResolvedValue(monthProgress(null));
      vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue(transactionsResult([transaction()]));

      renderHome();

      expect(await screen.findByText(eur('2200.00'))).toBeInTheDocument();
      expect(screen.getByText(eur('900.00'))).toBeInTheDocument();
      expect(screen.getByText(eur('1300.00'))).toBeInTheDocument();
      await screen.findByText('Café');
      expect(screen.queryByText(/vs\. mes anterior/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
