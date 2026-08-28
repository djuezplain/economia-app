import { Decimal } from 'decimal.js';

export type TargetType = 'AMOUNT' | 'PERCENT';
export type ProgressStatus = 'BELOW_THRESHOLD' | 'NEAR_THRESHOLD' | 'AT_OR_ABOVE_TARGET';

/**
 * Spec 004, plan.md §4. Funciones puras de progreso — sin acceso a base de
 * datos, sin saber si están calculando un objetivo de ahorro o un
 * presupuesto de gasto (constitution §2). Reutilizan `dashboard/
 * dashboard.calculations.ts` para todo lo que ya existe (`resolveDaysFor*`,
 * `daysIn*`, `currentMonthIso`) en vez de duplicarlo.
 */

/**
 * Importe objetivo resuelto: si `targetType` es `AMOUNT`, `targetValue` tal
 * cual; si es `PERCENT`, `income × targetValue ÷ 100`. `null` si
 * `incomeForPeriod` es 0 — mismo criterio que `savingsPercent` (spec 002):
 * sin ingresos, un objetivo en % no tiene un importe calculable, no es un
 * 0€ engañoso ni una división por cero.
 */
export function resolveTargetAmount(targetType: TargetType, targetValue: string, incomeForPeriod: string): string | null {
  if (targetType === 'AMOUNT') return targetValue;
  const income = new Decimal(incomeForPeriod);
  if (income.isZero()) return null;
  return income.times(targetValue).dividedBy(100).toFixed(2);
}

/**
 * `actualAmount − targetAmount`. Positivo = el importe real supera al
 * objetivo — para un presupuesto de gasto eso es malo (excedido), para un
 * objetivo de ahorro es bueno (superado); esta función no lo sabe, calcula
 * el mismo número en ambos casos (plan.md §4) y deja la interpretación a
 * quien presenta el dato.
 */
export function computeDeviation(actualAmount: string, targetAmount: string | null): string | null {
  if (targetAmount === null) return null;
  return new Decimal(actualAmount).minus(targetAmount).toFixed(2);
}

/** `actualAmount ÷ targetAmount × 100`. `null` si `targetAmount` es `null` o 0 (sin dividir por cero). */
export function computeProgressPercent(actualAmount: string, targetAmount: string | null): string | null {
  if (targetAmount === null) return null;
  const target = new Decimal(targetAmount);
  if (target.isZero()) return null;
  return new Decimal(actualAmount).dividedBy(target).times(100).toFixed(2);
}

/**
 * Estado de aviso (H4), deliberadamente neutral: no decide si "cerca"/
 * "alcanzado" es una buena o mala noticia — el frontend traduce cada
 * estado a la etiqueta correcta según el tipo (spec.md §2, H4 criterio 2:
 * "cerca del límite"/"superado" para un presupuesto de gasto; "cerca de
 * conseguirlo"/"cumplido" para un objetivo de ahorro). `progressPercent:
 * null` (sin importe objetivo calculable) se trata como `BELOW_THRESHOLD`:
 * sin un objetivo con el que comparar, no hay nada que avisar.
 */
export function resolveProgressStatus(progressPercent: string | null, alertThresholdPercent: string): ProgressStatus {
  if (progressPercent === null) return 'BELOW_THRESHOLD';
  const percent = new Decimal(progressPercent);
  if (percent.greaterThanOrEqualTo(100)) return 'AT_OR_ABOVE_TARGET';
  if (percent.greaterThanOrEqualTo(alertThresholdPercent)) return 'NEAR_THRESHOLD';
  return 'BELOW_THRESHOLD';
}

/**
 * Proyección de cierre de periodo por extrapolación del ritmo actual
 * (spec.md §4, H3 criterio 2) — mismo criterio que ya usa `average()`
 * (spec 002) para las medias diarias del mes en curso. Solo tiene sentido
 * llamarla para el periodo en curso (`daysElapsed` = días transcurridos,
 * no los totales); un periodo ya cerrado no proyecta, muestra el resultado
 * real (H3 criterio 3, decisión de quien llama, no de esta función).
 * `null` si `daysElapsed` ≤ 0 (no debería ocurrir con datos reales, pero
 * evita una división por cero en vez de asumir que nunca pasará).
 */
export function projectAmount(actualAmount: string, daysElapsed: number, daysInPeriod: number): string | null {
  if (daysElapsed <= 0) return null;
  return new Decimal(actualAmount).dividedBy(daysElapsed).times(daysInPeriod).toFixed(2);
}
