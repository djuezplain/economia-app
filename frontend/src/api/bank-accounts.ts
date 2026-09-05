import { api } from './client';

// H1 (spec 019). Espejo de `BankAccount` en el backend (`bank-accounts.service.ts`).
export interface BankAccount {
  id: string;
  userId: string;
  bank: string;
  accountNumber: string;
  alias: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountInput {
  bank: string;
  accountNumber: string;
  alias?: string;
}

export function listBankAccounts(): Promise<BankAccount[]> {
  return api.get<BankAccount[]>('/bank-accounts');
}

export function createBankAccount(input: BankAccountInput): Promise<BankAccount> {
  return api.post<BankAccount>('/bank-accounts', input);
}

export function updateBankAccount(id: string, input: Partial<BankAccountInput>): Promise<BankAccount> {
  return api.patch<BankAccount>(`/bank-accounts/${id}`, input);
}

export function deleteBankAccount(id: string): Promise<void> {
  return api.delete<void>(`/bank-accounts/${id}`);
}
