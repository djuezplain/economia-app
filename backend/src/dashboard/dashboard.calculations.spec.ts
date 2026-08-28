import { describe, expect, it } from 'vitest';
import { monthlyEvolution, resolveDaysForMonth, savingsAmount, savingsPercent } from './dashboard.calculations.js';

describe('dashboard.calculations', () => {
  describe('savingsAmount', () => {
    it('ingresos − gastos', () => {
      expect(savingsAmount('1000.00', '750.00')).toBe('250.00');
    });

    it('puede ser negativo si el gasto supera al ingreso', () => {
      expect(savingsAmount('100.00', '150.00')).toBe('-50.00');
    });
  });

  describe('savingsPercent', () => {
    it('calcula el % de ahorro sobre el ingreso', () => {
      expect(savingsPercent('1000.00', '750.00')).toBe('25.00');
    });

    it('devuelve null si el ingreso es 0, en vez de dividir por cero o dar 0%', () => {
      expect(savingsPercent('0.00', '50.00')).toBeNull();
      expect(savingsPercent('0.00', '0.00')).toBeNull();
    });

    it('puede ser negativo si el gasto supera al ingreso', () => {
      expect(savingsPercent('100.00', '150.00')).toBe('-50.00');
    });
  });

  describe('resolveDaysForMonth', () => {
    it('mes en curso: días transcurridos (1..hoy), no el mes completo', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      expect(resolveDaysForMonth('2026-08', now)).toBe(28);
    });

    it('mes ya cerrado: días totales de ese mes', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      // Julio de 2026 tiene 31 días.
      expect(resolveDaysForMonth('2026-07', now)).toBe(31);
    });

    it('respeta los años bisiestos al calcular los días totales de un mes cerrado', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      // Febrero de 2024 (bisiesto) tiene 29 días.
      expect(resolveDaysForMonth('2024-02', now)).toBe(29);
    });
  });

  describe('monthlyEvolution', () => {
    it('devuelve las 12 entradas del año, con "0.00" en los meses sin movimientos', () => {
      const transactions = [
        { type: 'INCOME' as const, date: '2026-01-05', amount: '2000.00' },
        { type: 'EXPENSE' as const, date: '2026-01-10', amount: '500.00' },
        { type: 'INCOME' as const, date: '2026-03-01', amount: '2100.00' },
        { type: 'EXPENSE' as const, date: '2026-03-15', amount: '900.50' },
        // Movimiento de otro año — no debe contar en ningún mes de 2026.
        { type: 'INCOME' as const, date: '2025-01-01', amount: '9999.00' },
      ];

      const result = monthlyEvolution(transactions, 2026);

      expect(result).toHaveLength(12);
      expect(result[0]).toEqual({ month: '2026-01', income: '2000.00', expense: '500.00', savings: '1500.00' });
      expect(result[1]).toEqual({ month: '2026-02', income: '0.00', expense: '0.00', savings: '0.00' });
      expect(result[2]).toEqual({ month: '2026-03', income: '2100.00', expense: '900.50', savings: '1199.50' });
      expect(result[11]).toEqual({ month: '2026-12', income: '0.00', expense: '0.00', savings: '0.00' });
    });

    it('devuelve las 12 entradas a "0.00" para un año sin ningún movimiento', () => {
      const result = monthlyEvolution([], 2026);
      expect(result).toHaveLength(12);
      expect(result.every((entry) => entry.income === '0.00' && entry.expense === '0.00' && entry.savings === '0.00')).toBe(true);
    });
  });
});
