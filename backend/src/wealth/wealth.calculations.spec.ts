import { describe, expect, it } from 'vitest';
import { currentValue, purchaseValue, totalCost, totalShares } from './wealth.calculations.js';

describe('wealth.calculations', () => {
  describe('purchaseValue', () => {
    it('precio de compra × número de acciones', () => {
      expect(purchaseValue('10.50', '4')).toBe('42.00');
    });

    it('admite un número de acciones fraccionario', () => {
      expect(purchaseValue('100.00', '0.5')).toBe('50.00');
    });

    it('redondea a 2 decimales', () => {
      expect(purchaseValue('3.333', '3')).toBe('10.00');
    });
  });

  describe('totalShares (spec 020)', () => {
    it('suma el número de acciones de todas las compras', () => {
      expect(totalShares([{ shareCount: '10' }, { shareCount: '5' }])).toBe('15.0000');
    });

    it('admite compras fraccionarias', () => {
      expect(totalShares([{ shareCount: '0.5' }, { shareCount: '0.25' }])).toBe('0.7500');
    });

    it('sin ninguna compra, 0', () => {
      expect(totalShares([])).toBe('0.0000');
    });
  });

  describe('totalCost (spec 020)', () => {
    it('suma el valor de compra (precio × cantidad) de todas las compras', () => {
      expect(totalCost([{ shareCount: '10', purchasePrice: '28.50' }, { shareCount: '5', purchasePrice: '30.00' }])).toBe('435.00');
    });

    it('sin ninguna compra, 0', () => {
      expect(totalCost([])).toBe('0.00');
    });
  });

  describe('currentValue (spec 020, revisión)', () => {
    it('precio por acción × número de acciones', () => {
      expect(currentValue('35.00', '15')).toBe('525.00');
    });

    it('admite un número de acciones fraccionario', () => {
      expect(currentValue('100.00', '0.5')).toBe('50.00');
    });

    it('redondea a 2 decimales', () => {
      expect(currentValue('3.333', '3')).toBe('10.00');
    });
  });
});
