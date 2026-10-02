import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

/**
 * Spec 045 (rediseño oscuro), plan.md §5. Mini-gráfico de tendencia de las
 * tarjetas KPI de Inicio, como los de la captura de referencia: solo la
 * línea con un degradado debajo, sin ejes, rejilla ni tooltip. Decorativo
 * (`aria-hidden`): la cifra y la variación ya están en texto en la tarjeta.
 */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  // `useId` puede contener ':' — no vale tal cual dentro de `url(#...)`.
  const gradientId = `sparkline-${useId().replace(/:/g, '')}`;
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div className="sparkline" aria-hidden="true">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
