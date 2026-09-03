import { api } from './client';

// H4/H5 (spec 002). Espejo de `MonthSummary`/`YearSummary` en el backend
// (`dashboard.service.ts`).
export interface MonthSummary {
  month: string;
  income: string;
  expense: string;
  savings: string;
  savingsPercent: string | null;
  byCategory: Array<{ categoryId: string; total: string }>;
  dailyAverages: { income: string; expense: string; savings: string };
}

export interface MonthlyEvolutionEntry {
  month: string;
  income: string;
  expense: string;
  savings: string;
}

export interface YearSummary {
  year: number;
  months: MonthlyEvolutionEntry[];
  totals: { income: string; expense: string; savings: string; savingsPercent: string | null };
}

export function getMonthSummary(month?: string): Promise<MonthSummary> {
  return api.get<MonthSummary>(month ? `/dashboard/month?month=${month}` : '/dashboard/month');
}

export function getYearSummary(year?: string): Promise<YearSummary> {
  return api.get<YearSummary>(year ? `/dashboard/year?year=${year}` : '/dashboard/year');
}

// Spec 013 (comparativa temporal). Espejo de `ComparisonSummary` en el backend.
export type ComparisonPeriod = 'week' | 'month' | 'quarter' | 'year';

export interface ComparisonMetrics {
  count: number;
  total: string;
  averagePerDay: string;
}

export interface ComparisonSummary {
  period: ComparisonPeriod;
  type: 'INCOME' | 'EXPENSE';
  days: number;
  currentLabel: string;
  previousLabel: string;
  current: ComparisonMetrics;
  previous: ComparisonMetrics;
  changes: { count: string | null; total: string | null; averagePerDay: string | null };
}

export function getComparison(period: ComparisonPeriod, type: 'INCOME' | 'EXPENSE'): Promise<ComparisonSummary> {
  return api.get<ComparisonSummary>(`/dashboard/comparison?period=${period}&type=${type}`);
}
