import { describe, expect, it } from 'vitest';
import {
  bankAccountsValueAsOf,
  earliestDataDate,
  isValidCustomRange,
  liquidityRatioSeries,
  resolveRange,
  stocksValueAsOf,
  totalWealthAsOf,
  weekEndingDates,
  wealthEvolutionByCategorySeries,
  wealthEvolutionSeries,
} from './wealth-evolution.calculations';
import type { AllWealthData } from './wealth-evolution.calculations';

function emptyData(): AllWealthData {
  return {
    bankAccounts: [],
    bankAccountBalances: [],
    stocks: [],
    stockPurchases: [],
    stockValuations: [],
    funds: [],
    fundPurchases: [],
    fundValuations: [],
    cryptos: [],
    cryptoPurchases: [],
    cryptoValuations: [],
    vehicles: [],
    vehicleValuations: [],
    pensionPlans: [],
    pensionPlanValuations: [],
    cashHoldings: [],
    cashBalances: [],
  };
}

describe('bankAccountsValueAsOf', () => {
  it('usa el último saldo con fecha <= asOf (forward-fill)', () => {
    const accounts = [{ id: 'a1' } as any];
    // orden descendente, como llegan de la API
    const balances = [
      { bankAccountId: 'a1', euros: '1200.00', date: '2026-03-01' },
      { bankAccountId: 'a1', euros: '1000.00', date: '2026-01-01' },
    ] as any;

    expect(bankAccountsValueAsOf(accounts, balances, '2026-02-01')).toBe(1000);
    expect(bankAccountsValueAsOf(accounts, balances, '2026-03-15')).toBe(1200);
  });

  it('una cuenta sin ningún saldo <= asOf no contribuye (no cuenta como 0 aparte, simplemente no suma)', () => {
    const accounts = [{ id: 'a1' } as any];
    const balances = [{ bankAccountId: 'a1', euros: '500.00', date: '2026-06-01' }] as any;

    expect(bankAccountsValueAsOf(accounts, balances, '2026-01-01')).toBe(0);
  });
});

describe('stocksValueAsOf', () => {
  it('una compra posterior a asOf no cuenta todavía en el nº de acciones de esa fecha', () => {
    const stocks = [{ id: 's1' } as any];
    const purchases = [
      { stockId: 's1', shareCount: '10', purchasePrice: '5', date: '2026-01-01' },
      { stockId: 's1', shareCount: '10', purchasePrice: '6', date: '2026-04-01' },
    ] as any;
    // orden descendente, como llegan de la API
    const valuations = [
      { stockId: 's1', pricePerShare: '7', date: '2026-05-01' },
      { stockId: 's1', pricePerShare: '6', date: '2026-01-15' },
    ] as any;

    // a fecha 2026-02-01 solo la primera compra (10 acciones) ha ocurrido, y la valoración
    // vigente es la de 2026-01-15 (precio 6) — la de 2026-05-01 todavía no existía
    expect(stocksValueAsOf(stocks, purchases, valuations, '2026-02-01')).toBe(60);
    // a fecha 2026-06-01 ya cuentan las dos compras (20 acciones) y la valoración de 2026-05-01
    expect(stocksValueAsOf(stocks, purchases, valuations, '2026-06-01')).toBe(140);
  });

  it('sin ninguna valoración <= asOf no contribuye aunque haya compras', () => {
    const stocks = [{ id: 's1' } as any];
    const purchases = [{ stockId: 's1', shareCount: '10', purchasePrice: '5', date: '2026-01-01' }] as any;
    const valuations = [{ stockId: 's1', pricePerShare: '7', date: '2026-05-01' }] as any;

    expect(stocksValueAsOf(stocks, purchases, valuations, '2026-02-01')).toBe(0);
  });
});

describe('totalWealthAsOf', () => {
  it('una categoría sin ninguna entrada nunca no rompe el cálculo y contribuye 0', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [{ bankAccountId: 'a1', euros: '300.00', date: '2026-01-01' }] as any;
    // el resto de categorías se quedan vacías (equivalente a "sin ninguna entrada nunca")

    expect(totalWealthAsOf(data, '2026-06-01')).toBe(300);
  });
});

