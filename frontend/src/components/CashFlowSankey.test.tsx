import { describe, expect, it } from 'vitest';
import { buildCashFlowGraph } from './cash-flow-graph';

describe('buildCashFlowGraph', () => {
  it('reparte ingresos entre gastos y ahorro, y gastos entre categorías', () => {
    const graph = buildCashFlowGraph(5000, 3000, 2000, [
      { name: 'Vivienda', total: 2000 },
      { name: 'Comida', total: 1000 },
    ]);

    expect(graph.nodes.map((node) => node.name)).toEqual(['Gastos', 'Ingresos', 'Ahorro', 'Vivienda', 'Comida']);

    const byTarget = (name: string) => graph.links.filter((link) => graph.nodes[link.target].name === name);
    expect(byTarget('Gastos')[0]).toMatchObject({ value: 3000 });
    expect(byTarget('Ahorro')[0]).toMatchObject({ value: 2000 });
    expect(byTarget('Vivienda')[0]).toMatchObject({ value: 2000 });
    expect(byTarget('Comida')[0]).toMatchObject({ value: 1000 });
  });

  it('añade "Otros" con el gasto que no está desglosado por categoría', () => {
    const graph = buildCashFlowGraph(1000, 800, 200, [{ name: 'Comida', total: 500 }]);

    const other = graph.links.find((link) => graph.nodes[link.target].name === 'Otros');
    expect(other).toMatchObject({ value: 300 });
  });

  it('cubre el déficit con un nodo propio para que los gastos cuadren', () => {
    const graph = buildCashFlowGraph(1000, 1500, -500, [{ name: 'Comida', total: 1500 }]);

    expect(graph.nodes.map((node) => node.name)).toContain('Déficit');
    const deficit = graph.links.find((link) => graph.nodes[link.source].name === 'Déficit');
    const income = graph.links.find((link) => graph.nodes[link.source].name === 'Ingresos');
    expect(deficit).toMatchObject({ value: 500 });
    expect(income).toMatchObject({ value: 1000 });
  });
});
