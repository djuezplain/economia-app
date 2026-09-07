import { api } from './client';

// H1 (spec 031). Espejo de `StockSale` en el backend (`stock-sales.service.ts`).
export interface StockSale {
  id: string;
  stockId: string;
  shareCount: string;
  salePrice: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockSaleInput {
  stockId: string;
  shareCount: string;
  salePrice: string;
  date: string;
}

export interface UpdateStockSaleInput {
  shareCount?: string;
  salePrice?: string;
  date?: string;
}

export function listStockSales(): Promise<StockSale[]> {
  return api.get<StockSale[]>('/stock-sales');
}

export function createStockSale(input: CreateStockSaleInput): Promise<StockSale> {
  return api.post<StockSale>('/stock-sales', input);
}

export function updateStockSale(id: string, input: UpdateStockSaleInput): Promise<StockSale> {
  return api.patch<StockSale>(`/stock-sales/${id}`, input);
}

export function deleteStockSale(id: string): Promise<void> {
  return api.delete<void>(`/stock-sales/${id}`);
}
