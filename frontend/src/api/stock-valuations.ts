import { api } from './client';

// H3 (spec 020). Espejo de `StockValuation` en el backend (`stock-valuations.service.ts`).
// `pricePerShare`, no el valor total de la posición (revisión §3.ter de spec.md).
export interface StockValuation {
  id: string;
  stockId: string;
  pricePerShare: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockValuationInput {
  stockId: string;
  pricePerShare: string;
  date: string;
}

export interface UpdateStockValuationInput {
  pricePerShare?: string;
  date?: string;
}

export function listStockValuations(): Promise<StockValuation[]> {
  return api.get<StockValuation[]>('/stock-valuations');
}

export function createStockValuation(input: CreateStockValuationInput): Promise<StockValuation> {
  return api.post<StockValuation>('/stock-valuations', input);
}

export function updateStockValuation(id: string, input: UpdateStockValuationInput): Promise<StockValuation> {
  return api.patch<StockValuation>(`/stock-valuations/${id}`, input);
}

export function deleteStockValuation(id: string): Promise<void> {
  return api.delete<void>(`/stock-valuations/${id}`);
}
