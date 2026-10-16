/**
 * Spec 045 (rediseño oscuro), plan.md §4. Estilo común de todos los
 * gráficos de Recharts de la app, tomado de la captura de referencia:
 * rejilla solo horizontal y muy tenue, sin líneas de eje, etiquetas en gris
 * pequeño, tooltip oscuro con borde fino, líneas sin puntos y barras con las
 * esquinas superiores redondeadas. Sustituye a las copias locales de
 * `CHART_TICK_STYLE`/`CHART_TOOLTIP_STYLE` que tenía cada página.
 *
 * Se usan por propagación (`<XAxis {...CHART_AXIS_PROPS} />`), así cada
 * gráfico sigue declarando solo lo suyo (`dataKey`, `tickFormatter`...).
 */

export const CHART_GRID_PROPS = {
  vertical: false,
  stroke: 'var(--chart-grid)',
} as const;

export const CHART_AXIS_PROPS = {
  tick: { fontFamily: 'var(--font-body)', fontSize: 11, fill: 'var(--text-muted)' },
  axisLine: false,
  tickLine: false,
} as const;

export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    fontFamily: 'var(--font-body)',
    fontSize: 12,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-md)',
    color: 'var(--text-h)',
  },
  labelStyle: { color: 'var(--text-muted)', marginBottom: 4 },
  itemStyle: { color: 'var(--text-h)', padding: 0 },
  cursor: { fill: 'color-mix(in srgb, var(--text-h) 5%, transparent)', stroke: 'var(--border)' },
} as const;

export const CHART_LEGEND_PROPS = {
  iconType: 'circle',
  iconSize: 8,
  wrapperStyle: { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', paddingTop: 8 },
} as const;

export const CHART_LINE_PROPS = {
  type: 'monotone',
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4, strokeWidth: 0 },
} as const;

/** Esquinas superiores redondeadas (barras verticales). */
export const CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** Paleta común de series, en orden fijo (se asigna por posición). */
export const CHART_SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;
