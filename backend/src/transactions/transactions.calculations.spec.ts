import { describe, expect, it } from 'vitest';
import { average, distinctMonthsCount, groupByCategory, sumAmounts, sumByType } from './transactions.calculations.js';

describe('transactions.calculations', () => {
  describe('sumAmounts', () => {
    it('suma importes decimales sin arrastrar errores de redondeo binario', () => {
      // 0.1 + 0.2 en coma flotante nativa da 0.30000000000000004 — con
      // decimal.js debe dar exactamente "0.30".
      expect(sumAmounts([{ amount: '0.10' }, { amount: '0.20' }])).toBe('0.30');
    });

    it('devuelve "0.00" para una lista vacía', () => {
      expect(sumAmounts([])).toBe('0.00');
    });
  });

  describe('sumByType', () => {
    it('suma solo los movimientos del tipo indicado', () => {
      const transactions = [
        { type: 'INCOME' as const, amount: '1000.00' },
        { type: 'EXPENSE' as const, amount: '300.50' },
        { type: 'INCOME' as const, amount: '50.00' },
      ];
      expect(sumByType(transactions, 'INCOME')).toBe('1050.00');
      expect(sumByType(transactions, 'EXPENSE')).toBe('300.50');
    });
  });

  describe('average', () => {
    it('divide el total entre los días dados', () => {
      expect(average('300.00', 10)).toBe('30.00');
    });

    it('con 0 días (o menos), devuelve "0.00" en vez de dividir por cero', () => {
      expect(average('300.00', 0)).toBe('0.00');
    });
  });

  describe('distinctMonthsCount', () => {
    it('cuenta los meses distintos (YYYY-MM) representados', () => {
      expect(distinctMonthsCount(['2026-08-01', '2026-08-15', '2026-07-31'])).toBe(2);
    });

    it('devuelve 0 para una lista vacía', () => {
      expect(distinctMonthsCount([])).toBe(0);
    });
  });

  describe('groupByCategory', () => {
    it('agrupa y suma por categoryId', () => {
      const transactions = [
        { categoryId: 'cat-1', amount: '100.00' },
        { categoryId: 'cat-2', amount: '50.00' },
        { categoryId: 'cat-1', amount: '25.50' },
      ];
      const result = groupByCategory(transactions);
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ categoryId: 'cat-1', total: '125.50' });
      expect(result).toContainEqual({ categoryId: 'cat-2', total: '50.00' });
    });
  });
});
