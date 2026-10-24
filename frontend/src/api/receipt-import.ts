import { api } from './client';
import type { ReceiptTagsSelection } from './receipt-tags';

// Spec 034 (H1-H5). Espejo de `ReceiptPreview`/`ReceiptPreviewLine` (backend,
// `receipt-import/receipt-import.types.ts`) y de `ConfirmReceiptDto`.
export type ReceiptUnit = 'unidad' | 'kg';

export interface ReceiptPreviewMatch {
  matchedId: string | null;
  suggestedName: string | null;
}

export interface ReceiptPreviewLine {
  description: string;
  quantity: string;
  unit: ReceiptUnit;
  pricePerUnit: string;
  amount: string;
  product: { matchedId: string | null; suggestedName: string };
}

export interface ReceiptPreview {
  supermarket: ReceiptPreviewMatch;
  date: string | null;
  printedTotal: string | null;
  linesTotal: string;
  lines: ReceiptPreviewLine[];
  warnings: string[];
  /** Spec 048 H1: el documento ya guardado como pendiente; su `id` se manda al confirmar. */
  document: { id: string; mimeType: string; sizeBytes: number; pageCount: number | null };
}

/** `{ id }` (existente) o `{ name }` (nuevo) — plan.md §3/§7. */
export interface EntityRef {
  id?: string;
  name?: string;
}

export interface ConfirmReceiptLine {
  description: string;
  quantity: string;
  unit: ReceiptUnit;
  pricePerUnit: string;
  amount: string;
  /** Spec 048 H2 criterio 4: `null` = sin producto (no entra en la comparativa). */
  product: EntityRef | null;
}

export interface ConfirmReceiptPayload {
  supermarket: EntityRef;
  date: string;
  printedTotal?: string;
  lines: ConfirmReceiptLine[];
}

/** Spec 048 H1 criterio 1: solo al confirmar una importación (no al editar un ticket guardado). */
export interface ConfirmImportPayload extends ConfirmReceiptPayload {
  documentId?: string;
  /** Spec 051 H1 criterio 5. */
  tags?: ReceiptTagsSelection;
}

function fileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/** H1: no escribe nada — solo reconoce y sugiere. */
export function previewReceiptImport(file: File): Promise<ReceiptPreview> {
  return api.postForm<ReceiptPreview>('/receipt-import/preview', fileFormData(file));
}

/** plan.md §7: a diferencia de `confirmStockImport`, no se vuelve a subir la imagen — es JSON ya corregido. */
export function confirmReceiptImport(payload: ConfirmImportPayload): Promise<{ receiptId: string }> {
  return api.post<{ receiptId: string }>('/receipt-import/confirm', payload);
}
