import { Decimal } from 'decimal.js';
import { sumByType } from '../transactions/transactions.calculations.js';
import type { MovementType } from '../transactions/transactions.calculations.js';

export interface MonthlyEvolutionEntry {
  month: string; // 'YYYY-MM'
  income: string;
  expense: string;
  savings: string;
}

/**
 * H4/H5 (spec 002), plan.md §4. Funciones puras de cálculo del dashboard —
 * complementan a `transactions/transactions.calculations.ts` (`sumByType`,
 * `average`, `groupByCategory`, creadas en el grupo 2 y reutilizadas aquí
 * sin duplicar) en vez de vivir todas juntas en un único fichero, ya que
 * ese fichero nació antes de que existiera este módulo — ver su cabecera.
 */

/** Ahorro en importe (ingresos − gastos) de un periodo. Puede ser negativo. */
export function savingsAmount(income: string, expense: string): string {
  return new Decimal(income).minus(expense).toFixed(2);
}

/**
 * % de ahorro = (ingresos − gastos) / ingresos, expresado en puntos
 * porcentuales (25.00 = 25%). `null` si `income` es 0 (spec.md §4: "sin
 * datos", ni división por cero ni un 0% engañoso).
 */
export function savingsPercent(income: string, expense: string): string | null {
  const incomeDecimal = new Decimal(income);
  if (incomeDecimal.isZero()) return null;
  return incomeDecimal.minus(expense).dividedBy(incomeDecimal).times(100).toFixed(2);
}

/**
 * Días a usar en las medias diarias de un mes (plan.md §4): si `month`
 * coincide con el mes de `now`, los días transcurridos (1..hoy) — dividir
 * por el mes completo infravaloraría la media mientras el mes no ha
 * terminado. Si no coincide (mes cerrado, o uno futuro), los días totales
 * de ese mes. `now` se recibe como parámetro (no `new Date()` interno) para
 * que la función siga siendo pura y comprobable sin simular el reloj del
 * sistema.
 */
export function resolveDaysForMonth(month: string, now: Date): number {
  const [year, monthNum] = month.split('-').map(Number);
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (month === nowMonth) return now.getDate();
  return new Date(year, monthNum, 0).getDate();
}

/**
 * Evolución mensual (H5 criterio 1): una entrada por cada uno de los 12
 * meses del año indicado, con "0.00" en los meses sin movimientos — nunca
 * se omite un mes de la lista.
 */
export function monthlyEvolution(
  transactions: Array<{ type: MovementType; date: string; amount: string }>,
  year: number,
): MonthlyEvolutionEntry[] {
  const entries: MonthlyEvolutionEntry[] = [];
  for (let month = 1; month <= 12; month++) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthTransactions = transactions.filter((t) => t.date.slice(0, 7) === monthKey);
    const income = sumByType(monthTransactions, 'INCOME');
    const expense = sumByType(monthTransactions, 'EXPENSE');
    entries.push({ month: monthKey, income, expense, savings: savingsAmount(income, expense) });
  }
  return entries;
}
