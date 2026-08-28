import { api } from './client';
import type { TargetType } from './savings-goals';

// H2 (spec 004). Espejo de `ExpenseBudget` en el backend (`expense-budgets.service.ts`).
export interface ExpenseBudget {
  id: string;
  userId: string;
  categoryId: string | null; // null = presupuesto global.
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseBudgetInput {
  categoryId?: string; // se omite para el presupuesto global.
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
}

export interface UpdateExpenseBudgetInput {
  targetType?: TargetType;
  targetValue?: string;
  alertThresholdPercent?: string;
}

export function listExpenseBudgets(): Promise<ExpenseBudget[]> {
  return api.get<ExpenseBudget[]>('/expense-budgets');
}

export function createExpenseBudget(input: CreateExpenseBudgetInput): Promise<ExpenseBudget> {
  return api.post<ExpenseBudget>('/expense-budgets', input);
}

export function updateExpenseBudget(id: string, input: UpdateExpenseBudgetInput): Promise<ExpenseBudget> {
  return api.patch<ExpenseBudget>(`/expense-budgets/${id}`, input);
}

export function deleteExpenseBudget(id: string): Promise<void> {
  return api.delete<void>(`/expense-budgets/${id}`);
}
