import { api } from './client';
import type { MovementType, PaymentMethod, Transaction } from './transactions';

// Spec 047 (movimientos recurrentes). Espejo de `RecurringTransactionsService`
// (backend). Sin caché offline en la v1: todo exige conexión.

export type RecurringFrequency = 'MONTHLY' | 'YEARLY';
export type OccurrenceStatus = 'PENDING' | 'OVERDUE' | 'CONFIRMED' | 'SKIPPED' | 'RECONCILED';

export interface RecurringTransaction {
  id: string;
  userId: string;
  type: MovementType;
  categoryId: string;
  subcategoryId: string | null;
  concept: string;
  merchant: string | null;
  amount: string;
  paymentMethod: PaymentMethod | null;
  frequency: RecurringFrequency;
  startDate: string;
  endDate: string | null;
  active: boolean;
  /** Spec 049 H2: `amount` es el importe inicial y las ocurrencias usan una estimación. */
  variableAmount: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Occurrence {
  recurringId: string;
  date: string;
  status: OccurrenceStatus;
  transactionId: string | null;
  type: MovementType;
  categoryId: string;
  subcategoryId: string | null;
  concept: string;
  merchant: string | null;
  /** En una ocurrencia sin resolver de una plantilla variable, la estimación (spec 049 H2). */
  amount: string;
  /** Spec 049 H2 criterio 3: `amount` es una estimación. */
  estimated: boolean;
  paymentMethod: PaymentMethod | null;
}

export interface CreateRecurringInput {
  type: MovementType;
  categoryId: string;
  subcategoryId?: string;
  concept: string;
  merchant?: string;
  amount: string;
  paymentMethod?: PaymentMethod;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  variableAmount?: boolean;
}

export type UpdateRecurringInput = Partial<Omit<CreateRecurringInput, 'type' | 'endDate'>> & {
  /** `null` quita la fecha de fin. */
  endDate?: string | null;
  active?: boolean;
};

export const listRecurring = () => api.get<RecurringTransaction[]>('/recurring-transactions');

export const createRecurring = (input: CreateRecurringInput) =>
  api.post<RecurringTransaction>('/recurring-transactions', input);

export const updateRecurring = (id: string, input: UpdateRecurringInput) =>
  api.patch<RecurringTransaction>(`/recurring-transactions/${id}`, input);

export const deleteRecurring = (id: string) => api.delete<void>(`/recurring-transactions/${id}`);

/** Ocurrencias calculadas de las plantillas activas en `[from, to]` (máx. 366 días). */
export const listOccurrences = (from: string, to: string) =>
  api.get<Occurrence[]>(`/recurring-transactions/occurrences?from=${from}&to=${to}`);

/**
 * Crea el movimiento real; `amount` ajusta el importe solo de esta
 * ocurrencia. En una plantilla variable es obligatorio (spec 049 H2).
 */
export const confirmOccurrence = (id: string, date: string, amount?: string) =>
  api.post<Transaction>(`/recurring-transactions/${id}/occurrences/${date}/confirm`, amount ? { amount } : {});

export const skipOccurrence = (id: string, date: string) =>
  api.post<void>(`/recurring-transactions/${id}/occurrences/${date}/skip`);

// --- Spec 049 H3: conciliación con movimientos existentes ------------------

/** Ocurrencia sin resolver tal como la devuelve el resumen de conciliación. */
export interface OpenOccurrence {
  recurringId: string;
  date: string;
  status: 'PENDING' | 'OVERDUE';
  type: MovementType;
  categoryId: string;
  /** Importe de la plantilla, o su estimación si es variable. */
  expectedAmount: string;
  variableAmount: boolean;
  concept: string;
  merchant: string | null;
}

export interface ReconciliationSuggestion {
  occurrence: OpenOccurrence;
  candidates: Transaction[];
}

export interface PossibleDuplicate {
  recurringId: string;
  date: string;
  concept: string;
  /** Movimiento que creó la app al confirmar la ocurrencia. */
  createdTransaction: Transaction;
  /** Movimientos que parecen el mismo cargo (normalmente importados). */
  candidates: Transaction[];
}

export interface RecentReconciliation {
  recurringId: string;
  date: string;
  concept: string;
  reconciledAutomatically: boolean;
  reconciledAt: string;
  /** `null` si el movimiento se borró después. */
  transaction: Transaction | null;
}

export interface ReconciliationOverview {
  suggestions: ReconciliationSuggestion[];
  possibleDuplicates: PossibleDuplicate[];
  recentlyReconciled: RecentReconciliation[];
}

const occurrencePath = (id: string, date: string) => `/recurring-transactions/${id}/occurrences/${date}`;

export const getReconciliationOverview = () => api.get<ReconciliationOverview>('/recurring-transactions/reconciliation');

/** Movimientos cercanos sin enlazar, con los que encajan primero ("Vincular a un movimiento existente"). */
export const listReconciliationCandidates = (id: string, date: string) =>
  api.get<Transaction[]>(`${occurrencePath(id, date)}/candidates`);

export const reconcileOccurrence = (id: string, date: string, transactionId: string) =>
  api.post<void>(`${occurrencePath(id, date)}/reconcile`, { transactionId });

export const undoReconciliation = (id: string, date: string) => api.delete<void>(`${occurrencePath(id, date)}/reconciliation`);

/** "Este movimiento no corresponde a esta ocurrencia" (sugerencia o posible duplicado). */
export const dismissCandidate = (id: string, date: string, transactionId: string) =>
  api.post<void>(`${occurrencePath(id, date)}/dismiss`, { transactionId });

/** Conserva el movimiento importado y borra el que creó la app al confirmar. */
export const resolveDuplicate = (id: string, date: string, keepTransactionId: string) =>
  api.post<void>(`${occurrencePath(id, date)}/resolve-duplicate`, { keepTransactionId });
