import { api } from './client';

// H3 (spec 020). Espejo de `StockValuation` en el backend (`stock-valuations.service.ts`).
export interface StockValuation {
  id: string;
  stockId: string;
  valuation: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockValuationInput {
  stockId: string;
  valuation: string;
  date: string;
}

export interface UpdateStockValuationInput {
  valuation?: string;
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
