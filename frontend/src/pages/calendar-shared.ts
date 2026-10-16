import Decimal from 'decimal.js';
import type { Transaction } from '../api/transactions';

// Spec 046 (calendario), plan.md. Funciones puras de la página de
// calendario. Sin `Date` local: solo `Date.UTC` para el cálculo de calendario
// (mismo criterio que `lastDayOfMonth` en `home-shared.ts`), así el resultado
// no depende de la zona horaria del entorno.

export interface CalendarCell {
  /** 'YYYY-MM-DD' */
  date: string;
  day: number;
  inMonth: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  // `Date.UTC` normaliza meses/días fuera de rango (mes 0 → dic del año anterior).
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Semanas (lunes a domingo) que cubren el mes 'YYYY-MM', completadas con días de los meses contiguos. */
export function buildMonthGrid(month: string): CalendarCell[][] {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weeks = Math.ceil((firstWeekday + daysInMonth) / 7);

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = w * 7 + d - firstWeekday + 1;
      const date = isoDate(year, monthNumber, day);
      return { date, day: parseInt(date.slice(8), 10), inMonth: day >= 1 && day <= daysInMonth };
    }),
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return isoDate(year, monthNumber + delta, 1).slice(0, 7);
}

export function monthRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  return { dateFrom: `${month}-01`, dateTo: isoDate(year, monthNumber + 1, 0) };
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-08' → 'agosto 2026' */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${MONTH_NAMES[parseInt(monthNumber, 10) - 1]} ${year}`;
}

/** '2026-08-26' → 'miércoles, 26 de agosto' (cálculo del día de la semana vía `Date.UTC`). */
export function longDayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} de ${MONTH_NAMES[month - 1]}`;
}

export function groupByDate<T extends Pick<Transaction, 'date'>>(transactions: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of transactions) {
    const list = map.get(t.date);
    if (list) list.push(t);
    else map.set(t.date, [t]);
  }
  return map;
}

export function monthTotals(transactions: Pick<Transaction, 'type' | 'amount'>[]): {
  income: string;
  expense: string;
  balance: string;
} {
  let income = new Decimal(0);
  let expense = new Decimal(0);
  for (const t of transactions) {
    if (t.type === 'INCOME') income = income.plus(t.amount);
    else expense = expense.plus(t.amount);
  }
  return { income: income.toFixed(2), expense: expense.toFixed(2), balance: income.minus(expense).toFixed(2) };
}
