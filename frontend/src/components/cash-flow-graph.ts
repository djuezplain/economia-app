// Grafo del diagrama de flujo de caja (ver CashFlowSankey.tsx). Separado del
// componente para que el fichero de componente solo exporte componentes.
import { CHART_SERIES_COLORS } from './chart-theme';

const COLOR_INCOME = 'var(--status-green)';
const COLOR_EXPENSE = 'var(--status-red)';
const COLOR_SAVINGS = 'var(--accent-2)';
const COLOR_DEFICIT = 'var(--status-red)';
export const COLOR_OTHER = 'var(--text-muted)';

// Columnas del diagrama: 0 = origen (ingresos/déficit), 1 = gastos y ahorro,
// 2 = categorías de gasto. Recharts calcula la columna por la topología de
// los enlaces; aquí la guardamos para decidir dónde va la etiqueta.
export const LAST_COLUMN = 2;

export interface CashFlowCategory {
  name: string;
  total: number;
}

interface GraphNode {
  name: string;
  color: string;
  depth: number;
}

interface GraphLink {
  source: number;
  target: number;
  value: number;
  color: string;
}

export interface CashFlowGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

/**
 * Construye el grafo del Sankey a partir de los totales del mes.
 * Invariante: lo que entra en "Gastos" (ingresos o déficit) iguala lo que sale
 * hacia las categorías, y el ahorro sale de los ingresos.
 */
export function buildCashFlowGraph(
  income: number,
  expense: number,
  savings: number,
  categories: CashFlowCategory[],
): CashFlowGraph {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  const addNode = (name: string, color: string, depth: number): number => {
    nodes.push({ name, color, depth });
    return nodes.length - 1;
  };

  const expenseIdx = addNode('Gastos', COLOR_EXPENSE, 1);

  if (savings >= 0) {
    const incomeIdx = addNode('Ingresos', COLOR_INCOME, 0);
    if (expense > 0) links.push({ source: incomeIdx, target: expenseIdx, value: expense, color: COLOR_EXPENSE });
    if (savings > 0) {
      const savingsIdx = addNode('Ahorro', COLOR_SAVINGS, 1);
      links.push({ source: incomeIdx, target: savingsIdx, value: savings, color: COLOR_SAVINGS });
    }
  } else {
    // Mes en déficit: los gastos se cubren con ingresos y con un déficit.
    const incomeIdx = addNode('Ingresos', COLOR_INCOME, 0);
    if (income > 0) links.push({ source: incomeIdx, target: expenseIdx, value: income, color: COLOR_INCOME });
    const deficitIdx = addNode('Déficit', COLOR_DEFICIT, 0);
    links.push({ source: deficitIdx, target: expenseIdx, value: -savings, color: COLOR_DEFICIT });
  }

  let assigned = 0;
  categories
    .filter((category) => category.total > 0)
    .forEach((category, index) => {
      const color = CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
      const categoryIdx = addNode(category.name, color, LAST_COLUMN);
      links.push({ source: expenseIdx, target: categoryIdx, value: category.total, color });
      assigned += category.total;
    });

  // Gasto sin categoría que el desglose no recoge: se muestra como "Otros"
  // para que la suma de categorías cuadre con el total de gastos.
  const rest = expense - assigned;
  if (rest > 0.005) {
    const otherIdx = addNode('Otros', COLOR_OTHER, LAST_COLUMN);
    links.push({ source: expenseIdx, target: otherIdx, value: rest, color: COLOR_OTHER });
  }

  return { nodes, links };
}
