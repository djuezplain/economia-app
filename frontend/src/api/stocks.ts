import { api } from './client';

// H1 (spec 020). Espejo de `Stock` en el backend (`stocks.service.ts`).
export interface Stock {
  id: string;
  userId: string;
  custodyBank: string;
  stock: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockInput {
  custodyBank: string;
  stock: string;
}

export function listStocks(): Promise<Stock[]> {
  return api.get<Stock[]>('/stocks');
}

export function createStock(input: StockInput): Promise<Stock> {
  return api.post<Stock>('/stocks', input);
}

export function updateStock(id: string, input: Partial<StockInput>): Promise<Stock> {
  return api.patch<Stock>(`/stocks/${id}`, input);
}

export function deleteStock(id: string): Promise<void> {
  return api.delete<void>(`/stocks/${id}`);
}
