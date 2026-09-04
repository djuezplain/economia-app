import { api } from './client';

// H2 (spec 018). Espejo de `BankAccountEntry` en el backend (`bank-account-entries.service.ts`).
export interface BankAccountEntry {
  id: string;
  userId: string;
  bank: string;
  accountNumber: string;
  euros: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountEntryInput {
  bank: string;
  accountNumber: string;
  euros: string;
  date: string;
}

export function listBankAccountEntries(): Promise<BankAccountEntry[]> {
  return api.get<BankAccountEntry[]>('/bank-account-entries');
}

export function createBankAccountEntry(input: BankAccountEntryInput): Promise<BankAccountEntry> {
  return api.post<BankAccountEntry>('/bank-account-entries', input);
}

export function updateBankAccountEntry(id: string, input: Partial<BankAccountEntryInput>): Promise<BankAccountEntry> {
  return api.patch<BankAccountEntry>(`/bank-account-entries/${id}`, input);
}

export function deleteBankAccountEntry(id: string): Promise<void> {
  return api.delete<void>(`/bank-account-entries/${id}`);
}
