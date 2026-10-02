import Decimal from 'decimal.js';

// Spec 008 (rediseño Broadsheet), plan.md §3. Ningún otro sitio de la app
// formatea moneda hoy (DashboardPage/GoalsPage muestran los importes tal
// cual llegan del backend, p. ej. "648.20"); este helper solo lo usa
// HomePage, para igualar el mockup ("648,20 €"). Fijo a es-ES/EUR — no lee
// `currency`/`locale` del perfil del usuario (spec 001): toda la interfaz ya
// es fija en español, y `useAuth().user` no expone esos campos (son de
// `UserProfile`, un fetch aparte que HomePage no hace hoy).
const CURRENCY_FORMATTER = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function formatCurrency(amount: string): string {
  return CURRENCY_FORMATTER.format(parseFloat(amount));
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-08-26' → '26 ago'. Manipulación de texto pura, sin pasar por
 *  `Date` (evitaría desplazamientos de zona horaria al formatear una fecha
 *  sin hora, como las de un movimiento) — mismo criterio que `lastDayOfMonth`. */
export function formatDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${parseInt(day, 10)} ${SHORT_MONTHS[parseInt(month, 10) - 1]}`;
}

/** Último día de un mes 'YYYY-MM' (28/29 en febrero, 30 o 31 el resto).
 *  Usa `Date.UTC` solo para el cálculo de calendario (día 0 del mes
 *  siguiente = último día de este mes), nunca para mostrar una fecha, así
 *  que no depende de la zona horaria del entorno. */
export function lastDayOfMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/**
 * Spec 045 (rediseño oscuro), H3. Variación porcentual de un importe
 * respecto al mes anterior, redondeada a 1 decimal, para las tarjetas KPI de
 * Inicio. `null` si no hay mes anterior o vale 0 (no hay base con la que
 * comparar). Se divide entre el valor absoluto del mes anterior para que el
 * signo indique siempre si el importe ha subido o bajado, también cuando la
 * base es negativa (un balance mensual puede serlo).
 */
export function monthOverMonthChange(current: string, previous: string | undefined): number | null {
  if (previous === undefined) return null;
  const base = new Decimal(previous);
  if (base.isZero()) return null;
  return new Decimal(current).minus(base).div(base.abs()).times(100).toDecimalPlaces(1).toNumber();
}
