import { describe, expect, it } from 'vitest';
import { receiptTotal } from './receipt-total.js';

// Spec 048 plan.md §0 decisión 6 / §2.
describe('receiptTotal', () => {
  it('con líneas, es su suma (el total impreso se ignora)', () => {
    expect(receiptTotal([{ amount: '1.30' }, { amount: '1.80' }], '39.27')).toBe('3.10');
  });

  it('sin líneas, es el total impreso', () => {
    expect(receiptTotal([], '64.20')).toBe('64.20');
  });

  it('sin líneas ni total, no hay importe', () => {
    expect(receiptTotal([], null)).toBeNull();
  });

  it('suma sin errores de coma flotante', () => {
    expect(receiptTotal([{ amount: '0.10' }, { amount: '0.20' }], null)).toBe('0.30');
  });
});
