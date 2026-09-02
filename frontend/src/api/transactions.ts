import { api } from './client';
import { deleteCachedTransaction, enqueue, getCachedTransaction, getCachedUserId, putTransaction, putTransactions } from '../offline/db';
import type { CachedTransaction } from '../offline/db';
import { isOnline } from '../offline/connectivity';

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
//
// Spec 011 (modo offline), H2 criterio 3: sin conexión, se lee de la copia
// local — necesario para poder editar un movimiento ya existente (o uno
// creado offline) sin red; si no está en la caché, falla con un mensaje
// claro (mismo criterio que `updateTransactionOffline`).
export async function getTransaction(id: string): Promise<Transaction> {
  if (!isOnline()) {
    const cached = await getCachedTransaction(id);
    if (!cached) throw new Error('No se puede cargar sin conexión un movimiento que no está en la caché local.');
    return cached;
  }
  const transaction = await api.get<Transaction>(`/transactions/${id}`);
  void putTransaction({ ...transaction, pending: false, pendingAction: null });
  return transaction;
}

/**
 * Spec 011 (modo offline), plan.md §5. Online: sin cambios de comportamiento
 * (además de escribir en la caché, igual que los `GET`). Offline: genera un
 * `id` (aceptado por el backend como creación idempotente, ver
 * `backend/src/transactions/transactions.service.ts`), guarda un registro
 * optimista marcado `pending` y encola la creación — la página que llama no
 * necesita distinguir los dos casos, recibe en ambos un `Transaction` con
 * los mismos datos que vería si ya estuviera confirmado por el servidor.
 */
export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  if (!isOnline()) return createTransactionOffline(input);
  const transaction = await api.post<Transaction>('/transactions', input);
  const cached: CachedTransaction = { ...transaction, pending: false, pendingAction: null };
  void putTransaction(cached);
  return cached;
}

async function createTransactionOffline(input: CreateTransactionInput): Promise<Transaction> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const transaction: CachedTransaction = {
    id,
    userId: (await getCachedUserId()) ?? '',
    type: input.type,
    date: input.date,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId ?? null,
    concept: input.concept,
    merchant: input.merchant ?? null,
    amount: input.amount,
    paymentMethod: input.paymentMethod ?? null,
    createdAt: now,
    updatedAt: now,
    pending: true,
    pendingAction: 'CREATE',
  };
  await putTransaction(transaction);
  await enqueue({
    entity: 'transaction',
    action: 'CREATE',
    transactionId: id,
    payload: { id, ...input },
    createdAt: now,
    status: 'pending',
    failureReason: null,
    failureKind: null,
  });
  return transaction;
}

export async function updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
  if (!isOnline()) return updateTransactionOffline(id, input);
  const transaction = await api.patch<Transaction>(`/transactions/${id}`, input);
  const cached: CachedTransaction = { ...transaction, pending: false, pendingAction: null };
  void putTransaction(cached);
  return cached;
}

async function updateTransactionOffline(id: string, input: UpdateTransactionInput): Promise<Transaction> {
  const existing = await getCachedTransaction(id);
  if (!existing) {
    throw new Error('No se puede editar sin conexión un movimiento que no está en la caché local.');
  }
  const now = new Date().toISOString();
  const updated: CachedTransaction = {
    ...existing,
    ...(input.date !== undefined && { date: input.date }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    ...(input.subcategoryId !== undefined && { subcategoryId: input.subcategoryId }),
    ...(input.concept !== undefined && { concept: input.concept }),
    ...(input.merchant !== undefined && { merchant: input.merchant }),
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.paymentMethod !== undefined && { paymentMethod: input.paymentMethod }),
    updatedAt: now,
    pending: true,
    // Si ya era una creación offline sin sincronizar, se queda como
    // "creación" (más informativo que "edición" para un movimiento que el
    // servidor todavía no conoce en absoluto).
    pendingAction: existing.pendingAction === 'CREATE' ? 'CREATE' : 'UPDATE',
  };
  await putTransaction(updated);
  await enqueue({
    entity: 'transaction',
    action: 'UPDATE',
    transactionId: id,
    payload: { ...input },
    createdAt: now,
    status: 'pending',
    failureReason: null,
    failureKind: null,
  });
  return updated;
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!isOnline()) return deleteTransactionOffline(id);
  await api.delete<void>(`/transactions/${id}`);
  void deleteCachedTransaction(id);
}

async function deleteTransactionOffline(id: string): Promise<void> {
  await deleteCachedTransaction(id);
  await enqueue({
    entity: 'transaction',
    action: 'DELETE',
    transactionId: id,
    payload: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
    failureReason: null,
    failureKind: null,
  });
}
