import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';
import * as usersApi from '../api/users';
import * as categoriesApi from '../api/categories';
import * as dashboardApi from '../api/dashboard';
import type { Category } from '../api/categories';
import type { ComparisonSummary, MonthSummary, SeasonalSummary, YearSummary } from '../api/dashboard';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';
import { resetForTests } from '../offline/connectivity';

const INCOME_CATEGORY: Category = {
  id: 'cat-income-1',
  userId: 'user-1',
  type: 'INCOME',
  name: 'Nómina',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_FOOD: Category = {
  id: 'cat-expense-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Comida',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EXPENSE_TRANSPORT: Category = {
  id: 'cat-expense-2',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Transporte',
  parentId: null,
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const MONTH_SUMMARY: MonthSummary = {
  month: '2026-08',
  income: '2000.00',
  expense: '350.00',
  savings: '1650.00',
  savingsPercent: '82.50',
  byCategory: [
    { categoryId: 'cat-expense-2', total: '50.00' },
    { categoryId: 'cat-expense-1', total: '300.00' },
  ],
  dailyAverages: { income: '71.43', expense: '12.50', savings: '58.93' },
};

const MONTH_SUMMARY_SIN_GASTOS: MonthSummary = {
  month: '2026-08',
  income: '0.00',
  expense: '0.00',
  savings: '0.00',
  savingsPercent: null,
  byCategory: [],
  dailyAverages: { income: '0.00', expense: '0.00', savings: '0.00' },
};

function buildYearSummary(): YearSummary {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    income: i === 0 ? '2000.00' : '0.00',
    expense: i === 0 ? '300.00' : '0.00',
    savings: i === 0 ? '1700.00' : '0.00',
  }));
  return {
    year: 2026,
    months,
    totals: { income: '4100.00', expense: '700.00', savings: '3400.00', savingsPercent: '82.93' },
  };
}

const COMPARISON_SUMMARY_EXPENSE: ComparisonSummary = {
  period: 'month',
  type: 'EXPENSE',
  days: 28,
  currentLabel: 'Agosto 2026',
  previousLabel: 'Julio 2026',
  current: { count: 4, total: '400.00', averagePerDay: '14.29' },
  previous: { count: 2, total: '200.00', averagePerDay: '7.14' },
  changes: { count: '100.00', total: '100.00', averagePerDay: '100.00' },
};

const COMPARISON_SUMMARY_SIN_ANTERIOR: ComparisonSummary = {
  period: 'month',
  type: 'EXPENSE',
  days: 28,
  currentLabel: 'Agosto 2026',
  previousLabel: 'Julio 2026',
  current: { count: 1, total: '50.00', averagePerDay: '1.79' },
  previous: { count: 0, total: '0.00', averagePerDay: '0.00' },
  changes: { count: null, total: null, averagePerDay: null },
};

const SEASONAL_SUMMARY_EXPENSE: SeasonalSummary = {
  scope: 'historic',
  year: null,
  type: 'EXPENSE',
  seasons: [
    { season: 'winter', count: 2, total: '150.00', averagePerDay: '2.54' },
    { season: 'spring', count: 1, total: '30.00', averagePerDay: '0.33' },
    { season: 'summer', count: 2, total: '300.00', averagePerDay: '3.26' },
    { season: 'autumn', count: 1, total: '10.00', averagePerDay: '3.33' },
  ],
  comparison: { bestSeason: 'summer', worstSeason: 'autumn', difference: '290.00', percent: '2900.00' },
};

const SEASONAL_SUMMARY_SIN_COMPARACION: SeasonalSummary = {
  scope: 'historic',
  year: null,
  type: 'EXPENSE',
  seasons: [
    { season: 'winter', count: 1, total: '50.00', averagePerDay: '1.00' },
    { season: 'spring', count: 0, total: '0.00', averagePerDay: '0.00' },
    { season: 'summer', count: 0, total: '0.00', averagePerDay: '0.00' },
    { season: 'autumn', count: 0, total: '0.00', averagePerDay: '0.00' },
  ],
  comparison: null,
};

