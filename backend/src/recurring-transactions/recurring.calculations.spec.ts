import { occurrencesBetween } from './recurring.calculations.js';
import type { RecurrenceRule } from './recurring.calculations.js';

const monthly = (startDate: string, endDate: string | null = null): RecurrenceRule => ({
  frequency: 'MONTHLY',
  startDate,
  endDate,
});
const yearly = (startDate: string, endDate: string | null = null): RecurrenceRule => ({
  frequency: 'YEARLY',
  startDate,
  endDate,
});

describe('occurrencesBetween — mensual', () => {
  it('repite el mismo día cada mes dentro del rango', () => {
    expect(occurrencesBetween(monthly('2026-01-15'), '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('usa el último día del mes cuando el día no existe (31 → 30/28/29)', () => {
    expect(occurrencesBetween(monthly('2026-01-31'), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrencesBetween(monthly('2028-01-31'), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('no genera nada antes de startDate', () => {
    expect(occurrencesBetween(monthly('2026-06-10'), '2026-01-01', '2026-05-31')).toEqual([]);
    expect(occurrencesBetween(monthly('2026-06-10'), '2026-01-01', '2026-06-30')).toEqual(['2026-06-10']);
  });

  it('respeta endDate (inclusive)', () => {
    expect(occurrencesBetween(monthly('2026-01-15', '2026-03-15'), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
    expect(occurrencesBetween(monthly('2026-01-15', '2026-03-14'), '2026-01-01', '2026-12-31')).toHaveLength(2);
  });

  it('cruza el cambio de año', () => {
    expect(occurrencesBetween(monthly('2026-01-05'), '2026-12-01', '2027-02-28')).toEqual([
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
    ]);
  });

  it('los extremos del rango son inclusivos y un rango invertido da vacío', () => {
    expect(occurrencesBetween(monthly('2026-01-15'), '2026-03-15', '2026-03-15')).toEqual(['2026-03-15']);
    expect(occurrencesBetween(monthly('2026-01-15'), '2026-03-16', '2026-03-14')).toEqual([]);
  });
});

describe('occurrencesBetween — anual', () => {
  it('repite el mismo día y mes cada año', () => {
    expect(occurrencesBetween(yearly('2024-03-10'), '2025-01-01', '2027-12-31')).toEqual([
      '2025-03-10',
      '2026-03-10',
      '2027-03-10',
    ]);
  });

  it('29-feb cae en 28-feb en años no bisiestos y en 29-feb en bisiestos', () => {
    expect(occurrencesBetween(yearly('2024-02-29'), '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('no genera antes de startDate ni después de endDate', () => {
    expect(occurrencesBetween(yearly('2026-05-01'), '2020-01-01', '2025-12-31')).toEqual([]);
    expect(occurrencesBetween(yearly('2026-05-01', '2027-04-30'), '2026-01-01', '2030-12-31')).toEqual(['2026-05-01']);
  });
});
