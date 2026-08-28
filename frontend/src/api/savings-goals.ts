import { api } from './client';

export type GoalPeriod = 'MONTHLY' | 'ANNUAL';
export type TargetType = 'AMOUNT' | 'PERCENT';

// H1 (spec 004). Espejo de `SavingsGoal` en el backend (`savings-goals.service.ts`).
export interface SavingsGoal {
  id: string;
  userId: string;
  period: GoalPeriod;
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavingsGoalInput {
  period: GoalPeriod;
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
}

export interface UpdateSavingsGoalInput {
  targetType?: TargetType;
  targetValue?: string;
  alertThresholdPercent?: string;
}

export function listSavingsGoals(): Promise<SavingsGoal[]> {
  return api.get<SavingsGoal[]>('/savings-goals');
}

export function createSavingsGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal> {
  return api.post<SavingsGoal>('/savings-goals', input);
}

export function updateSavingsGoal(id: string, input: UpdateSavingsGoalInput): Promise<SavingsGoal> {
  return api.patch<SavingsGoal>(`/savings-goals/${id}`, input);
}

export function deleteSavingsGoal(id: string): Promise<void> {
  return api.delete<void>(`/savings-goals/${id}`);
}
