import { api } from './client';

// H1 (spec 044). Espejo de `FundSale` en el backend (`fund-sales.service.ts`).
export interface FundSale {
  id: string;
  fundId: string;
  shareCount: string;
  salePrice: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundSaleInput {
  fundId: string;
  shareCount: string;
  salePrice: string;
  date: string;
}

export interface UpdateFundSaleInput {
  shareCount?: string;
  salePrice?: string;
  date?: string;
}

export function listFundSales(): Promise<FundSale[]> {
  return api.get<FundSale[]>('/fund-sales');
}

export function createFundSale(input: CreateFundSaleInput): Promise<FundSale> {
  return api.post<FundSale>('/fund-sales', input);
}

export function updateFundSale(id: string, input: UpdateFundSaleInput): Promise<FundSale> {
  return api.patch<FundSale>(`/fund-sales/${id}`, input);
}

export function deleteFundSale(id: string): Promise<void> {
  return api.delete<void>(`/fund-sales/${id}`);
}
