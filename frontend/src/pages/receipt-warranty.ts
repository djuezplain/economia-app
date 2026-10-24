/**
 * Spec 051 H5: mismo cálculo que el backend (`groceries/receipt-warranty.ts`)
 * para los atajos de fecha y el estado de la garantía en pantalla. Fechas
 * como texto `AAAA-MM-DD`, comparadas en UTC.
 */

export const WARRANTY_NOTICE_DAYS = 30;

export type WarrantyStatus = 'none' | 'active' | 'expiring' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** La fecha más N años; el 29 de febrero pasa al 28 si el año de destino no es bisiesto. */
export function warrantyShortcut(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export function warrantyStatus(warrantyUntil: string | null, today: string): WarrantyStatus {
  if (!warrantyUntil) return 'none';
  const left = daysUntil(today, warrantyUntil);
  if (left < 0) return 'expired';
  return left <= WARRANTY_NOTICE_DAYS ? 'expiring' : 'active';
}

/** Hoy en la zona del navegador, como `AAAA-MM-DD`. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** "Garantía hasta el 15/11/2026", "Caduca en 3 días", "Caduca hoy", "Caducó el …". */
export function warrantyLabel(warrantyUntil: string, today: string): string {
  const [y, m, d] = warrantyUntil.split('-');
  const shown = `${d}/${m}/${y}`;
  const status = warrantyStatus(warrantyUntil, today);
  if (status === 'expired') return `Garantía caducada el ${shown}`;
  if (status === 'expiring') {
    const left = daysUntil(today, warrantyUntil);
    if (left === 0) return `La garantía caduca hoy (${shown})`;
    return `La garantía caduca en ${left === 1 ? '1 día' : `${left} días`} (${shown})`;
  }
  return `Garantía hasta el ${shown}`;
}
