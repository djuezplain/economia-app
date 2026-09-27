import { describe, expect, it } from 'vitest';
import { fifoPositionState, fundsTotal, isFundPositionClosed, totalRealizedGainLoss } from './fund-shared';
import type { Fund } from '../api/funds';
import type { FundPurchase } from '../api/fund-purchases';
import type { FundSale } from '../api/fund-sales';
import type { FundValuation } from '../api/fund-valuations';

describe('isFundPositionClosed', () => {
  it('no está cerrada sin ninguna compra', () => {
    expect(isFundPositionClosed([], [])).toBe(false);
  });

  it('está cerrada cuando se ha vendido todo lo comprado', () => {
    const purchases = [{ id: 'p1', date: '2024-01-01', shareCount: '10', purchasePrice: '100', createdAt: '2024-01-01T00:00:00.000Z' }];
    const sales = [{ id: 's1', date: '2024-06-01', shareCount: '10', salePrice: '150', createdAt: '2024-06-01T00:00:00.000Z' }];
    expect(isFundPositionClosed(purchases, sales)).toBe(true);
  });

  it('no está cerrada si todavía queda cartera', () => {
    const purchases = [{ id: 'p1', date: '2024-01-01', shareCount: '10', purchasePrice: '100', createdAt: '2024-01-01T00:00:00.000Z' }];
    const sales = [{ id: 's1', date: '2024-06-01', shareCount: '4', salePrice: '150', createdAt: '2024-06-01T00:00:00.000Z' }];
    expect(isFundPositionClosed(purchases, sales)).toBe(false);
  });
});

describe('fifoPositionState', () => {
  it('una venta que cruza dos lotes consume primero el más antiguo (FIFO)', () => {
    const purchases = [
      { id: 'p-a', date: '2026-08-01', shareCount: '10', purchasePrice: '20.00', createdAt: '2026-08-01T00:00:00.000Z' },
      { id: 'p-b', date: '2026-08-10', shareCount: '10', purchasePrice: '30.00', createdAt: '2026-08-10T00:00:00.000Z' },
    ];
    const sales = [{ id: 's-1', date: '2026-08-15', shareCount: '15', salePrice: '40.00', createdAt: '2026-08-15T00:00:00.000Z' }];

    const state = fifoPositionState(purchases, sales);

    // Consume 10 @ 20,00 € (200,00 €) + 5 @ 30,00 € (150,00 €) = coste 350,00 €.
    // Ganancia: 15 × 40,00 € − 350,00 € = 250,00 €.
    expect(state.heldShares).toBe('5.00000000');
    expect(state.heldCost).toBe('150.00');
    expect(state.realizedGainLossBySaleId['s-1']).toBe('250.00');
    expect(totalRealizedGainLoss(state)).toBe('250.00');
  });

  it('dos compras el mismo día se consumen por orden de alta (createdAt), no por el orden de entrada', () => {
    const purchaseOlder = { id: 'p-older', date: '2026-08-01', shareCount: '10', purchasePrice: '20.00', createdAt: '2026-08-01T09:00:00.000Z' };
    const purchaseNewer = { id: 'p-newer', date: '2026-08-01', shareCount: '10', purchasePrice: '30.00', createdAt: '2026-08-01T10:00:00.000Z' };
    const sale = { id: 's-1', date: '2026-08-02', shareCount: '10', salePrice: '40.00', createdAt: '2026-08-02T00:00:00.000Z' };

    // Orden [más reciente, más antigua] a propósito — el mismo que sirve la API real.
    const state = fifoPositionState([purchaseNewer, purchaseOlder], [sale]);

    expect(state.heldShares).toBe('10.00000000');
    expect(state.heldCost).toBe('300.00');
    expect(state.realizedGainLossBySaleId['s-1']).toBe('200.00');
  });

  it('sin ninguna venta, todo lo comprado queda en cartera', () => {
    const purchases = [{ id: 'p1', date: '2026-08-01', shareCount: '10', purchasePrice: '20.00', createdAt: '2026-08-01T00:00:00.000Z' }];
    const state = fifoPositionState(purchases, []);
    expect(state.heldShares).toBe('10.00000000');
    expect(state.heldCost).toBe('200.00');
    expect(totalRealizedGainLoss(state)).toBe('0.00');
  });
});

describe('fundsTotal', () => {
  const FUND: Fund = { id: 'fund-1', userId: 'user-1', custodyBank: 'MyInvestor', fund: 'Vanguard', createdAt: '', updatedAt: '' };

  it('usa lo que queda en cartera tras ventas, no el total histórico comprado', () => {
    const purchases: FundPurchase[] = [
      { id: 'p1', fundId: 'fund-1', shareCount: '10', purchasePrice: '20.00', date: '2026-08-01', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '' },
    ];
    const sales: FundSale[] = [
      { id: 's1', fundId: 'fund-1', shareCount: '4', salePrice: '25.00', date: '2026-08-15', createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '' },
    ];
    const valuations: FundValuation[] = [{ id: 'v1', fundId: 'fund-1', pricePerShare: '30.00', date: '2026-09-01', createdAt: '', updatedAt: '' }];

    // Cartera: 6 participaciones (10 − 4) × 30,00 € = 180,00 €.
    expect(fundsTotal([FUND], purchases, sales, valuations)).toBe('180.00');
  });

  it('un fondo sin ninguna valoración contribuye 0', () => {
    expect(fundsTotal([FUND], [], [], [])).toBe('0.00');
  });
});
