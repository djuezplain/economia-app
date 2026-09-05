import { api } from './client';

// H2 (spec 021). Espejo de `FundPurchase` en el backend (`fund-purchases.service.ts`).
export interface FundPurchase {
  id: string;
  fundId: string;
  shareCount: string;
  purchasePrice: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundPurchaseInput {
  fundId: string;
  shareCount: string;
  purchasePrice: string;
  date: string;
}

export interface UpdateFundPurchaseInput {
  shareCount?: string;
  purchasePrice?: string;
  date?: string;
}

export function listFundPurchases(): Promise<FundPurchase[]> {
  return api.get<FundPurchase[]>('/fund-purchases');
}

export function createFundPurchase(input: CreateFundPurchaseInput): Promise<FundPurchase> {
  return api.post<FundPurchase>('/fund-purchases', input);
}

export function updateFundPurchase(id: string, input: UpdateFundPurchaseInput): Promise<FundPurchase> {
  return api.patch<FundPurchase>(`/fund-purchases/${id}`, input);
}

export function deleteFundPurchase(id: string): Promise<void> {
  return api.delete<void>(`/fund-purchases/${id}`);
}
