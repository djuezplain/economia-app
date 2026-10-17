// Diagrama de flujo de caja del mes (ingresos → gastos por categoría y
// ahorro). Los colores de ingresos/gastos/ahorro siguen la misma semántica
// que el resto del dashboard (spec 045).
import { useMemo } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { SankeyLinkProps, SankeyNodeProps } from 'recharts';
import { formatCurrency } from '../pages/home-shared';
import { CHART_TOOLTIP_PROPS } from './chart-theme';
import { buildCashFlowGraph, COLOR_OTHER, LAST_COLUMN } from './cash-flow-graph';
import type { CashFlowCategory, CashFlowGraph } from './cash-flow-graph';

function renderNode(graph: CashFlowGraph) {
  return function NodeShape({ x, y, width, height, payload, index }: SankeyNodeProps) {
    const node = graph.nodes[index];
    const isLastColumn = node?.depth === LAST_COLUMN;
    const labelX = isLastColumn ? x + width + 8 : x - 8;
    const anchor = isLastColumn ? 'start' : 'end';
    const middle = y + height / 2;

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={2} fill={node?.color} />
        <text x={labelX} y={middle - 2} textAnchor={anchor} fontSize={11} fill="var(--text-muted)">
          {payload.name}
        </text>
        <text x={labelX} y={middle + 12} textAnchor={anchor} fontSize={12} fontWeight={600} fill="var(--text-h)">
          {formatCurrency(Number(payload.value).toFixed(2))}
        </text>
      </g>
    );
  };
}

function renderLink(graph: CashFlowGraph) {
  return function LinkShape(props: SankeyLinkProps) {
    const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, index } = props;
    const color = graph.links[index]?.color ?? COLOR_OTHER;
    const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;

    return <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={linkWidth} />;
  };
}

interface CashFlowSankeyProps {
  income: number;
  expense: number;
  savings: number;
  categories: CashFlowCategory[];
}

export function CashFlowSankey({ income, expense, savings, categories }: CashFlowSankeyProps) {
  const graph = useMemo(
    () => buildCashFlowGraph(income, expense, savings, categories),
    [income, expense, savings, categories],
  );

  // Las etiquetas de categoría son de dos líneas: cada una necesita altura
  // propia o se solapan cuando hay muchas categorías pequeñas.
  const categoryCount = graph.nodes.filter((node) => node.depth === LAST_COLUMN).length;
  const height = Math.max(360, categoryCount * 48);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <Sankey
          data={{
            nodes: graph.nodes.map((node) => ({ name: node.name })),
            links: graph.links.map((link) => ({ source: link.source, target: link.target, value: link.value })),
          }}
          nodeWidth={8}
          nodePadding={30}
          margin={{ top: 8, right: 130, bottom: 28, left: 130 }}
          node={renderNode(graph)}
          link={renderLink(graph)}
        >
          <Tooltip {...CHART_TOOLTIP_PROPS} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
