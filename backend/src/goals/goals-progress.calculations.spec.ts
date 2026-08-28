import { describe, expect, it } from 'vitest';
import {
  computeDeviation,
  computeProgressPercent,
  projectAmount,
  resolveProgressStatus,
  resolveTargetAmount,
} from './goals-progress.calculations.js';

describe('goals-progress.calculations', () => {
  describe('resolveTargetAmount', () => {
    it('AMOUNT: devuelve targetValue tal cual, ignorando el ingreso', () => {
      expect(resolveTargetAmount('AMOUNT', '500.00', '2000.00')).toBe('500.00');
      expect(resolveTargetAmount('AMOUNT', '500.00', '0.00')).toBe('500.00');
    });

    it('PERCENT: importe = ingreso × % ÷ 100', () => {
      expect(resolveTargetAmount('PERCENT', '25.00', '2000.00')).toBe('500.00');
      expect(resolveTargetAmount('PERCENT', '30.00', '1000.00')).toBe('300.00');
    });

    it('PERCENT con ingreso 0: null, sin dividir por cero', () => {
      expect(resolveTargetAmount('PERCENT', '25.00', '0.00')).toBeNull();
    });
  });

  describe('computeDeviation', () => {
    it('actualAmount − targetAmount, positivo si el real supera al objetivo', () => {
      expect(computeDeviation('600.00', '500.00')).toBe('100.00');
    });

    it('negativo si el real queda por debajo del objetivo', () => {
      expect(computeDeviation('400.00', '500.00')).toBe('-100.00');
    });

    it('null si targetAmount es null (objetivo % sin ingresos)', () => {
      expect(computeDeviation('400.00', null)).toBeNull();
    });
  });

  describe('computeProgressPercent', () => {
    it('actualAmount ÷ targetAmount × 100', () => {
      expect(computeProgressPercent('400.00', '500.00')).toBe('80.00');
      expect(computeProgressPercent('600.00', '500.00')).toBe('120.00');
    });

    it('null si targetAmount es null', () => {
      expect(computeProgressPercent('400.00', null)).toBeNull();
    });

    it('null si targetAmount es 0, sin dividir por cero', () => {
      expect(computeProgressPercent('400.00', '0.00')).toBeNull();
    });
  });

  describe('resolveProgressStatus', () => {
    it('por debajo del umbral', () => {
      expect(resolveProgressStatus('79.00', '80')).toBe('BELOW_THRESHOLD');
    });

    it('en el umbral o por encima, sin llegar al 100%: cerca', () => {
      expect(resolveProgressStatus('80.00', '80')).toBe('NEAR_THRESHOLD');
      expect(resolveProgressStatus('99.99', '80')).toBe('NEAR_THRESHOLD');
    });

    it('100% o más: alcanzado/superado', () => {
      expect(resolveProgressStatus('100.00', '80')).toBe('AT_OR_ABOVE_TARGET');
      expect(resolveProgressStatus('150.00', '80')).toBe('AT_OR_ABOVE_TARGET');
    });

    it('progressPercent null (sin importe objetivo calculable): por debajo del umbral, nada que avisar', () => {
      expect(resolveProgressStatus(null, '80')).toBe('BELOW_THRESHOLD');
    });
  });

  describe('projectAmount', () => {
    it('extrapola el ritmo actual a los días totales del periodo', () => {
      // 300€ en 10 días transcurridos de un mes de 30 días → 900€ proyectados.
      expect(projectAmount('300.00', 10, 30)).toBe('900.00');
    });

    it('null si no han transcurrido días (evita dividir por cero)', () => {
      expect(projectAmount('0.00', 0, 30)).toBeNull();
    });
  });
});
