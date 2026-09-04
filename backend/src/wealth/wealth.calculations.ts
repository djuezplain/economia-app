import { Decimal } from 'decimal.js';

/**
 * H3 criterio 2 (spec 018): Valor de compra = Precio de compra × Número de
 * acciones. Se calcula, no se guarda — nunca puede quedar desincronizado de
 * los dos campos reales (plan.md §1).
 */
export function purchaseValue(purchasePrice: string, shareCount: string): string {
  return new Decimal(purchasePrice).times(shareCount).toFixed(2);
}
