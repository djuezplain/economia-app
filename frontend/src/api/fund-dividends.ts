import { api } from './client';

// H1 (spec 029). Espejo de `FundDividend` en el backend (`fund-dividends.service.ts`).
export interface FundDividend {
  id: string;
  fundId: string;
  netAmount: string;
  retentionPercent: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFundDividendInput {
  fundId: string;
  netAmount: string;
  retentionPercent?: string;
  date: string;
}

export interface UpdateFundDividendInput {
  netAmount?: string;
  retentionPercent?: string;
  date?: string;
}

export function listFundDividends(): Promise<FundDividend[]> {
  return api.get<FundDividend[]>('/fund-dividends');
}

export function createFundDividend(input: CreateFundDividendInput): Promise<FundDividend> {
  return api.post<FundDividend>('/fund-dividends', input);
}

export function updateFundDividend(id: string, input: UpdateFundDividendInput): Promise<FundDividend> {
  return api.patch<FundDividend>(`/fund-dividends/${id}`, input);
}

export function deleteFundDividend(id: string): Promise<void> {
  return api.delete<void>(`/fund-dividends/${id}`);
}
