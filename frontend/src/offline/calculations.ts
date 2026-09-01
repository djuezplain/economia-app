import { Decimal } from 'decimal.js';

export type MovementType = 'INCOME' | 'EXPENSE';

/**
 * Spec 011 (modo offline). Espejo de
 * `backend/src/transactions/transactions.calculations.ts` — mismas
 * funciones puras, mismo uso de `decimal.js` (no aritmética de `number`
 * nativa: `amount` es un `string` con dos decimales, constitution.md §2,
 * "los cálculos financieros no llevan lógica a ojo"). Necesario para que
 * `MovementsSummaryPage` pueda mostrar el mismo resumen sin conexión, a
 * partir de la caché local, sin llamar al backend.
 *
 * Se duplica (no se comparte un paquete) porque frontend y backend son dos
 * proyectos npm independientes sin infraestructura de paquete compartido en
 * este monorepo — introducirla solo para esto habría sido una reestructura
 * mayor no pedida por esta spec. Mismo riesgo que cualquier duplicación:
 * si `transactions.calculations.ts` cambia, este fichero debe cambiar
 * igual — ambos están cubiertos por tests unitarios propios que fijan el
 * comportamiento exacto.
 */

export function sumAmounts(transactions: Array<{ amount: string }>): string {
  return transactions.reduce((acc, t) => acc.plus(t.amount), new Decimal(0)).toFixed(2);
}

export function sumByType(transactions: Array<{ type: MovementType; amount: string }>, type: MovementType): string {
  return sumAmounts(transactions.filter((t) => t.type === type));
}

export function average(total: string, days: number): string {
  if (days <= 0) return '0.00';
  return new Decimal(total).dividedBy(days).toFixed(2);
}

export function distinctMonthsCount(dates: string[]): number {
  return new Set(dates.map((d) => d.slice(0, 7))).size;
}

export function groupByCategory(
  transactions: Array<{ categoryId: string; amount: string }>,
): Array<{ categoryId: string; total: string }> {
  const totals = new Map<string, Decimal>();
  for (const t of transactions) {
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? new Decimal(0)).plus(t.amount));
  }
  return Array.from(totals.entries()).map(([categoryId, total]) => ({ categoryId, total: total.toFixed(2) }));
}

export function groupBySubcategory(
  transactions: Array<{ subcategoryId: string | null; amount: string }>,
): Array<{ subcategoryId: string; total: string }> {
  const totals = new Map<string, Decimal>();
  for (const t of transactions) {
    if (!t.subcategoryId) continue;
    totals.set(t.subcategoryId, (totals.get(t.subcategoryId) ?? new Decimal(0)).plus(t.amount));
  }
  return Array.from(totals.entries()).map(([subcategoryId, total]) => ({ subcategoryId, total: total.toFixed(2) }));
}
