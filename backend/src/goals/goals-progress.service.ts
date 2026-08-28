import { Injectable } from '@nestjs/common';
import { currentMonthIso, daysInMonth, daysInYear, resolveDaysForMonth, resolveDaysForYear } from '../dashboard/dashboard.calculations.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import {
  computeDeviation,
  computeProgressPercent,
  projectAmount,
  resolveProgressStatus,
  resolveTargetAmount,
} from './goals-progress.calculations.js';
import { SavingsGoalsService } from './savings-goals.service.js';
import type { SavingsGoal } from './savings-goals.service.js';
import { ExpenseBudgetsService } from './expense-budgets.service.js';
import type { ExpenseBudget } from './expense-budgets.service.js';

export interface GoalProgress {
  id: string;
  targetType: 'AMOUNT' | 'PERCENT';
  targetValue: string;
  alertThresholdPercent: string;
  actualAmount: string;
  targetAmount: string | null;
  deviation: string | null;
  progressPercent: string | null;
  status: 'BELOW_THRESHOLD' | 'NEAR_THRESHOLD' | 'AT_OR_ABOVE_TARGET';
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

/**
 * H3/H4 (spec 004). Combina los objetivos/presupuestos del usuario con
 * `DashboardService.month()`/`.year()` (plan.md §3: reutilización
 * deliberada, mismos números que ya muestra el dashboard — no una segunda
 * fuente de verdad) y las funciones puras de `goals-progress.calculations.ts`.
 * Sin acceso directo a `DB`: todo el dato viene de los otros tres servicios.
 */
@Injectable()
export class GoalsProgressService {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly savingsGoals: SavingsGoalsService,
    private readonly expenseBudgets: ExpenseBudgetsService,
  ) {}

  async month(userId: string, monthParam: string | undefined, now: Date = new Date()): Promise<MonthProgress> {
    const month = monthParam ?? currentMonthIso(now);
    const isCurrentMonth = month === currentMonthIso(now);
    const daysElapsed = resolveDaysForMonth(month, now);
    const daysInPeriod = daysInMonth(month);

    const summary = await this.dashboard.month(userId, month, now);
    const goals = await this.savingsGoals.list(userId);
    const monthlyGoal = goals.find((goal) => goal.period === 'MONTHLY') ?? null;

    const savingsGoal = monthlyGoal
      ? this.resolveGoalProgress(monthlyGoal, summary.savings, summary.income, isCurrentMonth, daysElapsed, daysInPeriod)
      : null;

    const budgets = await this.expenseBudgets.list(userId);
    const expenseBudgetsProgress = budgets.map((budget) => {
      const actualAmount = budget.categoryId
        ? (summary.byCategory.find((entry) => entry.categoryId === budget.categoryId)?.total ?? '0.00')
        : summary.expense;
      return {
        ...this.resolveGoalProgress(budget, actualAmount, summary.income, isCurrentMonth, daysElapsed, daysInPeriod),
        categoryId: budget.categoryId,
      };
    });

    return { month, savingsGoal, expenseBudgets: expenseBudgetsProgress };
  }

  async year(userId: string, yearParam: string | undefined, now: Date = new Date()): Promise<YearProgress> {
    const year = yearParam ? Number(yearParam) : now.getFullYear();
    const isCurrentYear = year === now.getFullYear();
    const daysElapsed = resolveDaysForYear(year, now);
    const daysInPeriod = daysInYear(year);

    const summary = await this.dashboard.year(userId, String(year), now);
    const goals = await this.savingsGoals.list(userId);
    const annualGoal = goals.find((goal) => goal.period === 'ANNUAL') ?? null;

    const savingsGoal = annualGoal
      ? this.resolveGoalProgress(
          annualGoal,
          summary.totals.savings,
          summary.totals.income,
          isCurrentYear,
          daysElapsed,
          daysInPeriod,
        )
      : null;

    return { year, savingsGoal };
  }

  private resolveGoalProgress(
    goal: Pick<SavingsGoal | ExpenseBudget, 'id' | 'targetType' | 'targetValue' | 'alertThresholdPercent'>,
    actualAmount: string,
    incomeForPeriod: string,
    isCurrentPeriod: boolean,
    daysElapsed: number,
    daysInPeriod: number,
  ): GoalProgress {
    const targetAmount = resolveTargetAmount(goal.targetType, goal.targetValue, incomeForPeriod);
    const progressPercent = computeProgressPercent(actualAmount, targetAmount);
    return {
      id: goal.id,
      targetType: goal.targetType,
      targetValue: goal.targetValue,
      alertThresholdPercent: goal.alertThresholdPercent,
      actualAmount,
      targetAmount,
      deviation: computeDeviation(actualAmount, targetAmount),
      progressPercent,
      status: resolveProgressStatus(progressPercent, goal.alertThresholdPercent),
      // H3 criterio 3 / plan.md §6: un periodo ya cerrado no proyecta —
      // `null` explícito, no se llama a `projectAmount` (que con
      // daysElapsed === daysInPeriod devolvería el mismo importe real,
      // escondiendo que no hay proyección). Sin `targetAmount` calculable
      // (PERCENT con ingresos 0 en el periodo) tampoco se proyecta: no hay
      // nada con lo que comparar la proyección — mismo criterio que
      // `resolveProgressStatus` trata `progressPercent: null`.
      projectedAmount: isCurrentPeriod && targetAmount !== null ? projectAmount(actualAmount, daysElapsed, daysInPeriod) : null,
    };
  }
}
