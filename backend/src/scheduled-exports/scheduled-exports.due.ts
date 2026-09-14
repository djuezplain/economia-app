export interface ScheduledExportDueInput {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string; // "HH:mm"
  lastRunAt: Date | null;
}

function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Spec 032 H5, plan.md §11.3. "Debido" = ya ha pasado la hora programada de
 * hoy Y no se ha ejecutado todavía hoy. No exige coincidencia exacta de
 * minuto: un barrido cada 15 minutos es suficiente, y si el proceso estuvo
 * caído justo a la hora programada, se recupera sola en el siguiente
 * barrido en vez de saltarse el día.
 *
 * Nota de implementación (desviación de plan.md §11.3, que describía
 * "misma semana ISO"/"mismo mes+año" como comprobaciones separadas para
 * WEEKLY/MONTHLY): no hacen falta — `frequency === 'WEEKLY'` ya exige que
 * `now` caiga exactamente en `dayOfWeek` (ese día de la semana ocurre una
 * única vez cada 7 días) y `frequency === 'MONTHLY'` ya exige que `now`
 * caiga exactamente en `dayOfMonth` (ocurre una única vez al mes, para
 * 1-28). Con eso ya acotado, "¿ya se ejecutó *hoy*?" es exactamente
 * equivalente a "¿ya se ejecutó en esta ocurrencia semanal/mensual?" — una
 * única comparación de fecha sirve para las 3 periodicidades, sin
 * necesitar cálculo de semana ISO ni de mes/año por separado.
 */
export function isDue(config: ScheduledExportDueInput, now: Date): boolean {
  if (formatHHmm(now) < config.timeOfDay) return false;
  if (config.frequency === 'WEEKLY' && now.getDay() !== config.dayOfWeek) return false;
  if (config.frequency === 'MONTHLY' && now.getDate() !== config.dayOfMonth) return false;
  if (!config.lastRunAt) return true;
  return !isSameLocalDate(config.lastRunAt, now);
}
