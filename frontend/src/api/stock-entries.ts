import { api } from './client';

// H3 (spec 018). Espejo de `StockEntry` en el backend (`stock-entries.service.ts`).
// `purchaseValue` no viene del backend — se calcula en el frontend (H3 criterio 2).
export interface StockEntry {
  id: string;
  userId: string;
  custodyBank: string;
  stock: string;
  shareCount: string;
  purchasePrice: string;
  currentValuation: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockEntryInput {
  custodyBank: string;
  stock: string;
  shareCount: string;
  purchasePrice: string;
  currentValuation: string;
}

export function listStockEntries(): Promise<StockEntry[]> {
  return api.get<StockEntry[]>('/stock-entries');
}

export function createStockEntry(input: StockEntryInput): Promise<StockEntry> {
  return api.post<StockEntry>('/stock-entries', input);
}

export function updateStockEntry(id: string, input: Partial<StockEntryInput>): Promise<StockEntry> {
  return api.patch<StockEntry>(`/stock-entries/${id}`, input);
}

export function deleteStockEntry(id: string): Promise<void> {
  return api.delete<void>(`/stock-entries/${id}`);
}
