/** Spec 034, plan.md §3. Respuesta de `POST /receipt-import/preview` — nada de esto está persistido todavía. */
export interface ReceiptPreview {
  supermarket: { matchedId: string | null; suggestedName: string | null };
  date: string | null;
  printedTotal: string | null;
  linesTotal: string;
  lines: ReceiptPreviewLine[];
  /** p. ej. "no se ha podido leer el total del ticket" (H1 criterio 4, H2 criterio 3). */
  warnings: string[];
  /**
   * Spec 048 H1: el documento ya está guardado como pendiente; se asocia al
   * ticket al confirmar pasando este `id` como `documentId`.
   */
  document: { id: string; mimeType: string; sizeBytes: number; pageCount: number | null };
}

export interface ReceiptPreviewLine {
  description: string;
  quantity: string;
  unit: 'unidad' | 'kg';
  pricePerUnit: string;
  amount: string;
  product: { matchedId: string | null; suggestedName: string };
}
