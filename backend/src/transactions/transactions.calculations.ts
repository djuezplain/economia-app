import { Decimal } from 'decimal.js';

export type MovementType = 'INCOME' | 'EXPENSE';

/**
 * spec 002, plan.md §4: funciones puras de cálculo, sin acceso a base de
 * datos — reciben los movimientos ya cargados y devuelven números. Usan
 * `decimal.js` (no aritmética de `number` nativa) porque `amount` llega
 * como `string` desde Drizzle (constitution §2 — evitar coma flotante
 * binaria en cálculos financieros).
 *
 * Se crean en el grupo 2 (T2.1: el resumen de `GET /transactions` ya las
 * necesita), no en el grupo 3 como situaba `plan.md` §1 (`dashboard/
 * dashboard.calculations.ts`) — el dashboard (grupo 3) las reutilizará
 * desde aquí en vez de duplicarlas; se documenta como un ajuste menor de
 * ubicación, no de diseño.
 */

export function sumAmounts(transactions: Array<{ amount: string }>): string {
  return transactions.reduce((acc, t) => acc.plus(t.amount), new Decimal(0)).toFixed(2);
}

export function sumByType(transactions: Array<{ type: MovementType; amount: string }>, type: MovementType): string {
  return sumAmounts(transactions.filter((t) => t.type === type));
}

/**
 * Media por día. `days` lo decide quien llama según el contexto (plan.md
 * §4): días transcurridos del mes en curso, o el mes completo si ya cerró.
 */
export function average(total: string, days: number): string {
  if (days <= 0) return '0.00';
  return new Decimal(total).dividedBy(days).toFixed(2);
}

/** Nº de meses distintos (`YYYY-MM`) representados en un conjunto de fechas. */
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

/**
 * H2 criterio 4 (spec.md §2): desglose por subcategoría, además de por
 * categoría — solo los gastos con `subcategoryId` informado entran en el
 * resultado (un ingreso, o un gasto sin subcategoría, no aporta nada aquí).
 * Añadida en el cierre de la spec (T4.2): `groupByCategory` agrupaba solo
 * por `categoryId` desde T2.1, sin desglose por subcategoría — hueco real
 * frente a `spec.md` encontrado en el checklist de cierre (T4.1) y resuelto
 * con Diego antes de tocar código (ver `tasks.md`, grupo 4).
 */
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
