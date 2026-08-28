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
