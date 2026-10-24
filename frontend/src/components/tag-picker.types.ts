import type { ReceiptTag } from '../api/receipt-tags';

/** Spec 051 H1: lo elegido en `TagPicker`. */
export interface TagPickerValue {
  /** Etiquetas existentes elegidas. */
  existing: ReceiptTag[];
  /** Nombres nuevos, que se crean al guardar. */
  newNames: string[];
}

export const EMPTY_TAG_PICKER_VALUE: TagPickerValue = { existing: [], newNames: [] };