describe('earliestDataDate', () => {
  it('devuelve null si no hay ningún dato en ninguna categoría', () => {
    expect(earliestDataDate(emptyData())).toBeNull();
  });

  it('devuelve la fecha más antigua entre todas las categorías', () => {
    const data = emptyData();
    data.bankAccountBalances = [{ bankAccountId: 'a1', euros: '100', date: '2025-06-01' }] as any;
    data.cashBalances = [{ cashHoldingId: 'c1', amount: '50', date: '2024-01-15' }] as any;

    expect(earliestDataDate(data)).toBe('2024-01-15');
  });
});

describe('weekEndingDates', () => {
  it('genera un punto por semana ISO (domingo) entre start y end', () => {
    // 2026-01-05 es lunes; el primer domingo es 2026-01-11
    const dates = weekEndingDates('2026-01-05', '2026-01-25');
    expect(dates).toEqual(['2026-01-11', '2026-01-18', '2026-01-25']);
  });

  it('siempre incluye "end" como último punto aunque no sea domingo', () => {
    const dates = weekEndingDates('2026-01-05', '2026-01-20');
    expect(dates[dates.length - 1]).toBe('2026-01-20');
    expect(dates).toEqual(['2026-01-11', '2026-01-18', '2026-01-20']);
  });

  it('devuelve un array vacío si start es posterior a end', () => {
    expect(weekEndingDates('2026-06-01', '2026-01-01')).toEqual([]);
  });
});

describe('wealthEvolutionSeries', () => {
  it('no genera puntos anteriores al primer dato real, aunque el rango pedido empiece antes', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [{ bankAccountId: 'a1', euros: '1000', date: '2026-03-10' }] as any;

    const series = wealthEvolutionSeries(data, '2020-01-01', '2026-04-01');
    expect(series[0].weekEnding >= '2026-03-10').toBe(true);
    expect(series[0].total).toBe(1000);
  });

  it('vacía si el usuario no tiene ningún dato', () => {
    expect(wealthEvolutionSeries(emptyData(), '2026-01-01', '2026-06-01')).toEqual([]);
  });

  it('refleja el forward-fill semana a semana', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [
      { bankAccountId: 'a1', euros: '2000', date: '2026-01-20' },
      { bankAccountId: 'a1', euros: '1000', date: '2026-01-01' },
    ] as any;

    const series = wealthEvolutionSeries(data, '2026-01-01', '2026-01-25');
    const totals = series.map((p) => p.total);
    expect(totals).toEqual([1000, 1000, 1000, 2000]);
  });
});

