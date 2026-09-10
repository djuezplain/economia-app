import { api } from './client';

// Spec 033 (H1-H5). Espejo de `StockImportSummary`/`StockImportRowSummary`
// (backend, `stock-import/stock-import.types.ts`).
export interface TableImportCount {
  total: number;
  toImport: number;
  alreadyExisting: number;
}

export type StockImportRowStatus = 'new' | 'existing' | 'ambiguous';

export interface StockImportRowSummary {
  name: string;
  status: StockImportRowStatus;
  custodyBank: string | null;
  purchases: TableImportCount;
  sales: TableImportCount;
  valuations: TableImportCount;
}

export interface StockImportSummary {
  stocks: StockImportRowSummary[];
  totals: { newStocks: number; existingStocks: number; ambiguousStocks: number };
}

function fileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/** H1: no escribe nada — solo calcula qué se importaría. */
export function previewStockImport(file: File): Promise<StockImportSummary> {
  return api.postForm<StockImportSummary>('/stock-import/preview', fileFormData(file));
}

/** H1-H5: mismo fichero ya seleccionado, se vuelve a subir (mismo criterio que `confirmImport`/`confirmDataImport`). */
export function confirmStockImport(file: File): Promise<StockImportSummary> {
  return api.postForm<StockImportSummary>('/stock-import/confirm', fileFormData(file));
}
