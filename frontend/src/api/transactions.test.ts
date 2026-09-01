import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { createTransaction, deleteTransaction, updateTransaction } from './transactions';
import type { Transaction } from './transactions';
import { resetForTests } from '../offline/connectivity';
import { ensureUserScope, getAllCachedTransactions, getCachedTransaction, getQueue, putTransaction } from '../offline/db';
import type { CachedTransaction } from '../offline/db';

const INPUT = {
  type: 'EXPENSE' as const,
  date: '2026-08-01',
  categoryId: 'cat-1',
  concept: 'Café',
  amount: '3.50',
};

function serverTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'server-id',
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
    ...overrides,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  resetForTests(true);
  await ensureUserScope('user-1');
});

describe('createTransaction (T4.1)', () => {
  it('online: llama a la API y escribe el resultado en la caché, sin marcar pending', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(serverTx());

    const result = await createTransaction(INPUT);

    expect(result).toEqual({ ...serverTx(), pending: false, pendingAction: null });
    const cached = await getCachedTransaction('server-id');
    expect(cached).toMatchObject({ id: 'server-id', pending: false, pendingAction: null });
  });

  it('offline: no llama a la API, genera un id, guarda un registro optimista pending y encola la creación', async () => {
    resetForTests(false);
    const postSpy = vi.spyOn(api, 'post');

    const result = (await createTransaction(INPUT)) as CachedTransaction;

    expect(postSpy).not.toHaveBeenCalled();
    expect(result.pending).toBe(true);
    expect(result.pendingAction).toBe('CREATE');
    expect(result.userId).toBe('user-1');
    expect(result.concept).toBe('Café');
    expect(typeof result.id).toBe('string');
    expect(result.id).not.toBe('');

    const cached = await getCachedTransaction(result.id);
    expect(cached).toMatchObject({ pending: true, pendingAction: 'CREATE' });

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ action: 'CREATE', transactionId: result.id, status: 'pending' });
    expect(queue[0].payload).toMatchObject({ id: result.id, ...INPUT });
  });
});

describe('updateTransaction (T4.1)', () => {
  it('online: llama a la API y actualiza la caché', async () => {
    vi.spyOn(api, 'patch').mockResolvedValue(serverTx({ concept: 'Café (editado)' }));

    const result = await updateTransaction('server-id', { concept: 'Café (editado)' });

    expect(result.concept).toBe('Café (editado)');
    const cached = await getCachedTransaction('server-id');
    expect(cached).toMatchObject({ concept: 'Café (editado)', pending: false });
  });

  it('offline: actualiza el registro local marcándolo pending y encola la edición', async () => {
    await putTransaction({ ...serverTx(), pending: false, pendingAction: null });
    resetForTests(false);
    const patchSpy = vi.spyOn(api, 'patch');

    const result = (await updateTransaction('server-id', { concept: 'Café (editado offline)' })) as CachedTransaction;

    expect(patchSpy).not.toHaveBeenCalled();
    expect(result.concept).toBe('Café (editado offline)');
    expect(result.pending).toBe(true);
    expect(result.pendingAction).toBe('UPDATE');

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ action: 'UPDATE', transactionId: 'server-id', status: 'pending' });
  });

  it('offline: editar un movimiento creado offline (todavía sin sincronizar) mantiene pendingAction "CREATE"', async () => {
    resetForTests(false);
    const created = await createTransaction(INPUT);

    const updated = (await updateTransaction(created.id, { concept: 'Café (editado)' })) as CachedTransaction;

    expect(updated.pendingAction).toBe('CREATE');
    const queue = await getQueue();
    expect(queue.map((e) => e.action)).toEqual(['CREATE', 'UPDATE']);
  });

  it('offline: editar un movimiento que no está en la caché local lanza un error claro', async () => {
    resetForTests(false);
    await expect(updateTransaction('no-cacheado', { concept: 'x' })).rejects.toThrow(/no está en la caché local/);
  });
});

describe('deleteTransaction (T4.1)', () => {
  it('online: llama a la API y borra el registro de la caché', async () => {
    await putTransaction({ ...serverTx(), pending: false, pendingAction: null });
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await deleteTransaction('server-id');

    expect(await getCachedTransaction('server-id')).toBeUndefined();
  });

  it('offline: borra el registro local y encola el borrado, sin llamar a la API', async () => {
    await putTransaction({ ...serverTx(), pending: false, pendingAction: null });
    resetForTests(false);
    const deleteSpy = vi.spyOn(api, 'delete');

    await deleteTransaction('server-id');

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await getCachedTransaction('server-id')).toBeUndefined();
    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ action: 'DELETE', transactionId: 'server-id', payload: null });
  });

  it('offline: sigue afectando solo al movimiento borrado, el resto de la caché no cambia', async () => {
    await putTransaction({ ...serverTx({ id: 'tx-a' }), pending: false, pendingAction: null });
    await putTransaction({ ...serverTx({ id: 'tx-b' }), pending: false, pendingAction: null });
    resetForTests(false);

    await deleteTransaction('tx-a');

    const remaining = await getAllCachedTransactions();
    expect(remaining.map((t) => t.id)).toEqual(['tx-b']);
  });
});
