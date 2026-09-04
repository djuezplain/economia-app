import { describe, expect, it } from 'vitest';
import { purchaseValue } from './wealth.calculations.js';

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
});
