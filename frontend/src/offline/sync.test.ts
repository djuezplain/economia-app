import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { ListTransactionsResult, Transaction } from '../api/transactions';
import type { Category } from '../api/categories';
import { syncFullHistory, LAST_FULL_SYNC_AT_KEY } from './sync';
import { getAllCachedCategories, getAllCachedTransactions, getMeta } from './db';

function tx(id: string): Transaction {
  return {
    id,
    userId: 'user-1',
    type: 'EXPENSE',
    date: '2026-08-01',
    categoryId: 'cat-1',
    subcategoryId: null,
    concept: `Movimiento ${id}`,
    merchant: null,
    amount: '10.00',
    paymentMethod: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function page(items: Transaction[], pageNum: number, totalItems: number): ListTransactionsResult {
  return {
    items,
    page: pageNum,
    limit: 200,
    totalItems,
    summary: { total: '0', averagePerMonth: null, byCategory: [], bySubcategory: [] },
  };
}

const CATEGORY: Category = {
  id: 'cat-1',
  userId: 'user-1',
  type: 'EXPENSE',
  name: 'Comida',
  parentId: null,
  isDefault: false,
  createdAt: '2026-08-01T00:00:00.000Z',
};

// `setupTests.ts` resetea `indexedDB`/`offline/db.ts` antes de cada test.
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('syncFullHistory (T3.1)', () => {
  it('pagina hasta agotar el histórico y vuelca todo en la caché', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce(page([tx('tx-1'), tx('tx-2')], 1, 3))
      .mockResolvedValueOnce(page([tx('tx-3')], 2, 3))
      .mockResolvedValueOnce([CATEGORY]);

    await syncFullHistory();

    expect(getSpy).toHaveBeenCalledTimes(3);
    expect(getSpy).toHaveBeenNthCalledWith(1, '/transactions?page=1&limit=200');
    expect(getSpy).toHaveBeenNthCalledWith(2, '/transactions?page=2&limit=200');
    expect(getSpy).toHaveBeenNthCalledWith(3, '/categories');

    const cachedTx = await getAllCachedTransactions();
    expect(cachedTx.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-2', 'tx-3']);
    expect(cachedTx.every((t) => t.pending === false && t.pendingAction === null)).toBe(true);

    const cachedCategories = await getAllCachedCategories();
    expect(cachedCategories.map((c) => c.id)).toEqual(['cat-1']);

    expect(await getMeta(LAST_FULL_SYNC_AT_KEY)).toBeDefined();
  });

  it('se detiene al recibir una página vacía, sin seguir pidiendo páginas de más', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(page([], 1, 0)).mockResolvedValueOnce([]);

    await syncFullHistory();

    expect(getSpy).toHaveBeenCalledTimes(2); // 1 página de movimientos (vacía) + categorías
    expect(await getAllCachedTransactions()).toEqual([]);
  });

  it('un histórico de una sola página no pide una segunda', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(page([tx('tx-1')], 1, 1)).mockResolvedValueOnce([]);

    await syncFullHistory();

    expect(getSpy).toHaveBeenCalledTimes(2); // 1 página de movimientos + categorías
  });

  it('si falla la petición (p. ej. sin conexión), no actualiza `lastFullSyncAt`', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(syncFullHistory()).rejects.toThrow();
    expect(await getMeta(LAST_FULL_SYNC_AT_KEY)).toBeUndefined();
  });
});
