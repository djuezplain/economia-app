import { api } from './client';

// H3 (spec 021). Espejo de `FundValuation` en el backend (`fund-valuations.service.ts`).
// `pricePerShare`, no el valor total de la posición — mismo criterio que `StockValuation`.
export interface FundValuation {
  id: string;
  fundId: string;
  pricePerShare: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundValuationInput {
  fundId: string;
  pricePerShare: string;
  date: string;
}

export interface UpdateFundValuationInput {
  pricePerShare?: string;
  date?: string;
}

export function listFundValuations(): Promise<FundValuation[]> {
  return api.get<FundValuation[]>('/fund-valuations');
}

export function createFundValuation(input: CreateFundValuationInput): Promise<FundValuation> {
  return api.post<FundValuation>('/fund-valuations', input);
}

export function updateFundValuation(id: string, input: UpdateFundValuationInput): Promise<FundValuation> {
  return api.patch<FundValuation>(`/fund-valuations/${id}`, input);
}

export function deleteFundValuation(id: string): Promise<void> {
  return api.delete<void>(`/fund-valuations/${id}`);
}
