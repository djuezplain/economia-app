import { api } from './client';

// H1 (spec 025). Espejo de `CashHolding` en el backend (`cash-holdings.service.ts`).
export interface CashHolding {
  id: string;
  userId: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashHoldingInput {
  location: string;
}

export function listCashHoldings(): Promise<CashHolding[]> {
  return api.get<CashHolding[]>('/cash-holdings');
}

export function createCashHolding(input: CashHoldingInput): Promise<CashHolding> {
  return api.post<CashHolding>('/cash-holdings', input);
}

export function updateCashHolding(id: string, input: Partial<CashHoldingInput>): Promise<CashHolding> {
  return api.patch<CashHolding>(`/cash-holdings/${id}`, input);
}

export function deleteCashHolding(id: string): Promise<void> {
  return api.delete<void>(`/cash-holdings/${id}`);
}
