import { describe, expect, it } from 'vitest';
import { average, distinctMonthsCount, groupByCategory, groupBySubcategory, sumAmounts, sumByType } from './calculations';

// Mismos casos que `backend/src/transactions/transactions.calculations.spec.ts`
// (espejo exacto, ver comentario de `calculations.ts`).
describe('offline/calculations', () => {
  describe('sumAmounts', () => {
    it('suma importes decimales sin arrastrar errores de redondeo binario', () => {
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

  describe('groupBySubcategory', () => {
    it('agrupa y suma por subcategoryId, ignorando los movimientos sin subcategoría', () => {
      const transactions = [
        { subcategoryId: 'sub-1', amount: '30.00' },
        { subcategoryId: null, amount: '999.00' },
        { subcategoryId: 'sub-2', amount: '20.00' },
        { subcategoryId: 'sub-1', amount: '5.50' },
      ];
      const result = groupBySubcategory(transactions);
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ subcategoryId: 'sub-1', total: '35.50' });
      expect(result).toContainEqual({ subcategoryId: 'sub-2', total: '20.00' });
    });

    it('devuelve una lista vacía si ningún movimiento tiene subcategoría', () => {
      expect(groupBySubcategory([{ subcategoryId: null, amount: '10.00' }])).toEqual([]);
    });
  });
});
