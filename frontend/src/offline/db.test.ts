import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAll,
  deleteCachedTransaction,
  enqueue,
  ensureUserScope,
  getAllCachedCategories,
  getAllCachedTransactions,
  getCachedTransaction,
  getMeta,
  getQueue,
  getQueueForTransaction,
  putCategories,
  putTransaction,
  putTransactions,
  removeQueueEntry,
  resetDBConnection,
  setMeta,
  updateQueueEntry,
} from './db';
import type { CachedTransaction, NewSyncQueueEntry } from './db';
import type { Category } from '../api/categories';

function cachedTx(overrides: Partial<CachedTransaction> = {}): CachedTransaction {
  return {
    id: 'tx-1',
    userId: 'user-1',
    type: 'EXPENSE',
    date: '2026-08-01',
    categoryId: 'cat-1',
    subcategoryId: null,
    concept: 'Café',
    merchant: null,
    amount: '3.50',
    paymentMethod: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    pending: false,
    pendingAction: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    userId: 'user-1',
    type: 'EXPENSE',
    name: 'Comida',
    parentId: null,
    isDefault: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function queueEntry(overrides: Partial<NewSyncQueueEntry> = {}): NewSyncQueueEntry {
  return {
    entity: 'transaction',
    action: 'CREATE',
    transactionId: 'tx-1',
    payload: { concept: 'Café' },
    createdAt: '2026-08-01T00:00:00.000Z',
    status: 'pending',
    failureReason: null,
    failureKind: null,
    ...overrides,
  };
}

// Cada test necesita una base de datos limpia: `fake-indexeddb` persiste
// dentro del proceso de test, no entre ficheros reales de navegador.
beforeEach(async () => {
  indexedDB = new IDBFactory();
  resetDBConnection();
});

describe('transactions store', () => {
  it('guarda y recupera un movimiento cacheado', async () => {
    await putTransaction(cachedTx());
    expect(await getCachedTransaction('tx-1')).toEqual(cachedTx());
  });

  it('putTransactions guarda varios de golpe y getAllCachedTransactions los devuelve todos', async () => {
    await putTransactions([cachedTx({ id: 'tx-1' }), cachedTx({ id: 'tx-2' })]);
    const all = await getAllCachedTransactions();
    expect(all.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-2']);
  });

  it('deleteCachedTransaction borra el registro local', async () => {
    await putTransaction(cachedTx());
    await deleteCachedTransaction('tx-1');
    expect(await getCachedTransaction('tx-1')).toBeUndefined();
  });
});

describe('categories store', () => {
  it('putCategories guarda varias y getAllCachedCategories las devuelve todas', async () => {
    await putCategories([category({ id: 'cat-1' }), category({ id: 'cat-2', name: 'Transporte' })]);
    const all = await getAllCachedCategories();
    expect(all.map((c) => c.id).sort()).toEqual(['cat-1', 'cat-2']);
  });
});

describe('syncQueue store', () => {
  it('enqueue asigna queueId autoincremental y getQueue devuelve en ese orden', async () => {
    const first = await enqueue(queueEntry({ transactionId: 'tx-1' }));
    const second = await enqueue(queueEntry({ transactionId: 'tx-2' }));
    expect(second).toBeGreaterThan(first);

    const queue = await getQueue();
    expect(queue.map((e) => e.queueId)).toEqual([first, second]);
  });

  it('getQueueForTransaction filtra por el índice transactionId, en orden', async () => {
    const a1 = await enqueue(queueEntry({ transactionId: 'tx-1', action: 'CREATE' }));
    await enqueue(queueEntry({ transactionId: 'tx-2', action: 'CREATE' }));
    const a2 = await enqueue(queueEntry({ transactionId: 'tx-1', action: 'UPDATE' }));

    const forTx1 = await getQueueForTransaction('tx-1');
    expect(forTx1.map((e) => e.queueId)).toEqual([a1, a2]);
  });

  it('updateQueueEntry aplica un parche parcial sin tocar el resto de campos', async () => {
    const queueId = await enqueue(queueEntry());
    await updateQueueEntry(queueId, { status: 'failed', failureReason: 'Categoría no encontrada.', failureKind: 'not_found' });

    const [entry] = await getQueue();
    expect(entry).toMatchObject({
      status: 'failed',
      failureReason: 'Categoría no encontrada.',
      failureKind: 'not_found',
      action: 'CREATE',
      transactionId: 'tx-1',
    });
  });

  it('updateQueueEntry sobre un queueId inexistente no lanza ni crea nada', async () => {
    await updateQueueEntry(999, { status: 'failed' });
    expect(await getQueue()).toEqual([]);
  });

  it('removeQueueEntry borra la entrada de la cola', async () => {
    const queueId = await enqueue(queueEntry());
    await removeQueueEntry(queueId);
    expect(await getQueue()).toEqual([]);
  });
});

describe('meta store y ensureUserScope (T2.2)', () => {
  it('setMeta/getMeta guardan y leen un valor suelto', async () => {
    await setMeta('lastFullSyncAt', '2026-08-01T00:00:00.000Z');
    expect(await getMeta('lastFullSyncAt')).toBe('2026-08-01T00:00:00.000Z');
  });

  it('clearAll vacía los 4 stores', async () => {
    await putTransaction(cachedTx());
    await putCategories([category()]);
    await enqueue(queueEntry());
    await setMeta('lastFullSyncAt', '2026-08-01T00:00:00.000Z');

    await clearAll();

    expect(await getAllCachedTransactions()).toEqual([]);
    expect(await getAllCachedCategories()).toEqual([]);
    expect(await getQueue()).toEqual([]);
    expect(await getMeta('lastFullSyncAt')).toBeUndefined();
  });

  it('ensureUserScope no vacía nada la primera vez (sin userId cacheado todavía)', async () => {
    await putTransaction(cachedTx());
    await ensureUserScope('user-1');
    expect(await getAllCachedTransactions()).toHaveLength(1);
    expect(await getMeta('userId')).toBe('user-1');
  });

  it('ensureUserScope no vacía nada si el usuario coincide con el ya cacheado', async () => {
    await ensureUserScope('user-1');
    await putTransaction(cachedTx());
    await ensureUserScope('user-1');
    expect(await getAllCachedTransactions()).toHaveLength(1);
  });

  it('ensureUserScope vacía la caché si el usuario autenticado cambia', async () => {
    await ensureUserScope('user-1');
    await putTransaction(cachedTx());
    await putCategories([category()]);

    await ensureUserScope('user-2');

    expect(await getAllCachedTransactions()).toEqual([]);
    expect(await getAllCachedCategories()).toEqual([]);
    expect(await getMeta('userId')).toBe('user-2');
  });
});
