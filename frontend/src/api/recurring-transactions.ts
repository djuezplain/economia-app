import { api } from './client';
import type { MovementType, PaymentMethod, Transaction } from './transactions';

// Spec 047 (movimientos recurrentes). Espejo de `RecurringTransactionsService`
// (backend). Sin caché offline en la v1: todo exige conexión.

export type RecurringFrequency = 'MONTHLY' | 'YEARLY';
export type OccurrenceStatus = 'PENDING' | 'OVERDUE' | 'CONFIRMED' | 'SKIPPED';

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
  amount: string;
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

/** Crea el movimiento real; `amount` ajusta el importe solo de esta ocurrencia. */
export const confirmOccurrence = (id: string, date: string, amount?: string) =>
  api.post<Transaction>(`/recurring-transactions/${id}/occurrences/${date}/confirm`, amount ? { amount } : {});

export const skipOccurrence = (id: string, date: string) =>
  api.post<void>(`/recurring-transactions/${id}/occurrences/${date}/skip`);
