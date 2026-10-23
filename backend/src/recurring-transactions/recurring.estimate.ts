import { Decimal } from 'decimal.js';

// Spec 049 (recibos recurrentes), plan.md §2. Función pura: dinero con
// `decimal.js`, nunca con `number` (constitution §2).

/** Nº de ocurrencias resueltas que entran en la media (spec 049, decisión 3). */
export const ESTIMATE_SAMPLE_SIZE = 3;

/**
 * Importe estimado de una plantilla de importe variable (spec 049 H2).
 *
 * @param initialAmount Importe que el usuario puso en la plantilla; solo se
 *   usa mientras no hay ninguna ocurrencia resuelta.
 * @param resolvedAmounts Importes reales de las ocurrencias resueltas
 *   (confirmadas o conciliadas), de la más reciente a la más antigua.
 * @returns Media de las `ESTIMATE_SAMPLE_SIZE` más recientes (o de las que
 *   haya), con 2 decimales y redondeo `ROUND_HALF_UP`.
 */
export function estimateAmount(initialAmount: string, resolvedAmounts: string[]): string {
  const sample = resolvedAmounts.slice(0, ESTIMATE_SAMPLE_SIZE);
  if (sample.length === 0) return new Decimal(initialAmount).toFixed(2, Decimal.ROUND_HALF_UP);

  const total = sample.reduce((sum, amount) => sum.plus(amount), new Decimal(0));
  return total.dividedBy(sample.length).toFixed(2, Decimal.ROUND_HALF_UP);
}
