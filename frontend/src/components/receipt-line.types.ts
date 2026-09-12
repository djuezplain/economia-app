import type { ReceiptUnit } from '../api/receipt-import';

export const NEW_OPTION_VALUE = '';

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
