// Spec 047 (movimientos recurrentes), plan.md §2. Función pura, sin `Date`
// local: solo `Date.UTC` para el cálculo de calendario (mismo criterio que
// `lastDayOfMonth` en el frontend), para no depender de la zona horaria.

export type RecurringFrequency = 'MONTHLY' | 'YEARLY';

export interface RecurrenceRule {
  frequency: RecurringFrequency;
  /** 'YYYY-MM-DD' — de aquí sale el día (y el mes, si es anual) de repetición. */
  startDate: string;
  /** 'YYYY-MM-DD', inclusive. */
  endDate: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Fechas en las que la regla cae dentro de `[from, to]` (ambos inclusive, ya
 * recortado por `startDate`/`endDate`), en orden. Si el día de `startDate` no
 * existe en un mes (31 en abril, 29-feb en año no bisiesto) se usa el último
 * día de ese mes.
 */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const lower = from > rule.startDate ? from : rule.startDate;
  const upper = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  if (lower > upper) return [];

  const [startYear, startMonth, startDay] = rule.startDate.split('-').map(Number);
  const [lowerYear, lowerMonth] = lower.split('-').map(Number);
  const [upperYear, upperMonth] = upper.split('-').map(Number);

  const result: string[] = [];
  const push = (year: number, month: number) => {
    const date = `${year}-${pad(month)}-${pad(Math.min(startDay, lastDayOfMonth(year, month)))}`;
    if (date >= lower && date <= upper) result.push(date);
  };

  if (rule.frequency === 'MONTHLY') {
    for (let index = lowerYear * 12 + lowerMonth - 1; index <= upperYear * 12 + upperMonth - 1; index++) {
      push(Math.floor(index / 12), (index % 12) + 1);
    }
  } else {
    for (let year = Math.max(lowerYear, startYear); year <= upperYear; year++) push(year, startMonth);
  }
  return result;
}
