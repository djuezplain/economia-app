import { describe, expect, it } from 'vitest';
import {
  comparisonChanges,
  comparisonMetrics,
  currentMonthIso,
  daysInMonth,
  daysInYear,
  monthlyEvolution,
  percentChange,
  periodLabel,
  periodRanges,
  resolveDaysForMonth,
  resolveDaysForYear,
  savingsAmount,
  savingsPercent,
} from './dashboard.calculations.js';

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

  describe('currentMonthIso', () => {
    it('formatea el mes de `now` como YYYY-MM', () => {
      expect(currentMonthIso(new Date('2026-08-28T10:00:00.000Z'))).toBe('2026-08');
      expect(currentMonthIso(new Date('2026-01-05T10:00:00.000Z'))).toBe('2026-01');
    });
  });

  describe('daysInMonth', () => {
    it('días totales de un mes, sin depender de `now`', () => {
      expect(daysInMonth('2026-07')).toBe(31);
      expect(daysInMonth('2026-02')).toBe(28);
      expect(daysInMonth('2024-02')).toBe(29); // bisiesto
    });
  });

  describe('daysInYear', () => {
    it('366 en un año bisiesto, 365 en uno normal', () => {
      expect(daysInYear(2024)).toBe(366);
      expect(daysInYear(2026)).toBe(365);
    });

    it('respeta la regla gregoriana completa (2100 no es bisiesto)', () => {
      expect(daysInYear(2100)).toBe(365);
      expect(daysInYear(2000)).toBe(366); // múltiplo de 400, sí es bisiesto
    });
  });

  describe('resolveDaysForYear', () => {
    it('año en curso: día del año transcurrido (1-indexado)', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      // 31(ene)+28(feb)+31(mar)+30(abr)+31(may)+30(jun)+31(jul)+28(ago) = 240
      expect(resolveDaysForYear(2026, now)).toBe(240);
    });

    it('el 1 de enero cuenta como día 1, no día 0', () => {
      const now = new Date('2026-01-01T10:00:00.000Z');
      expect(resolveDaysForYear(2026, now)).toBe(1);
    });

    it('año ya cerrado: días totales de ese año', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      expect(resolveDaysForYear(2025, now)).toBe(365);
      expect(resolveDaysForYear(2024, now)).toBe(366); // bisiesto
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

  describe('periodRanges (spec 013)', () => {
    it('semana: lunes-domingo (ISO), recortada a los días transcurridos', () => {
      const now = new Date('2026-08-28T10:00:00.000Z'); // viernes
      expect(periodRanges('week', now)).toEqual({
        currentStart: '2026-08-24',
        currentEnd: '2026-08-28',
        previousStart: '2026-08-17',
        previousEnd: '2026-08-21',
        days: 5,
      });
    });

    it('mes en curso: recortado a los días transcurridos, no al mes completo', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      expect(periodRanges('month', now)).toEqual({
        currentStart: '2026-08-01',
        currentEnd: '2026-08-28',
        previousStart: '2026-07-01',
        previousEnd: '2026-07-28',
        days: 28,
      });
    });

    it('H2 criterio 2: si el mes anterior tiene menos días que los transcurridos del actual, se recorta a los del anterior', () => {
      // 31 de marzo (31 días transcurridos) vs. febrero de 2026 (solo 28 días).
      const now = new Date('2026-03-31T10:00:00.000Z');
      expect(periodRanges('month', now)).toEqual({
        currentStart: '2026-03-01',
        currentEnd: '2026-03-28',
        previousStart: '2026-02-01',
        previousEnd: '2026-02-28',
        days: 28,
      });
    });

    it('mes: cruza el año al calcular el mes anterior (enero → diciembre del año pasado)', () => {
      const now = new Date('2026-01-15T10:00:00.000Z');
      expect(periodRanges('month', now)).toEqual({
        currentStart: '2026-01-01',
        currentEnd: '2026-01-15',
        previousStart: '2025-12-01',
        previousEnd: '2025-12-15',
        days: 15,
      });
    });

    it('trimestre natural: Q3 en curso vs. Q2 (no el mismo trimestre del año pasado)', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      expect(periodRanges('quarter', now)).toEqual({
        currentStart: '2026-07-01',
        currentEnd: '2026-08-28',
        previousStart: '2026-04-01',
        previousEnd: '2026-05-29',
        days: 59,
      });
    });

    it('trimestre: cruza el año al calcular el trimestre anterior (Q1 → Q4 del año pasado)', () => {
      const now = new Date('2026-02-10T10:00:00.000Z');
      expect(periodRanges('quarter', now)).toEqual({
        currentStart: '2026-01-01',
        currentEnd: '2026-02-10',
        previousStart: '2025-10-01',
        previousEnd: '2025-11-10',
        days: 41,
      });
    });

    it('año en curso vs. año anterior, mismo día transcurrido', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      expect(periodRanges('year', now)).toEqual({
        currentStart: '2026-01-01',
        currentEnd: '2026-08-28',
        previousStart: '2025-01-01',
        previousEnd: '2025-08-28',
        days: 240,
      });
    });
  });

  describe('periodLabel (spec 013)', () => {
    it('semana: número de semana ISO', () => {
      expect(periodLabel('week', '2026-08-24')).toBe('Semana 35 · 2026');
    });

    it('mes: nombre del mes capitalizado', () => {
      expect(periodLabel('month', '2026-08-01')).toBe('Agosto 2026');
    });

    it('trimestre', () => {
      expect(periodLabel('quarter', '2026-07-01')).toBe('Q3 2026');
    });

    it('año', () => {
      expect(periodLabel('year', '2026-01-01')).toBe('2026');
    });
  });

  describe('comparisonMetrics / percentChange / comparisonChanges (spec 013)', () => {
    it('comparisonMetrics filtra por tipo y calcula nº, total y media/día', () => {
      const transactions = [
        { type: 'EXPENSE' as const, amount: '30.00' },
        { type: 'EXPENSE' as const, amount: '20.00' },
        { type: 'INCOME' as const, amount: '1000.00' },
      ];
      expect(comparisonMetrics(transactions, 'EXPENSE', 5)).toEqual({ count: 2, total: '50.00', averagePerDay: '10.00' });
    });

    it('percentChange: variación firmada, positiva si sube y negativa si baja', () => {
      expect(percentChange('150.00', '100.00')).toBe('50.00');
      expect(percentChange('80.00', '100.00')).toBe('-20.00');
    });

    it('percentChange: null si la base (periodo anterior) es 0, sin dividir por cero', () => {
      expect(percentChange('50.00', '0.00')).toBeNull();
      expect(percentChange(0, 0)).toBeNull();
    });

    it('comparisonChanges aplica percentChange a las 3 métricas', () => {
      const current = { count: 4, total: '200.00', averagePerDay: '20.00' };
      const previous = { count: 2, total: '100.00', averagePerDay: '10.00' };
      expect(comparisonChanges(current, previous)).toEqual({ count: '100.00', total: '100.00', averagePerDay: '100.00' });
    });

    it('comparisonChanges: null en la métrica cuyo periodo anterior es 0', () => {
      const current = { count: 2, total: '50.00', averagePerDay: '5.00' };
      const previous = { count: 0, total: '0.00', averagePerDay: '0.00' };
      expect(comparisonChanges(current, previous)).toEqual({ count: null, total: null, averagePerDay: null });
    });
  });
});
