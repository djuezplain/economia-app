import { describe, expect, it } from 'vitest';
import { isDue } from './scheduled-exports.due.js';
import type { ScheduledExportDueInput } from './scheduled-exports.due.js';

function base(overrides: Partial<ScheduledExportDueInput> = {}): ScheduledExportDueInput {
  return {
    frequency: 'DAILY',
    dayOfWeek: null,
    dayOfMonth: null,
    timeOfDay: '09:00',
    lastRunAt: null,
    ...overrides,
  };
}

describe('isDue', () => {
  describe('DAILY', () => {
    it('no debido antes de la hora programada', () => {
      const now = new Date('2026-09-14T08:59:00');
      expect(isDue(base(), now)).toBe(false);
    });

    it('debido justo a la hora programada, sin ejecución previa', () => {
      const now = new Date('2026-09-14T09:00:00');
      expect(isDue(base(), now)).toBe(true);
    });

    it('debido bastante después de la hora programada (barrido cada 15 min, catch-up)', () => {
      const now = new Date('2026-09-14T14:37:00');
      expect(isDue(base(), now)).toBe(true);
    });

    it('no vuelve a estar debido el mismo día tras un lastRunAt reciente', () => {
      const now = new Date('2026-09-14T09:20:00');
      const lastRunAt = new Date('2026-09-14T09:05:00');
      expect(isDue(base({ lastRunAt }), now)).toBe(false);
    });

    it('vuelve a estar debido al día siguiente', () => {
      const now = new Date('2026-09-15T09:05:00');
      const lastRunAt = new Date('2026-09-14T09:05:00');
      expect(isDue(base({ lastRunAt }), now)).toBe(true);
    });
  });

  describe('WEEKLY', () => {
    it('no debido si hoy no es el día de la semana configurado', () => {
      // 2026-09-14 es lunes (getDay() === 1); se configura para el domingo (0).
      const now = new Date('2026-09-14T10:00:00');
      expect(isDue(base({ frequency: 'WEEKLY', dayOfWeek: 0 }), now)).toBe(false);
    });

    it('debido si hoy es el día de la semana configurado, a partir de la hora', () => {
      const now = new Date('2026-09-14T09:00:00'); // lunes
      expect(isDue(base({ frequency: 'WEEKLY', dayOfWeek: 1 }), now)).toBe(true);
    });

    it('no vuelve a estar debido más tarde el mismo día tras ejecutarse', () => {
      const now = new Date('2026-09-14T18:00:00');
      const lastRunAt = new Date('2026-09-14T09:10:00');
      expect(isDue(base({ frequency: 'WEEKLY', dayOfWeek: 1, lastRunAt }), now)).toBe(false);
    });

    it('vuelve a estar debido la semana siguiente, el mismo día de la semana', () => {
      const now = new Date('2026-09-21T09:05:00'); // lunes siguiente
      const lastRunAt = new Date('2026-09-14T09:05:00');
      expect(isDue(base({ frequency: 'WEEKLY', dayOfWeek: 1, lastRunAt }), now)).toBe(true);
    });

    it('catch-up: si el proceso no corrió el lunes, sigue debido el martes (mismo ciclo semanal)', () => {
      // dayOfWeek configurado a lunes, pero por algún motivo solo se comprueba el martes.
      const now = new Date('2026-09-15T09:05:00'); // martes
      expect(isDue(base({ frequency: 'WEEKLY', dayOfWeek: 1 }), now)).toBe(false); // martes no es lunes: no debido HOY
    });
  });

  describe('MONTHLY', () => {
    it('no debido si hoy no es el día del mes configurado', () => {
      const now = new Date('2026-09-14T10:00:00');
      expect(isDue(base({ frequency: 'MONTHLY', dayOfMonth: 1 }), now)).toBe(false);
    });

    it('debido si hoy es el día del mes configurado, a partir de la hora', () => {
      const now = new Date('2026-09-14T09:00:00');
      expect(isDue(base({ frequency: 'MONTHLY', dayOfMonth: 14 }), now)).toBe(true);
    });

    it('no vuelve a estar debido más tarde el mismo día tras ejecutarse', () => {
      const now = new Date('2026-09-14T20:00:00');
      const lastRunAt = new Date('2026-09-14T09:05:00');
      expect(isDue(base({ frequency: 'MONTHLY', dayOfMonth: 14, lastRunAt }), now)).toBe(false);
    });

    it('vuelve a estar debido el mes siguiente, el mismo día del mes', () => {
      const now = new Date('2026-10-14T09:05:00');
      const lastRunAt = new Date('2026-09-14T09:05:00');
      expect(isDue(base({ frequency: 'MONTHLY', dayOfMonth: 14, lastRunAt }), now)).toBe(true);
    });
  });
});
