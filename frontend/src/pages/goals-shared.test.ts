import { describe, expect, it } from 'vitest';
import { BUDGET_RAMP, resolveVisualLevel, SAVINGS_RAMP } from './goals-shared';
import type { VisualLevel } from './goals-shared';

describe('resolveVisualLevel', () => {
  it('progressPercent null → "ok" (sin datos, mismo criterio que resolveProgressStatus del backend)', () => {
    expect(resolveVisualLevel(null, '80')).toBe('ok');
  });

  it('justo por debajo del 90% del umbral de aviso → "ok"', () => {
    // umbral 80 → 90% de 80 = 72
    expect(resolveVisualLevel('71.99', '80')).toBe('ok');
  });

  it('justo en el 90% del umbral de aviso → "near"', () => {
    expect(resolveVisualLevel('72.00', '80')).toBe('near');
  });

  it('justo por debajo del umbral de aviso (pero por encima del 90%) → "near"', () => {
    expect(resolveVisualLevel('79.99', '80')).toBe('near');
  });

  it('justo en el umbral de aviso → "warning"', () => {
    expect(resolveVisualLevel('80.00', '80')).toBe('warning');
  });

  it('por encima del umbral de aviso pero por debajo de 100 → "warning"', () => {
    expect(resolveVisualLevel('99.99', '80')).toBe('warning');
  });

  it('exactamente 100 → "over"', () => {
    expect(resolveVisualLevel('100.00', '80')).toBe('over');
  });

  it('por encima de 100 → "over"', () => {
    expect(resolveVisualLevel('150.00', '80')).toBe('over');
  });
});

describe('BUDGET_RAMP / SAVINGS_RAMP', () => {
  const levels: VisualLevel[] = ['ok', 'near', 'warning', 'over'];

  it('cada rampa define los 4 niveles', () => {
    for (const level of levels) {
      expect(BUDGET_RAMP[level]).toBeDefined();
      expect(SAVINGS_RAMP[level]).toBeDefined();
    }
  });

  it('son literalmente inversas entre sí, nivel a nivel (plan.md §1)', () => {
    expect(BUDGET_RAMP.ok).toBe(SAVINGS_RAMP.over);
    expect(BUDGET_RAMP.near).toBe(SAVINGS_RAMP.warning);
    expect(BUDGET_RAMP.warning).toBe(SAVINGS_RAMP.near);
    expect(BUDGET_RAMP.over).toBe(SAVINGS_RAMP.ok);
  });

  it('un presupuesto superado (over) es rojo; un objetivo de ahorro superado (over) es verde', () => {
    expect(BUDGET_RAMP.over).toBe('red');
    expect(SAVINGS_RAMP.over).toBe('green');
  });
});
