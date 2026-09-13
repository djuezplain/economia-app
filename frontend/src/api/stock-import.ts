import { api } from './client';

// Spec 033 (H1-H6). Espejo de `StockImportSummary`/`StockImportRowSummary`
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

/** H6: qué historiales importar — las tres a `true` por defecto (plan.md §15.1/§15.5). */
export interface StockImportOptions {
  includePurchases: boolean;
  includeSales: boolean;
  includeValuations: boolean;
}

function stockImportFormData(file: File, options: StockImportOptions): FormData {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('includePurchases', String(options.includePurchases));
  formData.append('includeSales', String(options.includeSales));
  formData.append('includeValuations', String(options.includeValuations));
  return formData;
}

/** H1: no escribe nada — solo calcula qué se importaría. */
export function previewStockImport(file: File, options: StockImportOptions): Promise<StockImportSummary> {
  return api.postForm<StockImportSummary>('/stock-import/preview', stockImportFormData(file, options));
}

/** H1-H6: mismo fichero y misma selección ya elegidos, se vuelven a subir (mismo criterio que `confirmImport`/`confirmDataImport`). */
export function confirmStockImport(file: File, options: StockImportOptions): Promise<StockImportSummary> {
  return api.postForm<StockImportSummary>('/stock-import/confirm', stockImportFormData(file, options));
}
