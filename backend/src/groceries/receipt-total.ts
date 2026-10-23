import { Decimal } from 'decimal.js';

/**
 * Spec 048 plan.md §0 decisión 6: el importe de un ticket, definido en un
 * solo sitio. Con líneas, su suma (criterio de la spec 040: el total que
 * lee el OCR puede faltar o estar mal); sin líneas (spec 048 H2, tickets y
 * facturas sin desglose), el total impreso. Para los tickets anteriores a
 * la spec 048, que siempre tienen líneas, no cambia nada.
 */
export function receiptTotal(lines: Array<{ amount: string }>, printedTotal: string | null): string | null {
  if (lines.length > 0) return lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2);
  return printedTotal === null ? null : new Decimal(printedTotal).toFixed(2);
}
