import { describe, expect, it } from 'vitest';
import { localToday, warrantyLabel, warrantyShortcut, warrantyStatus } from './receipt-warranty';

describe('receipt-warranty (spec 051 H5)', () => {
  it('atajos de años, con el 29 de febrero', () => {
    expect(warrantyShortcut('2026-10-24', 2)).toBe('2028-10-24');
    expect(warrantyShortcut('2028-02-29', 3)).toBe('2031-02-28');
  });

  it('estado: vigente, caduca en 30 días o menos (incluido hoy) y caducada', () => {
    const today = '2026-10-24';
    expect(warrantyStatus(null, today)).toBe('none');
    expect(warrantyStatus('2026-11-24', today)).toBe('active');
    expect(warrantyStatus('2026-11-23', today)).toBe('expiring');
    expect(warrantyStatus('2026-10-24', today)).toBe('expiring');
    expect(warrantyStatus('2026-10-23', today)).toBe('expired');
  });

  it('texto para leer', () => {
    const today = '2026-10-24';
    expect(warrantyLabel('2028-10-24', today)).toBe('Garantía hasta el 24/10/2028');
    expect(warrantyLabel('2026-10-27', today)).toBe('La garantía caduca en 3 días (27/10/2026)');
    expect(warrantyLabel('2026-10-25', today)).toBe('La garantía caduca en 1 día (25/10/2026)');
    expect(warrantyLabel('2026-10-24', today)).toBe('La garantía caduca hoy (24/10/2026)');
    expect(warrantyLabel('2026-10-01', today)).toBe('Garantía caducada el 01/10/2026');
  });

  it('hoy en la zona local', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
