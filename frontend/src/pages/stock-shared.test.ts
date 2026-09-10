import { describe, expect, it } from 'vitest';
import {
  gainLossPercent,
  gainLossPercentWithDividends,
  isStockPositionClosed,
  purchaseValue,
  totalGrossDividends,
} from './stock-shared';

describe('purchaseValue', () => {
  it('multiplica precio por cantidad', () => {
    expect(purchaseValue('10.5', '4')).toBe('42.00');
  });

  it('devuelve vacío con valores no numéricos', () => {
    expect(purchaseValue('', '4')).toBe('');
  });
});

describe('gainLossPercent', () => {
  it('calcula el % de ganancia sobre el coste', () => {
    expect(gainLossPercent('120', '100')).toBe(20);
  });

  it('devuelve null sin coste (posición sin compras)', () => {
    expect(gainLossPercent('0', '0')).toBeNull();
  });
});

describe('gainLossPercentWithDividends', () => {
  it('suma los dividendos al valor actual antes de comparar con el coste', () => {
    expect(gainLossPercentWithDividends('100', '100', '20')).toBe(20);
  });
});

describe('totalGrossDividends', () => {
  it('bruto = neto / (1 - retención/100), sumado dividendo a dividendo', () => {
    expect(totalGrossDividends([{ netAmount: '81', retentionPercent: '19' }])).toBe('100.00');
  });
});

describe('isStockPositionClosed', () => {
  it('no está cerrada sin ninguna compra', () => {
    expect(isStockPositionClosed([], [])).toBe(false);
  });

  it('está cerrada cuando se ha vendido todo lo comprado', () => {
    const purchases = [{ id: 'p1', date: '2024-01-01', shareCount: '10', purchasePrice: '100', createdAt: '2024-01-01T00:00:00.000Z' }];
    const sales = [{ id: 's1', date: '2024-06-01', shareCount: '10', salePrice: '150', createdAt: '2024-06-01T00:00:00.000Z' }];
    expect(isStockPositionClosed(purchases, sales)).toBe(true);
  });

  it('no está cerrada si todavía queda cartera', () => {
    const purchases = [{ id: 'p1', date: '2024-01-01', shareCount: '10', purchasePrice: '100', createdAt: '2024-01-01T00:00:00.000Z' }];
    const sales = [{ id: 's1', date: '2024-06-01', shareCount: '4', salePrice: '150', createdAt: '2024-06-01T00:00:00.000Z' }];
    expect(isStockPositionClosed(purchases, sales)).toBe(false);
  });
});
