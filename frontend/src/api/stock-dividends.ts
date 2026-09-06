import { api } from './client';

// H1 (spec 029). Espejo de `StockDividend` en el backend (`stock-dividends.service.ts`).
export interface StockDividend {
  id: string;
  stockId: string;
  netAmount: string;
  retentionPercent: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockDividendInput {
  stockId: string;
  netAmount: string;
  retentionPercent?: string;
  date: string;
}

export interface UpdateStockDividendInput {
  netAmount?: string;
  retentionPercent?: string;
  date?: string;
}

export function listStockDividends(): Promise<StockDividend[]> {
  return api.get<StockDividend[]>('/stock-dividends');
}

export function createStockDividend(input: CreateStockDividendInput): Promise<StockDividend> {
  return api.post<StockDividend>('/stock-dividends', input);
}

export function updateStockDividend(id: string, input: UpdateStockDividendInput): Promise<StockDividend> {
  return api.patch<StockDividend>(`/stock-dividends/${id}`, input);
}

export function deleteStockDividend(id: string): Promise<void> {
  return api.delete<void>(`/stock-dividends/${id}`);
}
