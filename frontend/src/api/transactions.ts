import { api } from './client';
import { putTransaction, putTransactions } from '../offline/db';

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

// Spec 011 (modo offline), plan.md §4: "escritura de paso" — cualquier GET
// real que ya se pide durante el uso normal de la app también actualiza la
// caché local, sin esperar a la siguiente hidratación completa
// (`offline/sync.ts`). No cambia el valor devuelto a quien llama.
export async function listTransactions(filters: ListTransactionsFilters = {}): Promise<ListTransactionsResult> {
  const result = await api.get<ListTransactionsResult>(`/transactions${buildQuery(filters)}`);
  void putTransactions(result.items.map((item) => ({ ...item, pending: false, pendingAction: null })));
  return result;
}

// Spec 006 (páginas de movimientos), plan.md §3: necesario para que
// "Registrar" en modo edición cargue el movimiento a partir del `:id` de la
// URL, sea cual sea la forma en que se llegó a esa página (recarga incluida).
export async function getTransaction(id: string): Promise<Transaction> {
  const transaction = await api.get<Transaction>(`/transactions/${id}`);
  void putTransaction({ ...transaction, pending: false, pendingAction: null });
  return transaction;
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
