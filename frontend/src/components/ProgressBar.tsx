import { BUDGET_RAMP, SAVINGS_RAMP } from '../pages/goals-shared';
import type { VisualLevel } from '../pages/goals-shared';

interface ProgressBarProps {
  /** Null cuando no hay datos suficientes para calcular un % (mismo caso que `progressPercent: null` en la API). */
  percent: number | null;
  level: VisualLevel;
  /** H1 (plan.md §1): un presupuesto y un objetivo de ahorro pintan el mismo `level` con colores opuestos. */
  direction: 'budget' | 'savings';
  /** Nombre accesible completo, p. ej. "Transporte: 120% del presupuesto, superado". */
  label: string;
}

/**
 * H3 (spec 007), componente nuevo — plan.md §2. Primer uso de `className`
 * en el proyecto (documentado ahí): el resto de la app usa `id` porque cada
 * elemento con estilo propio es único por página; `ProgressBar` se
 * instancia varias veces en la misma página (un objetivo mensual, uno
 * anual, uno por presupuesto), así que necesita poder repetirse.
 */
export function ProgressBar({ percent, level, direction, label }: ProgressBarProps) {
  const clamped = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const color = (direction === 'budget' ? BUDGET_RAMP : SAVINGS_RAMP)[level];
  const isOverflowing = percent !== null && percent > 100;

  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={percent ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress-bar-fill" style={{ width: `${clamped}%`, background: `var(--status-${color})` }} />
      {isOverflowing && (
        <span className="progress-bar-overflow" aria-hidden="true">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
