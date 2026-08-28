import { api } from './client';

export type MovementType = 'INCOME' | 'EXPENSE';
export type PaymentMethod = 'CARD' | 'DIRECT_DEBIT' | 'CASH' | 'TRANSFER';

// H1/H2 (spec 002). Espejo de `Transaction` en el backend (`transactions.service.ts`).
export interface Transaction {
  id: string;
  userId: string;
  type: MovementType;
  date: string;
  categoryId: string;
  subcategoryId: string | null;
  concept: string;
  merchant: string | null;
  amount: string;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionsSummary {
  total: string;
  averagePerMonth: string | null;
  byCategory: Array<{ categoryId: string; total: string }>;
  // H2 criterio 4 (spec.md §2). Solo los gastos con subcategoría entran aquí.
  bySubcategory: Array<{ subcategoryId: string; total: string }>;
}

export interface ListTransactionsResult {
  items: Transaction[];
  page: number;
  limit: number;
  totalItems: number;
  summary: TransactionsSummary;
}

export interface ListTransactionsFilters {
  type?: MovementType;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  subcategoryId?: string;
  merchant?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface CreateTransactionInput {
  type: MovementType;
  date: string;
  categoryId: string;
  subcategoryId?: string;
  concept: string;
  merchant?: string;
  amount: string;
  paymentMethod?: PaymentMethod;
}

export type UpdateTransactionInput = Partial<Omit<CreateTransactionInput, 'type'>>;

function buildQuery(filters: ListTransactionsFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listTransactions(filters: ListTransactionsFilters = {}): Promise<ListTransactionsResult> {
  return api.get<ListTransactionsResult>(`/transactions${buildQuery(filters)}`);
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return api.post<Transaction>('/transactions', input);
}

export function updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
  return api.patch<Transaction>(`/transactions/${id}`, input);
}

export function deleteTransaction(id: string): Promise<void> {
  return api.delete<void>(`/transactions/${id}`);
}
