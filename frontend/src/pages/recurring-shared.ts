import type { RecurringFrequency } from '../api/recurring-transactions';

// Spec 047 (movimientos recurrentes). Textos compartidos por `RecurringPage`
// y `CalendarPage`. Manipulación de texto pura, sin `Date` (mismo criterio
// que `formatDate` en `home-shared.ts`).

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
};

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** ('MONTHLY', '2026-01-05') → 'Cada mes, el día 5'; ('YEARLY', '2026-03-10') → 'Cada año, el 10 de marzo'. */
export function describeRecurrence(frequency: RecurringFrequency, startDate: string): string {
  const [, month, day] = startDate.split('-').map(Number);
  return frequency === 'MONTHLY' ? `Cada mes, el día ${day}` : `Cada año, el ${day} de ${MONTH_NAMES[month - 1]}`;
}
