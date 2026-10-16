import { describe, expect, it } from 'vitest';
import { buildMonthGrid, groupByDate, longDayLabel, monthLabel, monthRange, monthTotals, shiftMonth } from './calendar-shared';

describe('buildMonthGrid', () => {
  it('febrero 2028 (bisiesto) empieza en martes y ocupa 5 semanas', () => {
    const grid = buildMonthGrid('2028-02');
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toEqual({ date: '2028-01-31', day: 31, inMonth: false });
    expect(grid[0][1]).toEqual({ date: '2028-02-01', day: 1, inMonth: true });
    const days = grid.flat().filter((c) => c.inMonth);
    expect(days).toHaveLength(29);
  });

  it('un mes que empieza en domingo (mayo 2022) necesita 6 semanas', () => {
    const grid = buildMonthGrid('2022-05');
    expect(grid).toHaveLength(6);
    expect(grid[0][6]).toEqual({ date: '2022-05-01', day: 1, inMonth: true });
    expect(grid[0].slice(0, 6).every((c) => !c.inMonth)).toBe(true);
  });

  it('febrero 2027 (lunes, 28 días) ocupa exactamente 4 semanas sin días de relleno', () => {
    const grid = buildMonthGrid('2027-02');
    expect(grid).toHaveLength(4);
    expect(grid.flat().every((c) => c.inMonth)).toBe(true);
  });

  it('diciembre rellena con días de enero del año siguiente', () => {
    const last = buildMonthGrid('2026-12').at(-1)!.at(-1)!;
    expect(last.date.startsWith('2027-01')).toBe(true);
    expect(last.inMonth).toBe(false);
  });
});

describe('shiftMonth / monthRange / labels', () => {
  it('cambia de año hacia delante y hacia atrás', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });
  it('rango del mes con último día correcto', () => {
    expect(monthRange('2028-02')).toEqual({ dateFrom: '2028-02-01', dateTo: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ dateFrom: '2026-12-01', dateTo: '2026-12-31' });
  });
  it('etiquetas en español', () => {
    expect(monthLabel('2026-08')).toBe('agosto 2026');
    expect(longDayLabel('2026-08-26')).toBe('miércoles, 26 de agosto');
  });
});

describe('groupByDate / monthTotals', () => {
  it('agrupa por fecha', () => {
    const map = groupByDate([{ date: '2026-08-01' }, { date: '2026-08-02' }, { date: '2026-08-01' }]);
    expect(map.get('2026-08-01')).toHaveLength(2);
    expect(map.get('2026-08-02')).toHaveLength(1);
  });
  it('suma ingresos y gastos sin errores de coma flotante', () => {
    expect(
      monthTotals([
        { type: 'INCOME', amount: '1000.10' },
        { type: 'EXPENSE', amount: '0.10' },
        { type: 'EXPENSE', amount: '0.20' },
      ]),
    ).toEqual({ income: '1000.10', expense: '0.30', balance: '999.80' });
  });
  it('sin movimientos todo es 0', () => {
    expect(monthTotals([])).toEqual({ income: '0.00', expense: '0.00', balance: '0.00' });
  });
});
