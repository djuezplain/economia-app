import { api } from './client';

// Spec 051 H1. Espejo de `ReceiptTag`/`ReceiptTagWithCount` (backend, `groceries/receipt-tags.service.ts`).
export const RECEIPT_TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'] as const;
export type ReceiptTagColor = (typeof RECEIPT_TAG_COLORS)[number];

export const TAG_COLOR_LABELS: Record<ReceiptTagColor, string> = {
  gray: 'Gris',
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  green: 'Verde',
  teal: 'Turquesa',
  blue: 'Azul',
  purple: 'Morado',
};

export interface ReceiptTag {
  id: string;
  name: string;
  color: ReceiptTagColor | null;
}

export interface ReceiptTagWithCount extends ReceiptTag {
  receiptCount: number;
}

/** Las etiquetas existentes elegidas y los nombres nuevos que se crearán al guardar. */
export interface ReceiptTagsSelection {
  tagIds?: string[];
  newTags?: string[];
}

/** Mismo criterio que el índice único del backend: sin mayúsculas ni tildes. */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function listReceiptTags(): Promise<ReceiptTagWithCount[]> {
  return api.get<ReceiptTagWithCount[]>('/receipt-tags');
}

export function createReceiptTag(name: string, color: ReceiptTagColor | null = null): Promise<ReceiptTag> {
  return api.post<ReceiptTag>('/receipt-tags', { name, color });
}

export function updateReceiptTag(id: string, changes: { name?: string; color?: ReceiptTagColor | null }): Promise<ReceiptTag> {
  return api.patch<ReceiptTag>(`/receipt-tags/${id}`, changes);
}

export function deleteReceiptTag(id: string): Promise<void> {
  return api.delete<void>(`/receipt-tags/${id}`);
}

export function setReceiptTags(receiptId: string, selection: ReceiptTagsSelection): Promise<ReceiptTag[]> {
  return api.put<ReceiptTag[]>(`/receipts/${receiptId}/tags`, selection);
}
