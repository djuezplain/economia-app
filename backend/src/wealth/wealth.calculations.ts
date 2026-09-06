import { Decimal } from 'decimal.js';

/**
 * H3 criterio 2 (spec 018) / H2 criterio 3 (spec 020): Valor de compra =
 * Precio de compra × Número de acciones. Se calcula, no se guarda — nunca
 * puede quedar desincronizado de los dos campos reales (plan.md §1).
 */
export function purchaseValue(purchasePrice: string, shareCount: string): string {
  return new Decimal(purchasePrice).times(shareCount).toFixed(2);
}

/** H2 criterio 4 (spec 020): nº total de acciones de una posición, sumando todas sus compras.
 *  8 decimales, no 4 — mismo criterio de precisión que `shareCount` (revisión, `IsShareCount`). */
export function totalShares(purchases: Array<{ shareCount: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(p.shareCount), new Decimal(0)).toFixed(8);
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

/** H2 criterio 4 (spec 022): cantidad total de una posición de cripto, sumando todas sus compras.
 *  Mismo patrón que `totalShares`, sobre `cryptoPurchases.quantity` en vez de `stockPurchases.shareCount`. */
export function totalCryptoQuantity(purchases: Array<{ quantity: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(p.quantity), new Decimal(0)).toFixed(8);
}

/** H2 criterio 4 (spec 022): coste total de una posición de cripto, sumando el valor de compra
 *  (`purchaseValue`, reutilizada tal cual: es una multiplicación genérica precio × cantidad) de todas sus compras. */
export function totalCryptoCost(purchases: Array<{ quantity: string; purchasePrice: string }>): string {
  return purchases.reduce((sum, p) => sum.plus(purchaseValue(p.purchasePrice, p.quantity)), new Decimal(0)).toFixed(2);
}

/** H2 criterio 4 (spec 024): total aportado a un plan de pensiones, sumando todas sus aportaciones.
 *  A diferencia de `totalCost`/`totalCryptoCost`, es una suma directa de importes — no hay cantidad
 *  ni precio por separado que multiplicar (decisión explícita con Diego, spec.md §3). */
export function totalContributions(contributions: Array<{ amount: string }>): string {
  return contributions.reduce((sum, c) => sum.plus(c.amount), new Decimal(0)).toFixed(2);
}

/** H1 criterio 3 (spec 029): Bruto = Neto ÷ (1 − %Retención ÷ 100). Se calcula, no se guarda —
 *  mismo criterio que `purchaseValue`/`currentValue`. Genérica para dividendos de acciones y fondos. */
export function grossDividend(netAmount: string, retentionPercent: string): string {
  return new Decimal(netAmount).dividedBy(new Decimal(1).minus(new Decimal(retentionPercent).dividedBy(100))).toFixed(2);
}

/** H2/H3 (spec 029): total neto cobrado en dividendos — de una sola posición (H2) o de toda
 *  la cartera (H3, sumando `stockDividends` + `fundDividends`) según qué lista se le pase.
 *  Misma forma que `totalContributions`, sobre `netAmount` en vez de `amount`. */
export function totalDividends(dividends: Array<{ netAmount: string }>): string {
  return dividends.reduce((sum, d) => sum.plus(d.netAmount), new Decimal(0)).toFixed(2);
}
