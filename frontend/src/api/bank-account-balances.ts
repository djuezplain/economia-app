import { api } from './client';

// H2 (spec 019). Espejo de `BankAccountBalance` en el backend (`bank-account-balances.service.ts`).
export interface BankAccountBalance {
  id: string;
  bankAccountId: string;
  euros: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBankAccountBalanceInput {
  bankAccountId: string;
  euros: string;
  date: string;
}

export interface UpdateBankAccountBalanceInput {
  euros?: string;
  date?: string;
}

export function listBankAccountBalances(): Promise<BankAccountBalance[]> {
  return api.get<BankAccountBalance[]>('/bank-account-balances');
}

export function createBankAccountBalance(input: CreateBankAccountBalanceInput): Promise<BankAccountBalance> {
  return api.post<BankAccountBalance>('/bank-account-balances', input);
}

export function updateBankAccountBalance(id: string, input: UpdateBankAccountBalanceInput): Promise<BankAccountBalance> {
  return api.patch<BankAccountBalance>(`/bank-account-balances/${id}`, input);
}

export function deleteBankAccountBalance(id: string): Promise<void> {
  return api.delete<void>(`/bank-account-balances/${id}`);
}
