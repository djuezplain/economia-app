import { describe, expect, it } from 'vitest';
import { stockCashFlows, stockDetailStats, stockOperationsTimeline, stockRealizedGainLossByYear, xirr } from './stock-detail.calculations';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockSale } from '../api/stock-sales';
import type { StockValuation } from '../api/stock-valuations';
import type { StockDividend } from '../api/stock-dividends';

const ASOF = '2024-12-31';

function purchase(overrides: Partial<StockPurchase> = {}): StockPurchase {
  return {
    id: 'p1',
    stockId: 's1',
    shareCount: '10',
    purchasePrice: '100',
    date: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function sale(overrides: Partial<StockSale> = {}): StockSale {
  return {
    id: 'v1',
    stockId: 's1',
    shareCount: '4',
    salePrice: '150',
    date: '2024-06-01',
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function valuation(overrides: Partial<StockValuation> = {}): StockValuation {
  return {
    id: 'val1',
    stockId: 's1',
    pricePerShare: '120',
    date: '2024-12-01',
    createdAt: '2024-12-01T00:00:00.000Z',
    updatedAt: '2024-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function dividend(overrides: Partial<StockDividend> = {}): StockDividend {
  return {
    id: 'd1',
    stockId: 's1',
    netAmount: '81',
    retentionPercent: '19',
    date: '2024-09-01',
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stockOperationsTimeline', () => {
  it('combina compras, ventas, dividendos y valoraciones ordenadas por fecha descendente', () => {
    const rows = stockOperationsTimeline([purchase()], [sale()], [dividend()], [valuation()]);
    expect(rows.map((r) => r.kind)).toEqual(['valuation', 'dividend', 'sale', 'purchase']);
  });

  it('en empate de fecha, ordena por createdAt descendente', () => {
    const early = purchase({ id: 'p-early', date: '2024-01-01', createdAt: '2024-01-01T08:00:00.000Z' });
    const late = purchase({ id: 'p-late', date: '2024-01-01', createdAt: '2024-01-01T20:00:00.000Z' });
    const rows = stockOperationsTimeline([early, late], [], [], []);
    expect(rows.map((r) => r.id)).toEqual(['p-late', 'p-early']);
  });

  it('incluye la ganancia/pérdida realizada de cada venta (FIFO)', () => {
    const rows = stockOperationsTimeline([purchase({ shareCount: '10', purchasePrice: '100' })], [sale({ shareCount: '4', salePrice: '150' })], [], []);
    const saleRow = rows.find((r) => r.kind === 'sale');
    expect(saleRow).toMatchObject({ realizedGainLoss: '200.00' });
  });
});

describe('xirr', () => {
  it('devuelve null con menos de dos flujos', () => {
    expect(xirr([{ date: '2024-01-01', amount: -100 }])).toBeNull();
  });

  it('devuelve null si todos los flujos tienen el mismo signo (nunca se recuperó nada)', () => {
    expect(
      xirr([
        { date: '2024-01-01', amount: -100 },
        { date: '2024-06-01', amount: -50 },
      ]),
    ).toBeNull();
  });

  it('calcula ~100% anual para una inversión que se duplica en exactamente un año', () => {
    const rate = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2025-01-01', amount: 2000 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeCloseTo(100, 0);
  });

  it('devuelve null si todos los flujos son el mismo día (sin tiempo transcurrido, "anual" no tiene sentido)', () => {
    const rate = xirr([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1000 },
    ]);
    expect(rate).toBeNull();
  });
});

describe('stockCashFlows', () => {
  it('compras en negativo, ventas y dividendos en positivo, más el valor actual a `asOf`', () => {
    const flows = stockCashFlows(
      [purchase({ shareCount: '10', purchasePrice: '100' })],
      [sale({ shareCount: '4', salePrice: '150' })],
      [dividend({ netAmount: '81' })],
      '720.00',
      '6',
      ASOF,
    );
    expect(flows).toEqual([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-06-01', amount: 600 },
      { date: '2024-09-01', amount: 81 },
      { date: ASOF, amount: 720 },
    ]);
  });

  it('sin nada en cartera, no añade el flujo final', () => {
    const flows = stockCashFlows([purchase()], [], [], null, '0', ASOF);
    expect(flows).toHaveLength(1);
  });
});

describe('stockRealizedGainLossByYear', () => {
  it('agrupa la ganancia/pérdida realizada por año de venta, más reciente primero', () => {
    const purchases = [purchase({ shareCount: '20', purchasePrice: '100' })];
    const sales = [
      sale({ id: 's-2024', date: '2024-06-01', shareCount: '4', salePrice: '150' }),
      sale({ id: 's-2025', date: '2025-03-01', shareCount: '4', salePrice: '80' }),
    ];
    const rows = stockRealizedGainLossByYear(purchases, sales);
    expect(rows).toEqual([
      { year: '2025', amount: '-80.00' },
      { year: '2024', amount: '200.00' },
    ]);
  });

  it('sin ventas, devuelve una lista vacía', () => {
    expect(stockRealizedGainLossByYear([purchase()], [])).toEqual([]);
  });
});

describe('stockDetailStats', () => {
  it('una posición sin ninguna compra no tiene valor actual ni fechas', () => {
    const stats = stockDetailStats([], [], [], [], ASOF);
    expect(stats.heldShares).toBe('0.00000000');
    expect(stats.currentValue).toBeNull();
    expect(stats.firstPurchaseDate).toBeNull();
    expect(stats.lastOperationDate).toBeNull();
    expect(stats.totalReturnAmount).toBeNull();
    expect(stats.annualizedReturnPercent).toBeNull();
  });

  it('calcula coste en cartera, valor actual y ganancia/pérdida no realizada', () => {
    const stats = stockDetailStats([purchase({ shareCount: '10', purchasePrice: '100' })], [], [], [valuation({ pricePerShare: '120' })], ASOF);
    expect(stats.heldShares).toBe('10.00000000');
    expect(stats.heldCost).toBe('1000.00');
    expect(stats.currentValue).toBe('1200.00');
    expect(stats.unrealizedGainLossAmount).toBe('200.00');
    expect(stats.unrealizedGainLossPercent).toBeCloseTo(20);
    expect(stats.averageHeldPurchasePrice).toBe('100.0000');
  });

  it('descuenta las ventas FIFO del coste y las acciones en cartera', () => {
    const stats = stockDetailStats(
      [purchase({ shareCount: '10', purchasePrice: '100' })],
      [sale({ shareCount: '4', salePrice: '150' })],
      [],
      [valuation({ pricePerShare: '120' })],
      ASOF,
    );
    expect(stats.heldShares).toBe('6.00000000');
    expect(stats.heldCost).toBe('600.00');
    expect(stats.realizedGainLoss).toBe('200.00');
    expect(stats.totalSharesSold).toBe('4.00000000');
  });

  it('suma los dividendos netos y calcula el bruto a partir de la retención', () => {
    const stats = stockDetailStats([purchase()], [], [dividend({ netAmount: '81', retentionPercent: '19' })], [], ASOF);
    expect(stats.dividendsNet).toBe('81.00');
    expect(stats.dividendsGross).toBe('100.00');
  });

  it('la rentabilidad total combina ganancia realizada, no realizada y dividendos netos sobre lo invertido', () => {
    const stats = stockDetailStats(
      [purchase({ shareCount: '10', purchasePrice: '100' })],
      [sale({ shareCount: '4', salePrice: '150' })],
      [dividend({ netAmount: '81', retentionPercent: '19' })],
      [valuation({ pricePerShare: '120' })],
      ASOF,
    );
    // Invertido: 1000. Realizado: 200. No realizado: 720-600=120. Dividendos netos: 81. Total: 401.
    expect(stats.totalReturnAmount).toBe('401.00');
    expect(stats.totalReturnPercent).toBeCloseTo(40.1);
    expect(stats.annualizedReturnPercent).not.toBeNull();
  });

  it('sin ninguna compra en cartera ni valoración, la TIR es null (ningún flujo positivo)', () => {
    const stats = stockDetailStats([purchase()], [], [], [], ASOF);
    expect(stats.annualizedReturnPercent).toBeNull();
  });
});
