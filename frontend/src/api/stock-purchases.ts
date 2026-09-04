import { api } from './client';

// H2 (spec 020). Espejo de `StockPurchase` en el backend (`stock-purchases.service.ts`).
export interface StockPurchase {
  id: string;
  stockId: string;
  shareCount: string;
  purchasePrice: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockPurchaseInput {
  stockId: string;
  shareCount: string;
  purchasePrice: string;
}

export interface UpdateStockPurchaseInput {
  shareCount?: string;
  purchasePrice?: string;
}

export function listStockPurchases(): Promise<StockPurchase[]> {
  return api.get<StockPurchase[]>('/stock-purchases');
}

export function createStockPurchase(input: CreateStockPurchaseInput): Promise<StockPurchase> {
  return api.post<StockPurchase>('/stock-purchases', input);
}

export function updateStockPurchase(id: string, input: UpdateStockPurchaseInput): Promise<StockPurchase> {
  return api.patch<StockPurchase>(`/stock-purchases/${id}`, input);
}

export function deleteStockPurchase(id: string): Promise<void> {
  return api.delete<void>(`/stock-purchases/${id}`);
}
