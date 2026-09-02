import { describe, expect, it } from 'vitest';
import { buildOfflineListResult, filterCachedTransactions } from './queries';
import type { CachedTransaction } from './db';

function tx(overrides: Partial<CachedTransaction> = {}): CachedTransaction {
  return {
    id: 'tx-1',
    userId: 'user-1',
    type: 'EXPENSE',
    date: '2026-08-01',
    categoryId: 'cat-1',
    subcategoryId: null,
    concept: 'Café',
    merchant: 'Bar Manolo',
    amount: '3.50',
    paymentMethod: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    pending: false,
    pendingAction: null,
    ...overrides,
  };
}

describe('filterCachedTransactions (T3.3)', () => {
  const all = [
    tx({ id: 'tx-1', type: 'EXPENSE', date: '2026-08-01', categoryId: 'cat-1', merchant: 'Bar Manolo', concept: 'Café' }),
    tx({ id: 'tx-2', type: 'INCOME', date: '2026-08-05', categoryId: 'cat-2', merchant: null, concept: 'Nómina' }),
    tx({ id: 'tx-3', type: 'EXPENSE', date: '2026-07-15', categoryId: 'cat-1', merchant: 'Repsol', concept: 'Gasolina' }),
  ];

  it('sin filtros, devuelve todo ordenado por fecha descendente', () => {
    const result = filterCachedTransactions(all, {});
    expect(result.map((t) => t.id)).toEqual(['tx-2', 'tx-1', 'tx-3']);
  });

  it('filtra por type', () => {
    expect(filterCachedTransactions(all, { type: 'INCOME' }).map((t) => t.id)).toEqual(['tx-2']);
  });

  it('filtra por rango de fechas (inclusivo)', () => {
    expect(filterCachedTransactions(all, { dateFrom: '2026-08-01', dateTo: '2026-08-31' }).map((t) => t.id)).toEqual([
      'tx-2',
      'tx-1',
    ]);
  });

  it('filtra por categoryId', () => {
    expect(filterCachedTransactions(all, { categoryId: 'cat-1' }).map((t) => t.id).sort()).toEqual(['tx-1', 'tx-3']);
  });

  it('filtra por merchant, sin distinguir mayúsculas/minúsculas, como substring', () => {
    expect(filterCachedTransactions(all, { merchant: 'manolo' }).map((t) => t.id)).toEqual(['tx-1']);
  });

  it('filtra por q sobre el concepto, sin distinguir mayúsculas/minúsculas', () => {
    expect(filterCachedTransactions(all, { q: 'GASOLINA' }).map((t) => t.id)).toEqual(['tx-3']);
  });

  it('un movimiento sin merchant nunca coincide con un filtro de merchant', () => {
    expect(filterCachedTransactions(all, { merchant: 'a' }).map((t) => t.id)).not.toContain('tx-2');
  });
});

describe('buildOfflineListResult (T3.3)', () => {
  it('calcula items, totalItems y el mismo resumen que el backend', () => {
    const all = [
      tx({ id: 'tx-1', type: 'EXPENSE', date: '2026-08-01', categoryId: 'cat-1', subcategoryId: null, amount: '10.00' }),
      tx({ id: 'tx-2', type: 'EXPENSE', date: '2026-08-05', categoryId: 'cat-1', subcategoryId: 'sub-1', amount: '5.00' }),
    ];

    const result = buildOfflineListResult(all, { type: 'EXPENSE' });

    expect(result.items.map((t) => t.id)).toEqual(['tx-2', 'tx-1']);
    expect(result.totalItems).toBe(2);
    expect(result.page).toBe(1);
    expect(result.summary.total).toBe('15.00');
    expect(result.summary.byCategory).toContainEqual({ categoryId: 'cat-1', total: '15.00' });
    expect(result.summary.bySubcategory).toContainEqual({ subcategoryId: 'sub-1', total: '5.00' });
  });

  it('con el conjunto filtrado vacío, summary.total es "0.00" y averagePerMonth null', () => {
    const result = buildOfflineListResult([], { type: 'INCOME' });
    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.summary.total).toBe('0.00');
    expect(result.summary.averagePerMonth).toBeNull();
  });

  it('respeta page/limit para paginar', () => {
    const all = [tx({ id: 'tx-1', date: '2026-08-01' }), tx({ id: 'tx-2', date: '2026-08-02' }), tx({ id: 'tx-3', date: '2026-08-03' })];
    const result = buildOfflineListResult(all, { page: 2, limit: 2 });
    expect(result.items.map((t) => t.id)).toEqual(['tx-1']);
    expect(result.totalItems).toBe(3);
  });
});
