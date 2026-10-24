/**
 * Spec 051 plan.md §2: fechas de garantía de los tickets. Las fechas van
 * siempre como texto `AAAA-MM-DD` (columnas `date`), y se comparan en UTC
 * para no depender de la zona horaria del servidor.
 */

/** Spec 051 H5: se avisa y se marca como "caduca pronto" con 30 días o menos. */
export const WARRANTY_NOTICE_DAYS = 30;

export type WarrantyStatus = 'none' | 'active' | 'expiring' | 'expired';

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** La fecha más N años; el 29 de febrero pasa al 28 si el año de destino no es bisiesto. */
export function warrantyShortcut(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** El último día de garantía todavía está vigente. */
export function warrantyStatus(warrantyUntil: string | null, today: string): WarrantyStatus {
  if (!warrantyUntil) return 'none';
  const left = daysBetween(today, warrantyUntil);
  if (left < 0) return 'expired';
  return left <= WARRANTY_NOTICE_DAYS ? 'expiring' : 'active';
}

interface WarrantyRow {
  receiptId: string;
  warrantyUntil: string;
}

/**
 * Las garantías que hay que avisar hoy: caducan en 30 días o menos, aún no
 * han caducado y no se han avisado ya para esa misma fecha (si la fecha del
 * ticket cambia, la nueva se vuelve a avisar).
 */
export function warrantyRemindersDue<T extends WarrantyRow>(rows: T[], sent: WarrantyRow[], today: string): T[] {
  const sentKeys = new Set(sent.map((s) => `${s.receiptId}|${s.warrantyUntil}`));
  return rows.filter((row) => warrantyStatus(row.warrantyUntil, today) === 'expiring' && !sentKeys.has(`${row.receiptId}|${row.warrantyUntil}`));
}
