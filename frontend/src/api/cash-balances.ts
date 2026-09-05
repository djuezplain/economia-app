import { api } from './client';

// H2 (spec 025). Espejo de `CashBalance` en el backend (`cash-balances.service.ts`).
export interface CashBalance {
  id: string;
  cashHoldingId: string;
  amount: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashBalanceInput {
  cashHoldingId: string;
  amount: string;
  date: string;
}

export interface UpdateCashBalanceInput {
  amount?: string;
  date?: string;
}

export function listCashBalances(): Promise<CashBalance[]> {
  return api.get<CashBalance[]>('/cash-balances');
}

export function createCashBalance(input: CreateCashBalanceInput): Promise<CashBalance> {
  return api.post<CashBalance>('/cash-balances', input);
}

export function updateCashBalance(id: string, input: UpdateCashBalanceInput): Promise<CashBalance> {
  return api.patch<CashBalance>(`/cash-balances/${id}`, input);
}

export function deleteCashBalance(id: string): Promise<void> {
  return api.delete<void>(`/cash-balances/${id}`);
}
