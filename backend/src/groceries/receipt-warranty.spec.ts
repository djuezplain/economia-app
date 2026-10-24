import { describe, expect, it } from 'vitest';
import { WARRANTY_NOTICE_DAYS, warrantyRemindersDue, warrantyShortcut, warrantyStatus } from './receipt-warranty.js';

describe('warrantyShortcut (spec 051 H5 criterio 1)', () => {
  it('suma años a la fecha del ticket', () => {
    expect(warrantyShortcut('2026-10-24', 2)).toBe('2028-10-24');
    expect(warrantyShortcut('2026-10-24', 3)).toBe('2029-10-24');
  });

  it('el 29 de febrero pasa al 28 si el año de destino no es bisiesto', () => {
    expect(warrantyShortcut('2028-02-29', 2)).toBe('2030-02-28');
    expect(warrantyShortcut('2028-02-29', 4)).toBe('2032-02-29');
  });
});

describe('warrantyStatus (spec 051 H5 criterio 2)', () => {
  const today = '2026-10-24';
  it('none sin fecha', () => expect(warrantyStatus(null, today)).toBe('none'));
  it('expired si ya pasó (el último día aún está vigente)', () => {
    expect(warrantyStatus('2026-10-23', today)).toBe('expired');
    expect(warrantyStatus('2026-10-24', today)).toBe('expiring');
  });
  it(`expiring dentro de ${WARRANTY_NOTICE_DAYS} días, active después`, () => {
    expect(warrantyStatus('2026-11-23', today)).toBe('expiring');
    expect(warrantyStatus('2026-11-24', today)).toBe('active');
  });
});

describe('warrantyRemindersDue (spec 051 H5 criterio 3)', () => {
  const today = '2026-10-24';
  const r = (receiptId: string, warrantyUntil: string) => ({ receiptId, warrantyUntil });

  it('avisa las que caducan en 30 días o menos, sin haber caducado', () => {
    const rows = [r('a', '2026-11-23'), r('b', '2026-11-24'), r('c', '2026-10-24'), r('d', '2026-10-23')];
    expect(warrantyRemindersDue(rows, [], today).map((x) => x.receiptId)).toEqual(['a', 'c']);
  });

  it('no repite un aviso ya enviado para esa fecha, pero sí si la fecha ha cambiado', () => {
    const rows = [r('a', '2026-11-20'), r('b', '2026-11-10')];
    const sent = [r('a', '2026-11-20'), r('b', '2026-11-01')];
    expect(warrantyRemindersDue(rows, sent, today).map((x) => x.receiptId)).toEqual(['b']);
  });
});
