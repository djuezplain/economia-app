import { Decimal } from 'decimal.js';

/**
 * H3 criterio 2 (spec 018) / H2 criterio 3 (spec 020): Valor de compra =
 * Precio de compra × Número de acciones. Se calcula, no se guarda — nunca
 * puede quedar desincronizado de los dos campos reales (plan.md §1).
 */
export function purchaseValue(purchasePrice: string, shareCount: string): string {
  return new Decimal(purchasePrice).times(shareCount).toFixed(2);
}

/** H2 criterio 4 (spec 020): nº total de acciones de una posición, sumando todas sus compras. */
export function totalShares(purchases: Array<{ shareCount: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(p.shareCount), new Decimal(0)).toFixed(4);
}

/** H2 criterio 4 (spec 020): coste total de una posición, sumando el valor de compra de todas sus compras. */
export function totalCost(purchases: Array<{ shareCount: string; purchasePrice: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(purchaseValue(p.purchasePrice, p.shareCount)), new Decimal(0)).toFixed(2);
}

/**
 * H3 criterio 1 (spec 020, revisión §3.ter de spec.md): Valor actual de la
 * posición = Precio por acción actual (última valoración) × nº total de
 * acciones (`totalShares`, sobre el historial de compras). Se calcula, no
 * se guarda — mismo criterio que `purchaseValue`.
 */
export function currentValue(pricePerShare: string, shareCount: string): string {
  return new Decimal(pricePerShare).times(shareCount).toFixed(2);
}
