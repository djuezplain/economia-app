import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { transactions } from '../db/schema/index.js';
import { average, groupByCategory, sumByType } from '../transactions/transactions.calculations.js';
import { monthlyEvolution, resolveDaysForMonth, savingsAmount, savingsPercent } from './dashboard.calculations.js';
import type { MonthlyEvolutionEntry } from './dashboard.calculations.js';

export interface MonthSummary {
  month: string;
  income: string;
  expense: string;
  savings: string;
  savingsPercent: string | null;
  byCategory: Array<{ categoryId: string; total: string }>;
  dailyAverages: { income: string; expense: string; savings: string };
}

export interface YearSummary {
  year: number;
  months: MonthlyEvolutionEntry[];
  totals: { income: string; expense: string; savings: string; savingsPercent: string | null };
}

function currentMonthIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * H4/H5 (spec 002). Consulta `transactions` directamente vía `DB`, igual
 * que `TransactionsService` — no a través de él. `TransactionsService.list()`
 * está pensado para el listado paginado de la UI (H1/H2) y su `summary`
 * suma ingresos y gastos en un único total; el dashboard necesita el
 * conjunto completo de movimientos de un periodo, desglosado por tipo y
 * agrupado por mes, así que construye su propia consulta y reutiliza las
 * mismas funciones puras de `transactions.calculations.ts` en vez de pasar
 * por esa capa. (Ajuste sobre el comentario original de `transactions.
 * module.ts`, que anticipaba que el dashboard reutilizaría el servicio
 * directamente — ver la nota de ese fichero.)
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async month(userId: string, monthParam: string | undefined, now: Date = new Date()): Promise<MonthSummary> {
    const month = monthParam ?? currentMonthIso(now);
    const { start, end } = monthRange(month);

    const items = await this.db.query.transactions.findMany({
      where: and(eq(transactions.userId, userId), gte(transactions.date, start), lte(transactions.date, end)),
    });

    const income = sumByType(items, 'INCOME');
    const expense = sumByType(items, 'EXPENSE');
    const savings = savingsAmount(income, expense);
    const days = resolveDaysForMonth(month, now);

    return {
      month,
      income,
      expense,
      savings,
      savingsPercent: savingsPercent(income, expense),
      byCategory: groupByCategory(items.filter((t) => t.type === 'EXPENSE')),
      dailyAverages: {
        income: average(income, days),
        expense: average(expense, days),
        savings: average(savings, days),
      },
    };
  }

  async year(userId: string, yearParam: string | undefined, now: Date = new Date()): Promise<YearSummary> {
    const year = yearParam ? Number(yearParam) : now.getFullYear();

    const items = await this.db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, userId),
        gte(transactions.date, `${year}-01-01`),
        lte(transactions.date, `${year}-12-31`),
      ),
    });

    const income = sumByType(items, 'INCOME');
    const expense = sumByType(items, 'EXPENSE');

    return {
      year,
      months: monthlyEvolution(items, year),
      totals: {
        income,
        expense,
        savings: savingsAmount(income, expense),
        savingsPercent: savingsPercent(income, expense),
      },
    };
  }
}
