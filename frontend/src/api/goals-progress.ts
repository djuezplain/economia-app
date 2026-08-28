import { api } from './client';
import type { TargetType } from './savings-goals';

// H3/H4 (spec 004). Espejo de `GoalProgress`/`BudgetProgress` en el backend
// (`goals-progress.service.ts`).
export type ProgressStatus = 'BELOW_THRESHOLD' | 'NEAR_THRESHOLD' | 'AT_OR_ABOVE_TARGET';

export interface GoalProgress {
  id: string;
  targetType: TargetType;
  targetValue: string;
  alertThresholdPercent: string;
  actualAmount: string;
  targetAmount: string | null;
  deviation: string | null;
  progressPercent: string | null;
  status: ProgressStatus;
  projectedAmount: string | null;
}

export interface BudgetProgress extends GoalProgress {
  categoryId: string | null;
}

export interface MonthProgress {
  month: string;
  savingsGoal: GoalProgress | null;
  expenseBudgets: BudgetProgress[];
}

export interface YearProgress {
  year: number;
  savingsGoal: GoalProgress | null;
}

export function getMonthProgress(month?: string): Promise<MonthProgress> {
  return api.get<MonthProgress>(month ? `/goals-progress/month?month=${month}` : '/goals-progress/month');
}

export function getYearProgress(year?: string): Promise<YearProgress> {
  return api.get<YearProgress>(year ? `/goals-progress/year?year=${year}` : '/goals-progress/year');
}
