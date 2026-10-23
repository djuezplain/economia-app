import type { ConfirmReceiptLine, ReceiptUnit } from '../api/receipt-import';

export const NEW_OPTION_VALUE = '';
/** Spec 048 H2 criterio 4: la línea se guarda sin emparejar con ningún producto. */
export const NO_PRODUCT_VALUE = '__sin-producto__';

export interface EditableLine {
  key: string;
  description: string;
  quantity: string;
  unit: ReceiptUnit;
  pricePerUnit: string;
  amount: string;
  productId: string;
  productName: string;
}

let nextLineKey = 0;
export function newLineKey(): string {
  nextLineKey += 1;
  return `line-${nextLineKey}`;
}

export function sumAmounts(lines: EditableLine[]): number {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

/**
 * Las líneas editables tal como se envían al confirmar una importación o al
 * guardar un ticket editado (antes duplicado en las dos pantallas).
 */
export function toConfirmLines(lines: EditableLine[]): ConfirmReceiptLine[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    pricePerUnit: line.pricePerUnit,
    amount: line.amount,
    product: line.productId === NO_PRODUCT_VALUE ? null : line.productId ? { id: line.productId } : { name: line.productName },
  }));
}

/** Spec 048 H2 criterio 2: sin líneas hace falta el total para poder guardar. */
export function canSaveReceipt(lines: EditableLine[], printedTotal: string): boolean {
  return lines.length > 0 || printedTotal.trim() !== '';
}
