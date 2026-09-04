import { describe, expect, it } from 'vitest';
import {
  absoluteDifference,
  bucketBySeason,
  categoryComparison,
  clippedDaysInRange,
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
  seasonalDays,
  seasonalSummary,
  SEASONS,
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

  describe('clippedDaysInRange (spec 014)', () => {
    it('rango completo cuando cabe entero dentro de [floor, ceiling]', () => {
      expect(clippedDaysInRange('2026-06-01', '2026-08-31', '2026-06-01', '2026-09-03')).toBe(92);
    });

    it('recorta por arriba (ceiling) si el rango sigue en curso', () => {
      expect(clippedDaysInRange('2026-06-01', '2026-08-31', '2026-06-01', '2026-07-10')).toBe(40);
    });

    it('recorta por abajo (floor) si el rango empieza antes de floor', () => {
      expect(clippedDaysInRange('2026-06-01', '2026-08-31', '2026-07-15', '2026-09-03')).toBe(48);
    });

    it('0 si el rango es totalmente posterior a ceiling (aún no ha empezado)', () => {
      expect(clippedDaysInRange('2026-12-01', '2026-12-31', '2026-12-01', '2026-09-03')).toBe(0);
    });

    it('0 si el rango es totalmente anterior a floor', () => {
      expect(clippedDaysInRange('2024-06-01', '2024-08-31', '2025-01-01', '2026-09-03')).toBe(0);
    });
  });

  describe('seasonalDays (spec 014)', () => {
    it('alcance "año": una estación en curso solo cuenta los días transcurridos', () => {
      const now = new Date('2026-07-10T10:00:00.000Z');
      expect(seasonalDays('summer', { kind: 'year', year: 2026 }, now)).toBe(40);
    });

    it('alcance "año": una estación que todavía no ha empezado ese año da 0 días', () => {
      const now = new Date('2026-05-01T10:00:00.000Z');
      expect(seasonalDays('summer', { kind: 'year', year: 2026 }, now)).toBe(0);
    });

    it('alcance "año": invierno son dos tramos no contiguos (ene+feb, y dic) dentro del mismo año — H2 criterio 4', () => {
      // 2026 no es bisiesto: enero+febrero = 59 días, ya cerrados a 3 de
      // septiembre; diciembre de 2026 todavía no ha llegado → 0. Total 59,
      // no 90 (que sería si se tratara como un tramo continuo dic-feb).
      const now = new Date('2026-09-03T10:00:00.000Z');
      expect(seasonalDays('winter', { kind: 'year', year: 2026 }, now)).toBe(59);
    });

    it('alcance "histórico": suma los días de cada año transcurrido, recortando al primer movimiento', () => {
      const now = new Date('2026-08-28T10:00:00.000Z');
      const scope = { kind: 'historic' as const, firstTransactionDate: '2025-07-15' };
      // Invierno: instancia de 2025 recortada a partir del 15/07/2025 dentro de
      // sus dos tramos (ene-feb 2025 queda entera antes del recorte → 0;
      // diciembre 2025 entero → 31) más la instancia de 2026 (ene-feb 2026
      // enteros → 59; diciembre 2026 aún no llega → 0) = 0 + 31 + 59 + 0 = 90.
      expect(seasonalDays('winter', scope, now)).toBe(90);
      // Verano: instancia de 2025 recortada al 15/07 → del 15/07 al 31/08 = 48
      // días; instancia de 2026 hasta el 28/08 (hoy) = 89 días. 48 + 89 = 137.
      expect(seasonalDays('summer', scope, now)).toBe(137);
    });
  });

  describe('bucketBySeason (spec 014)', () => {
    it('agrupa por el mes de la fecha, sin importar el año', () => {
      const transactions = [
        { date: '2025-01-05' }, // invierno
        { date: '2026-02-10' }, // invierno
        { date: '2026-12-24' }, // invierno
        { date: '2026-04-01' }, // primavera
        { date: '2026-07-01' }, // verano
        { date: '2026-10-01' }, // otoño
      ];
      const buckets = bucketBySeason(transactions);
      expect(buckets.winter).toHaveLength(3);
      expect(buckets.spring).toHaveLength(1);
      expect(buckets.summer).toHaveLength(1);
      expect(buckets.autumn).toHaveLength(1);
    });
  });

  describe('absoluteDifference (spec 014)', () => {
    it('valor absoluto de la diferencia, sin importar el orden de los argumentos', () => {
      expect(absoluteDifference('300.00', '10.00')).toBe('290.00');
      expect(absoluteDifference('10.00', '300.00')).toBe('290.00');
    });
  });

  describe('seasonalSummary (spec 014)', () => {
    it('devuelve las 4 estaciones en orden canónico, con sus cifras y la comparación mejor/peor', () => {
      const now = new Date('2026-09-03T10:00:00.000Z');
      const transactions = [
        { type: 'EXPENSE' as const, date: '2026-01-10', amount: '100.00' },
        { type: 'EXPENSE' as const, date: '2026-02-05', amount: '50.00' },
        { type: 'EXPENSE' as const, date: '2026-04-01', amount: '30.00' },
        { type: 'EXPENSE' as const, date: '2026-07-01', amount: '200.00' },
        { type: 'EXPENSE' as const, date: '2026-08-15', amount: '100.00' },
        { type: 'EXPENSE' as const, date: '2026-09-01', amount: '10.00' },
        // Ingreso en la misma fecha — no debe contar en un análisis de EXPENSE.
        { type: 'INCOME' as const, date: '2026-07-01', amount: '9999.00' },
      ];

      const result = seasonalSummary(transactions, 'EXPENSE', { kind: 'year', year: 2026 }, now);

      expect(result.seasons.map((s) => s.season)).toEqual([...SEASONS]);
      expect(result.seasons).toEqual([
        { season: 'winter', count: 2, total: '150.00', averagePerDay: '2.54' },
        { season: 'spring', count: 1, total: '30.00', averagePerDay: '0.33' },
        { season: 'summer', count: 2, total: '300.00', averagePerDay: '3.26' },
        { season: 'autumn', count: 1, total: '10.00', averagePerDay: '3.33' },
      ]);
      expect(result.comparison).toEqual({
        bestSeason: 'summer',
        worstSeason: 'autumn',
        difference: '290.00',
        percent: '2900.00',
      });
    });

    it('sin comparación si la estación con menos importe está a 0 (H3 criterio 4)', () => {
      const now = new Date('2026-09-03T10:00:00.000Z');
      const transactions = [
        { type: 'EXPENSE' as const, date: '2026-01-10', amount: '100.00' },
        { type: 'EXPENSE' as const, date: '2026-04-01', amount: '30.00' },
        // Nada en verano ni en otoño.
      ];

      const result = seasonalSummary(transactions, 'EXPENSE', { kind: 'year', year: 2026 }, now);

      expect(result.seasons.find((s) => s.season === 'summer')?.total).toBe('0.00');
      expect(result.comparison).toBeNull();
    });

    it('sin comparación si las 4 estaciones están empatadas (H3 criterio 4)', () => {
      const now = new Date('2026-09-03T10:00:00.000Z');
      const transactions = [
        { type: 'EXPENSE' as const, date: '2026-01-10', amount: '50.00' },
        { type: 'EXPENSE' as const, date: '2026-04-01', amount: '50.00' },
        { type: 'EXPENSE' as const, date: '2026-07-01', amount: '50.00' },
        { type: 'EXPENSE' as const, date: '2026-09-01', amount: '50.00' },
      ];

      const result = seasonalSummary(transactions, 'EXPENSE', { kind: 'year', year: 2026 }, now);

      expect(result.comparison).toBeNull();
    });

    it('sin ningún movimiento, las 4 estaciones quedan a "0.00" y sin comparación', () => {
      const now = new Date('2026-09-03T10:00:00.000Z');
      const result = seasonalSummary([], 'EXPENSE', { kind: 'year', year: 2026 }, now);

      expect(result.seasons.every((s) => s.total === '0.00' && s.count === 0)).toBe(true);
      expect(result.comparison).toBeNull();
    });
  });

  describe('categoryComparison (spec 015)', () => {
    it('agrupa por categoría, calcula la variación y ordena de mayor a menor importe', () => {
      const current = [
        { categoryId: 'food', type: 'EXPENSE' as const, amount: '30.00' },
        { categoryId: 'food', type: 'EXPENSE' as const, amount: '20.00' },
        { categoryId: 'transport', type: 'EXPENSE' as const, amount: '80.00' },
        { categoryId: 'food', type: 'INCOME' as const, amount: '1000.00' }, // otro tipo, no cuenta
      ];
      const previous = [
        { categoryId: 'food', type: 'EXPENSE' as const, amount: '40.00' },
        { categoryId: 'transport', type: 'EXPENSE' as const, amount: '40.00' },
      ];

      expect(categoryComparison(current, previous, 'EXPENSE')).toEqual([
        { categoryId: 'transport', total: '80.00', previousTotal: '40.00', change: '100.00' },
        { categoryId: 'food', total: '50.00', previousTotal: '40.00', change: '25.00' },
      ]);
    });

    it('categoría nueva (sin movimientos en el periodo anterior): change null, no un % infinito', () => {
      const current = [{ categoryId: 'travel', type: 'EXPENSE' as const, amount: '200.00' }];
      const result = categoryComparison(current, [], 'EXPENSE');

      expect(result).toEqual([{ categoryId: 'travel', total: '200.00', previousTotal: '0.00', change: null }]);
    });

    it('mismo importe en ambos periodos: change "0.00", no null', () => {
      const current = [{ categoryId: 'food', type: 'EXPENSE' as const, amount: '50.00' }];
      const previous = [{ categoryId: 'food', type: 'EXPENSE' as const, amount: '50.00' }];

      expect(categoryComparison(current, previous, 'EXPENSE')).toEqual([
        { categoryId: 'food', total: '50.00', previousTotal: '50.00', change: '0.00' },
      ]);
    });

    it('una categoría con movimientos solo en el periodo anterior no aparece en el resultado', () => {
      const previous = [{ categoryId: 'gone', type: 'EXPENSE' as const, amount: '30.00' }];

      expect(categoryComparison([], previous, 'EXPENSE')).toEqual([]);
    });

    it('lista vacía si no hay movimientos del tipo pedido en el periodo actual', () => {
      const current = [{ categoryId: 'food', type: 'INCOME' as const, amount: '50.00' }];

      expect(categoryComparison(current, [], 'EXPENSE')).toEqual([]);
    });
  });
});