function buildEmptyYearSummary(): YearSummary {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    income: '0.00',
    expense: '0.00',
    savings: '0.00',
  }));
  return {
    year: 2026,
    months,
    totals: { income: '0.00', expense: '0.00', savings: '0.00', savingsPercent: null },
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetForTests(true);
    vi.spyOn(usersApi, 'getProfile').mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      currency: 'EUR',
      locale: 'es',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      hasPassword: true,
    });
  });

  function renderPage() {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it('sin sesión activa, pide iniciar sesión y no llama a ninguna API del dashboard', async () => {
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new ApiError(401, 'No hay sesión.'));
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary');
    const yearSpy = vi.spyOn(dashboardApi, 'getYearSummary');
    const comparisonSpy = vi.spyOn(dashboardApi, 'getComparison');
    const seasonalSpy = vi.spyOn(dashboardApi, 'getSeasonal');
    const categoriesSpy = vi.spyOn(categoriesApi, 'listCategories');

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tienes que iniciar sesión');
    expect(monthSpy).not.toHaveBeenCalled();
    expect(yearSpy).not.toHaveBeenCalled();
    expect(comparisonSpy).not.toHaveBeenCalled();
    expect(seasonalSpy).not.toHaveBeenCalled();
    expect(categoriesSpy).not.toHaveBeenCalled();
  });

  it('con sesión activa, muestra el resumen del mes y el desglose de gastos por categoría', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY, EXPENSE_FOOD, EXPENSE_TRANSPORT]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();

    expect(await screen.findByText('Ingresos: 2000.00')).toBeInTheDocument();
    expect(screen.getByText('Gastos: 350.00')).toBeInTheDocument();
    expect(screen.getByText('Ahorro: 1650.00')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro: 82.50%')).toBeInTheDocument();
    expect(screen.getByText('Ingreso medio/día: 71.43')).toBeInTheDocument();

    // Spec 010 (rediseño editorial), T6: la tabla se sustituyó por una lista
    // con barra de progreso — cada barra expone su nombre accesible y % vía
    // `role="progressbar"`, ordenada por total descendente igual que antes.
    // `toHaveAccessibleName` compara el atributo `aria-label` tal cual, sin
    // el colapso de espacios en blanco que sí aplica `getByText` — aquí se
    // compara contra `formatCurrency` directamente (con su espacio de no
    // separación), no contra el `eur()` de arriba (pensado para `getByText`).
    // Acotado a `#dashboard-category-list`: spec 014 añadió sus propias
    // barras `role="progressbar"` (una por estación) en otra sección.
    const bars = within(document.getElementById('dashboard-category-list')!).getAllByRole('progressbar');
    expect(bars[0]).toHaveAccessibleName(`Comida: ${formatCurrency('300.00')}`);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '86'); // 300/350 redondeado
    expect(bars[1]).toHaveAccessibleName(`Transporte: ${formatCurrency('50.00')}`);
    expect(bars[1]).toHaveAttribute('aria-valuenow', '14');
  });

  it('sin gastos en el mes, no muestra la lista de categorías y el % de ahorro aparece como "sin datos"', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY_SIN_GASTOS);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();

    expect(await screen.findByText('Sin gastos en este mes.')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro: sin datos')).toBeInTheDocument();
    // La propia lista `#dashboard-category-list` no se renderiza sin gastos —
    // no se comprueba la ausencia global de `role="progressbar"` porque spec
    // 014 (Análisis estacional) tiene las suyas propias en otra sección.
    expect(document.getElementById('dashboard-category-list')).not.toBeInTheDocument();
  });

  it('muestra los acumulados anuales y la tabla de evolución mensual con los 12 meses', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY, EXPENSE_FOOD]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();

    expect(await screen.findByText('Ingresos totales: 4100.00')).toBeInTheDocument();
    expect(screen.getByText('Gastos totales: 700.00')).toBeInTheDocument();
    expect(screen.getByText('Ahorro total: 3400.00')).toBeInTheDocument();
    expect(screen.getByText('% de ahorro global: 82.93%')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Evolución mensual (tabla)' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    expect(within(rows[0]).getByText('2026-01')).toBeInTheDocument();
    expect(within(rows[0]).getByText('2000.00')).toBeInTheDocument();
  });

  it('H2 criterio 4 (spec 007): año sin ingresos ni gastos muestra el aviso, sin dejar de mostrar el gráfico ni la tabla', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildEmptyYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();

    expect(await screen.findByText(/Sin movimientos registrados en/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evolución mensual' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Evolución mensual (tabla)' })).toBeInTheDocument();
  });

  it('año con datos no muestra el aviso de año vacío (sin falso positivo)', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();

    await screen.findByText('Ingresos totales: 4100.00');
    expect(screen.queryByText(/Sin movimientos registrados en/)).not.toBeInTheDocument();
  });

  it('cambia el mes seleccionado y vuelve a pedir el resumen de ese mes', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();
    await screen.findByText('Ingresos: 2000.00');

    // spec 013 añadió un botón de periodo "Mes" (la comparativa temporal) con el mismo
    // texto que esta etiqueta — se filtra por tipo de campo para no ambigüar la consulta.
    const monthInput = screen.getByLabelText('Mes', { selector: 'input[type="month"]' });
    await userEvent.clear(monthInput);
    await userEvent.type(monthInput, '2026-03');

    await waitFor(() => expect(monthSpy).toHaveBeenLastCalledWith('2026-03'));
  });

  it('cambia el año seleccionado y vuelve a pedir el resumen de ese año', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
    vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
    const yearSpy = vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
    vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

    renderPage();
    await screen.findByText('Ingresos totales: 4100.00');

    // spec 013 añadió un botón de periodo "Año" (la comparativa temporal) con el mismo
    // texto que esta etiqueta — se filtra por tipo de campo para no ambigüar la consulta.
    const yearInput = screen.getByLabelText('Año', { selector: 'input[type="number"]' });
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, '2025');

    await waitFor(() => expect(yearSpy).toHaveBeenLastCalledWith('2025'));
  });

  it('sin conexión (T3.3, spec 011), avisa de que el dashboard requiere conexión en vez de intentar cargar datos', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
    const listCategoriesSpy = vi.spyOn(categoriesApi, 'listCategories');
    const monthSpy = vi.spyOn(dashboardApi, 'getMonthSummary');
    const comparisonSpy = vi.spyOn(dashboardApi, 'getComparison');
    const seasonalSpy = vi.spyOn(dashboardApi, 'getSeasonal');
    resetForTests(false);

    render(
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Esta página requiere conexión a internet.')).toBeInTheDocument();
    expect(listCategoriesSpy).not.toHaveBeenCalled();
    expect(monthSpy).not.toHaveBeenCalled();
    expect(comparisonSpy).not.toHaveBeenCalled();
    expect(seasonalSpy).not.toHaveBeenCalled();
  });

  describe('Comparativa temporal (spec 013)', () => {
    function mockOtherEndpoints() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
      vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
      vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
      vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);
    }

    function comparisonSection() {
      return screen.getByRole('heading', { name: 'Comparativa temporal' }).closest('section') as HTMLElement;
    }

    // `getByText` normaliza (colapsa) los espacios del propio DOM al comparar,
    // pero no el patrón que se le pasa — el espacio de no separación de
    // `formatCurrency` ("400,00 €") no coincidiría con el mismo texto ya
    // colapsado a un espacio normal en el DOM renderizado.
    function eur(amount: string): string {
      return formatCurrency(amount).replace(/ /g, ' ');
    }

    it('muestra las cifras del periodo actual y del anterior, con el % de variación', async () => {
      mockOtherEndpoints();
      vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);

      renderPage();
      await screen.findByText('Agosto 2026');

      const section = within(comparisonSection());
      expect(section.getByText('Julio 2026')).toBeInTheDocument();
      expect(section.getByText('4')).toBeInTheDocument();
      expect(section.getByText('Anterior: 2')).toBeInTheDocument();
      expect(section.getByText(eur('400.00'))).toBeInTheDocument();
      expect(section.getByText(`Anterior: ${eur('200.00')}`)).toBeInTheDocument();
      expect(section.getAllByText('↑ 100.00%')).toHaveLength(3);
      expect(section.getByText(/Has gastado un 100\.00% más que en el periodo anterior/)).toBeInTheDocument();
    });

    it('sin movimientos en el periodo anterior, muestra "sin datos" en vez de un % erróneo', async () => {
      mockOtherEndpoints();
      vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_SIN_ANTERIOR);

      renderPage();
      await screen.findByText('Agosto 2026');

      const section = within(comparisonSection());
      expect(section.getAllByText('sin datos')).toHaveLength(3);
      expect(section.getByText('No hay movimientos en Julio 2026 con los que comparar.')).toBeInTheDocument();
    });

    it('cambia el tipo (Gastos/Ingresos) y vuelve a pedir la comparativa con ese tipo', async () => {
      mockOtherEndpoints();
      const comparisonSpy = vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);

      renderPage();
      await screen.findByText('Agosto 2026');
      expect(comparisonSpy).toHaveBeenLastCalledWith('month', 'EXPENSE');

      // spec 014 añadió su propio radio "Ingresos" (Análisis estacional) — se
      // acota la búsqueda a esta sección para no ambigüar la consulta.
      await userEvent.click(within(comparisonSection()).getByRole('radio', { name: 'Ingresos' }));

      await waitFor(() => expect(comparisonSpy).toHaveBeenLastCalledWith('month', 'INCOME'));
    });

    it('cambia el periodo (Semana/Mes/Trimestre/Año) y vuelve a pedir la comparativa con ese periodo', async () => {
      mockOtherEndpoints();
      const comparisonSpy = vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);

      renderPage();
      await screen.findByText('Agosto 2026');

      await userEvent.click(screen.getByRole('radio', { name: 'Trimestre' }));

      await waitFor(() => expect(comparisonSpy).toHaveBeenLastCalledWith('quarter', 'EXPENSE'));
    });
  });

  describe('Análisis estacional (spec 014)', () => {
    function mockOtherEndpoints() {
      vi.spyOn(authApi, 'refresh').mockResolvedValue({ accessToken: 'access-token-de-prueba' });
      vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([INCOME_CATEGORY]);
      vi.spyOn(dashboardApi, 'getMonthSummary').mockResolvedValue(MONTH_SUMMARY);
      vi.spyOn(dashboardApi, 'getYearSummary').mockResolvedValue(buildYearSummary());
      vi.spyOn(dashboardApi, 'getComparison').mockResolvedValue(COMPARISON_SUMMARY_EXPENSE);
    }

    function seasonalSection() {
      return screen.getByRole('heading', { name: 'Análisis estacional' }).closest('section') as HTMLElement;
    }

    // `getByText` normaliza (colapsa) los espacios del propio DOM al comparar,
    // pero no el patrón que se le pasa — el espacio de no separación de
    // `formatCurrency` no coincidiría con el mismo texto ya colapsado a un
    // espacio normal en el DOM renderizado (mismo motivo que en Comparativa
    // temporal, spec 013).
    function eur(amount: string): string {
      return formatCurrency(amount).replace(/ /g, ' ');
    }

    // Mismo cálculo que `currentYear()` en DashboardPage.tsx (vía `toISOString`, UTC).
    function currentYear(): string {
      return new Date().toISOString().slice(0, 4);
    }

    it('muestra las 4 estaciones con sus cifras, la etiqueta mejor/peor y el texto-resumen', async () => {
      mockOtherEndpoints();
      vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

      renderPage();
      // Se espera a una cifra que solo existe una vez cargados los datos (el
      // `<h2>` está en el DOM desde el primer render, antes de resolverse el
      // `fetch` — esperar solo por él no garantiza que los datos ya estén).
      await screen.findByText(eur('150.00'));

      const section = within(seasonalSection());
      expect(section.getByText(/Invierno/)).toBeInTheDocument();
      expect(section.getByText(/Primavera/)).toBeInTheDocument();
      expect(section.getAllByText(/Verano/).length).toBeGreaterThan(0);
      expect(section.getAllByText(/Otoño/).length).toBeGreaterThan(0);
      expect(section.getByText(eur('300.00'))).toBeInTheDocument();
      expect(section.getByText('2 movimientos · 3,26 €/día', { exact: false })).toBeInTheDocument();

      // Verano tiene el mayor importe (300.00) → peor para un análisis de
      // gastos; Otoño el menor (10.00) → mejor.
      expect(section.getByText('Peor')).toBeInTheDocument();
      expect(section.getByText('Mejor')).toBeInTheDocument();
      expect(section.getByText(`En Verano gastas ${eur('290.00')} más que en Otoño (2900.00% más).`)).toBeInTheDocument();
    });

    it('sin comparación posible, muestra un aviso en vez de un texto con cifras inventadas', async () => {
      mockOtherEndpoints();
      vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_SIN_COMPARACION);

      renderPage();
      const notice = await screen.findByText('Todavía no hay suficientes estaciones con movimientos para compararlas.');

      const section = within(seasonalSection());
      expect(notice).toBeInTheDocument();
      expect(section.queryByText('Mejor')).not.toBeInTheDocument();
      expect(section.queryByText('Peor')).not.toBeInTheDocument();
    });

    it('cambia el tipo (Gastos/Ingresos) y vuelve a pedir el análisis con ese tipo', async () => {
      mockOtherEndpoints();
      const seasonalSpy = vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

      renderPage();
      await screen.findByText(eur('150.00'));

      // spec 013 tiene su propio radio "Ingresos" (Comparativa temporal) — se
      // acota la búsqueda a esta sección para no ambigüar la consulta.
      await userEvent.click(within(seasonalSection()).getByRole('radio', { name: 'Ingresos' }));

      await waitFor(() => expect(seasonalSpy).toHaveBeenLastCalledWith('INCOME', 'historic', undefined));
    });

    it('cambia el alcance a "Año concreto": aparece el selector de año y se pide con ese año', async () => {
      mockOtherEndpoints();
      const seasonalSpy = vi.spyOn(dashboardApi, 'getSeasonal').mockResolvedValue(SEASONAL_SUMMARY_EXPENSE);

      renderPage();
      await screen.findByText(eur('150.00'));

      const section = within(seasonalSection());
      expect(section.queryByLabelText('Año')).not.toBeInTheDocument();

      await userEvent.click(section.getByRole('radio', { name: 'Año concreto' }));

      const yearInput = await section.findByLabelText('Año');
      await waitFor(() => expect(seasonalSpy).toHaveBeenLastCalledWith('EXPENSE', 'year', currentYear()));

      await userEvent.clear(yearInput);
      await userEvent.type(yearInput, '2025');

      await waitFor(() => expect(seasonalSpy).toHaveBeenLastCalledWith('EXPENSE', 'year', '2025'));
    });
  });
});
