// Spec 049 (recibos recurrentes), H1 / plan.md §2. Función pura: qué
// ocurrencias pendientes hay que avisar hoy.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ocurrencia pendiente de una plantilla con el aviso por email activado. */
export interface PendingOccurrence {
  recurringId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 0..7 */
  reminderDaysBefore: number;
}

export function reminderKey(recurringId: string, occurrenceDate: string): string {
  return `${recurringId}|${occurrenceDate}`;
}

function minusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Ocurrencias que hay que avisar `today`: aquellas con
 * `fecha − reminderDaysBefore ≤ today ≤ fecha` que no estén ya en
 * `alreadySent` (claves de `reminderKey`). Una ocurrencia cuya fecha ya
 * pasó nunca se avisa: un email atrasado no sirve para tener saldo a
 * tiempo, y esa ocurrencia ya aparece como vencida en Inicio.
 */
export function remindersDue<T extends PendingOccurrence>(occurrences: T[], today: string, alreadySent: Set<string>): T[] {
  return occurrences.filter(
    (o) =>
      !alreadySent.has(reminderKey(o.recurringId, o.date)) &&
      minusDays(o.date, o.reminderDaysBefore) <= today &&
      today <= o.date,
  );
}