describe('isValidCustomRange', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('rechaza fin anterior a inicio', () => {
    expect(isValidCustomRange('2026-06-01', '2026-05-01', now)).toBe(false);
  });

  it('rechaza fin posterior a hoy', () => {
    expect(isValidCustomRange('2026-01-01', '2026-06-16', now)).toBe(false);
  });

  it('acepta un rango válido dentro del pasado', () => {
    expect(isValidCustomRange('2026-01-01', '2026-06-01', now)).toBe(true);
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('last12Months termina hoy y empieza 52 semanas antes', () => {
    const range = resolveRange('last12Months', null, emptyData(), now);
    expect(range?.end).toBe('2026-06-15');
    expect(range?.start).toBe('2025-06-16');
  });

  it('currentYear empieza el 1 de enero del año actual', () => {
    const range = resolveRange('currentYear', null, emptyData(), now);
    expect(range).toEqual({ start: '2026-01-01', end: '2026-06-15' });
  });

  it('allTime devuelve null si no hay ningún dato', () => {
    expect(resolveRange('allTime', null, emptyData(), now)).toBeNull();
  });

  it('allTime empieza en la fecha más antigua disponible', () => {
    const data = emptyData();
    data.cashBalances = [{ cashHoldingId: 'c1', amount: '10', date: '2023-05-01' }] as any;
    expect(resolveRange('allTime', null, data, now)).toEqual({ start: '2023-05-01', end: '2026-06-15' });
  });

  it('custom devuelve null si el rango es inválido', () => {
    expect(resolveRange('custom', { start: '2026-06-01', end: '2026-01-01' }, emptyData(), now)).toBeNull();
  });

  it('custom devuelve null si no se ha indicado ningún rango', () => {
    expect(resolveRange('custom', null, emptyData(), now)).toBeNull();
  });

  it('custom devuelve el rango indicado si es válido', () => {
    expect(resolveRange('custom', { start: '2026-01-01', end: '2026-03-01' }, emptyData(), now)).toEqual({
      start: '2026-01-01',
      end: '2026-03-01',
    });
  });
});

describe('wealthEvolutionByCategorySeries', () => {
  it('una categoría sin ninguna entrada nunca queda en 0 en toda la serie, sin afectar a las demás', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [{ bankAccountId: 'a1', euros: '1000', date: '2026-01-01' }] as any;
    // el resto de categorías se quedan vacías (sin ninguna entrada nunca)

    const series = wealthEvolutionByCategorySeries(data, '2026-01-01', '2026-01-11');
    for (const point of series) {
      expect(point.bankAccounts).toBe(1000);
      expect(point.stocks).toBe(0);
      expect(point.funds).toBe(0);
      expect(point.cryptos).toBe(0);
      expect(point.vehicles).toBe(0);
      expect(point.pensionPlans).toBe(0);
      expect(point.cash).toBe(0);
    }
  });

  it('cada categoría hace su propio forward-fill de forma independiente', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [
      { bankAccountId: 'a1', euros: '2000', date: '2026-01-20' },
      { bankAccountId: 'a1', euros: '1000', date: '2026-01-01' },
    ] as any;
    data.cashHoldings = [{ id: 'c1' } as any];
    data.cashBalances = [{ cashHoldingId: 'c1', amount: '50', date: '2026-01-10' }] as any;

    const series = wealthEvolutionByCategorySeries(data, '2026-01-01', '2026-01-25');
    const byWeek = Object.fromEntries(series.map((p) => [p.weekEnding, p]));
    // antes de que exista efectivo, esa categoría no cuenta (0), aunque la cuenta bancaria ya tenga datos
    expect(byWeek['2026-01-04']).toMatchObject({ bankAccounts: 1000, cash: 0 });
    // tras la primera entrada de efectivo, ambas evolucionan cada una con su propio historial
    expect(byWeek['2026-01-11']).toMatchObject({ bankAccounts: 1000, cash: 50 });
    expect(byWeek['2026-01-25']).toMatchObject({ bankAccounts: 2000, cash: 50 });
  });

  it('vacía si el usuario no tiene ningún dato', () => {
    expect(wealthEvolutionByCategorySeries(emptyData(), '2026-01-01', '2026-06-01')).toEqual([]);
  });
});

describe('liquidityRatioSeries', () => {
  it('calcula el % de cuentas bancarias + efectivo sobre el total de cada semana', () => {
    const data = emptyData();
    data.bankAccounts = [{ id: 'a1' } as any];
    data.bankAccountBalances = [{ bankAccountId: 'a1', euros: '300', date: '2026-01-01' }] as any;
    data.vehicles = [{ id: 'v1' } as any];
    data.vehicleValuations = [{ vehicleId: 'v1', value: '700', date: '2026-01-01' }] as any;

    const series = liquidityRatioSeries(data, '2026-01-01', '2026-01-01');
    // total = 300 + 700 = 1000; líquido = 300 → 30%
    expect(series).toEqual([{ weekEnding: '2026-01-01', ratioPercent: 30 }]);
  });

  it('devuelve null cuando el total de esa semana es 0', () => {
    // earliestDataDate exige al menos una entrada para generar la serie; con una valoración
    // de 0 el total de esa semana es 0 y el ratio no se puede calcular.
    const data = emptyData();
    data.vehicles = [{ id: 'v1' } as any];
    data.vehicleValuations = [{ vehicleId: 'v1', value: '0', date: '2026-01-01' }] as any;

    const series = liquidityRatioSeries(data, '2026-01-01', '2026-01-01');
    expect(series).toEqual([{ weekEnding: '2026-01-01', ratioPercent: null }]);
  });

  it('vacía si el usuario no tiene ningún dato', () => {
    expect(liquidityRatioSeries(emptyData(), '2026-01-01', '2026-06-01')).toEqual([]);
  });
});
