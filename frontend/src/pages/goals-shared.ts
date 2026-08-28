// Spec 007 (mejoras visuales), plan.md §1. Utilidades de presentación
// compartidas por `GoalsPage` (objetivo de ahorro y presupuestos): traducen
// `progressPercent`/`alertThresholdPercent` (ya calculados por el backend en
// `goals-progress.service.ts`) a un color de 4 niveles, sin ningún cálculo
// financiero nuevo — la fuente de la verdad del progreso sigue siendo el
// backend (`resolveProgressStatus`), esto es puramente visual.

export type VisualLevel = 'ok' | 'near' | 'warning' | 'over';

/**
 * H1 criterio 1 (spec.md). Subdivide visualmente el estado `BELOW_THRESHOLD`
 * del backend con un límite adicional al 90% del umbral de aviso — no es un
 * umbral configurable nuevo (spec.md §4.3), ni se envía ni se guarda en
 * ningún sitio, es solo en qué franja de color cae un valor ya calculado.
 * `parseFloat` (no una librería de precisión decimal) es intencional: no es
 * un cálculo financiero (constitution.md §2), mismo criterio que ya usa
 * `DashboardPage.tsx` para ordenar el gráfico de barras.
 */
export function resolveVisualLevel(progressPercent: string | null, alertThresholdPercent: string): VisualLevel {
  if (progressPercent === null) return 'ok';
  const percent = parseFloat(progressPercent);
  const threshold = parseFloat(alertThresholdPercent);
  if (percent >= 100) return 'over';
  if (percent >= threshold) return 'warning';
  if (percent >= threshold * 0.9) return 'near';
  return 'ok';
}

/**
 * Decisión de plan.md §1: un presupuesto de gasto y un objetivo de ahorro
 * tienen direcciones opuestas (superar un presupuesto es malo; superar un
 * objetivo de ahorro es bueno), así que el mismo `VisualLevel` se pinta con
 * colores opuestos según el tipo — mismo punto de decisión que ya usan
 * `budgetStatusLabel`/`savingsStatusLabel` en `GoalsPage.tsx` para el texto,
 * para que texto y color nunca puedan desincronizarse.
 */
export const BUDGET_RAMP: Record<VisualLevel, string> = { ok: 'green', near: 'amber', warning: 'orange', over: 'red' };
export const SAVINGS_RAMP: Record<VisualLevel, string> = { ok: 'red', near: 'orange', warning: 'amber', over: 'green' };
