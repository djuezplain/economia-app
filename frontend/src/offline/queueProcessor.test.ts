import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import {
  discardQueueEntry,
  processQueue,
  retryQueueEntry,
  retrySessionExpiredEntries,
  subscribeQueue,
} from './queueProcessor';
import {
  enqueue,
  ensureUserScope,
  getAllCachedTransactions,
  getCachedTransaction,
  getQueue,
  putTransaction,
} from './db';
import type { CachedTransaction, NewSyncQueueEntry } from './db';

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
    pending: true,
    pendingAction: 'CREATE',
    ...overrides,
  };
}

function queueEntry(overrides: Partial<NewSyncQueueEntry> = {}): NewSyncQueueEntry {
  return {
    entity: 'transaction',
    action: 'CREATE',
    transactionId: 'tx-1',
    payload: { id: 'tx-1', concept: 'Café' },
    createdAt: '2026-08-01T00:00:00.000Z',
    status: 'pending',
    failureReason: null,
    failureKind: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await ensureUserScope('user-1');
});

describe('collapso CREATE+DELETE sin sincronizar (T5.1)', () => {
  it('anula ambos sin llamar al servidor y borra el registro optimista', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry({ action: 'CREATE', transactionId: 'tx-1' }));
    await enqueue(queueEntry({ action: 'DELETE', transactionId: 'tx-1', payload: null }));
    const postSpy = vi.spyOn(api, 'post');
    const deleteSpy = vi.spyOn(api, 'delete');

    await processQueue();

    expect(postSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await getQueue()).toEqual([]);
    expect(await getCachedTransaction('tx-1')).toBeUndefined();
  });

  it('un CREATE+UPDATE+DELETE del mismo movimiento colapsa igual (los 3, no solo CREATE+DELETE)', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry({ action: 'CREATE', transactionId: 'tx-1' }));
    await enqueue(queueEntry({ action: 'UPDATE', transactionId: 'tx-1', payload: { concept: 'x' } }));
    await enqueue(queueEntry({ action: 'DELETE', transactionId: 'tx-1', payload: null }));
    vi.spyOn(api, 'post');
    vi.spyOn(api, 'patch');

    await processQueue();

    expect(await getQueue()).toEqual([]);
  });

  it('no colapsa un CREATE+DELETE de movimientos distintos', async () => {
    await putTransaction(cachedTx({ id: 'tx-1' }));
    await putTransaction(cachedTx({ id: 'tx-2', pendingAction: 'DELETE' }));
    await enqueue(queueEntry({ action: 'CREATE', transactionId: 'tx-1' }));
    await enqueue(queueEntry({ action: 'DELETE', transactionId: 'tx-2', payload: null }));
    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx({ id: 'tx-1' }) });
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await processQueue();

    expect(await getCachedTransaction('tx-1')).toBeDefined();
    expect(await getCachedTransaction('tx-2')).toBeUndefined();
  });
});

describe('procesamiento secuencial (T5.2)', () => {
  it('CREATE exitoso: POST, borra la entrada de la cola y limpia pending en la caché', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    const serverTx = { ...cachedTx(), pending: undefined, pendingAction: undefined };
    vi.spyOn(api, 'post').mockResolvedValue(serverTx);

    await processQueue();

    expect(await getQueue()).toEqual([]);
    const cached = await getCachedTransaction('tx-1');
    expect(cached).toMatchObject({ pending: false, pendingAction: null });
  });

  it('UPDATE exitoso: PATCH', async () => {
    await putTransaction(cachedTx({ pendingAction: 'UPDATE' }));
    await enqueue(queueEntry({ action: 'UPDATE', payload: { concept: 'Editado' } }));
    vi.spyOn(api, 'patch').mockResolvedValue({ ...cachedTx({ concept: 'Editado' }) });

    await processQueue();

    expect(await getQueue()).toEqual([]);
    const cached = await getCachedTransaction('tx-1');
    expect(cached?.concept).toBe('Editado');
  });

  it('DELETE exitoso: DELETE, borra el registro de la caché', async () => {
    await putTransaction(cachedTx({ pendingAction: 'DELETE' }));
    await enqueue(queueEntry({ action: 'DELETE', payload: null }));
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await processQueue();

    expect(await getQueue()).toEqual([]);
    expect(await getCachedTransaction('tx-1')).toBeUndefined();
  });

  it('DELETE con 404 (ya borrado en el servidor) se trata como éxito, no como fallo', async () => {
    await putTransaction(cachedTx({ pendingAction: 'DELETE' }));
    await enqueue(queueEntry({ action: 'DELETE', payload: null }));
    vi.spyOn(api, 'delete').mockRejectedValue(new ApiError(404, 'Movimiento no encontrado.'));

    await processQueue();

    expect(await getQueue()).toEqual([]);
    expect(await getCachedTransaction('tx-1')).toBeUndefined();
  });

  it('UPDATE con 400/409 de validación falla, con motivo, sin bloquear el resto de la cola', async () => {
    await putTransaction(cachedTx({ id: 'tx-1', pendingAction: 'UPDATE' }));
    await putTransaction(cachedTx({ id: 'tx-2' }));
    await enqueue(queueEntry({ action: 'UPDATE', transactionId: 'tx-1', payload: { categoryId: 'no-existe' } }));
    await enqueue(queueEntry({ action: 'CREATE', transactionId: 'tx-2' }));
    vi.spyOn(api, 'patch').mockRejectedValue(new ApiError(400, 'La categoría no coincide con el tipo del movimiento.'));
    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx({ id: 'tx-2' }) });

    await processQueue();

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      transactionId: 'tx-1',
      status: 'failed',
      failureKind: 'validation',
      failureReason: 'La categoría no coincide con el tipo del movimiento.',
    });
  });

  it('se procesa en el orden de creación (queueId), no otro', async () => {
    await putTransaction(cachedTx({ id: 'tx-1' }));
    await putTransaction(cachedTx({ id: 'tx-2' }));
    await enqueue(queueEntry({ transactionId: 'tx-2', payload: { id: 'tx-2', concept: 'Café' } }));
    await enqueue(queueEntry({ transactionId: 'tx-1', payload: { id: 'tx-1', concept: 'Café' } }));
    const order: string[] = [];
    vi.spyOn(api, 'post').mockImplementation(async (_path, body) => {
      order.push((body as { id: string }).id);
      return { ...cachedTx({ id: (body as { id: string }).id }) };
    });

    await processQueue();

    expect(order).toEqual(['tx-2', 'tx-1']);
  });

  it('error de red a mitad de proceso deja el resto pending (no failed) y para ahí', async () => {
    await putTransaction(cachedTx({ id: 'tx-1' }));
    await putTransaction(cachedTx({ id: 'tx-2' }));
    await enqueue(queueEntry({ transactionId: 'tx-1' }));
    await enqueue(queueEntry({ transactionId: 'tx-2' }));
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ ...cachedTx({ id: 'tx-1' }) })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await processQueue();

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ transactionId: 'tx-2', status: 'pending' });
  });
});

describe('sesión caducada (T5.3)', () => {
  it('un 401 detiene el resto de la cola, marcándola bloqueada por sesión caducada (no fallida item a item)', async () => {
    await putTransaction(cachedTx({ id: 'tx-1' }));
    await putTransaction(cachedTx({ id: 'tx-2' }));
    await enqueue(queueEntry({ transactionId: 'tx-1' }));
    await enqueue(queueEntry({ transactionId: 'tx-2' }));
    const postSpy = vi.spyOn(api, 'post').mockRejectedValue(new ApiError(401, 'No autenticado.'));

    await processQueue();

    expect(postSpy).toHaveBeenCalledTimes(1); // no llega a intentar el segundo
    const queue = await getQueue();
    expect(queue).toHaveLength(2);
    expect(queue.every((e) => e.failureKind === 'session_expired' && e.status === 'failed')).toBe(true);
  });

  it('retrySessionExpiredEntries reprocesa solo lo bloqueado por sesión, tras iniciar sesión de nuevo', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError(401, 'No autenticado.'));
    await processQueue();
    expect((await getQueue())[0].failureKind).toBe('session_expired');

    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx() });
    await retrySessionExpiredEntries();

    expect(await getQueue()).toEqual([]);
  });
});

describe('un solo procesado a la vez dentro de la pestaña (T5.4, límite de lo testeable en Vitest)', () => {
  it('dos llamadas solapadas a processQueue() comparten la misma ejecución', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    let resolvePost!: (v: CachedTransaction) => void;
    const postSpy = vi.spyOn(api, 'post').mockImplementation(() => new Promise((resolve) => (resolvePost = resolve)));

    const first = processQueue();
    const second = processQueue();
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalled());
    resolvePost(cachedTx());
    await Promise.all([first, second]);

    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});

describe('reintentar/descartar un ítem (T5.5)', () => {
  it('retryQueueEntry vuelve a poner en pending y reprocesa', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError(400, 'Categoría no encontrada.'));
    await processQueue();
    const [failed] = await getQueue();
    expect(failed.status).toBe('failed');

    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx() });
    await retryQueueEntry(failed.queueId);

    expect(await getQueue()).toEqual([]);
  });

  it('discardQueueEntry de un CREATE nunca sincronizado borra la entrada y el registro optimista, sin llamar al servidor', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError(400, 'x'));
    await processQueue();
    const [failed] = await getQueue();
    const postSpy = vi.spyOn(api, 'post');
    postSpy.mockClear();

    await discardQueueEntry(failed.queueId);

    expect(postSpy).not.toHaveBeenCalled();
    expect(await getQueue()).toEqual([]);
    expect(await getCachedTransaction('tx-1')).toBeUndefined();
  });

  it('discardQueueEntry de un UPDATE deja el registro (ya existía en el servidor), solo quita el pending', async () => {
    await putTransaction(cachedTx({ pendingAction: 'UPDATE' }));
    await enqueue(queueEntry({ action: 'UPDATE', payload: { concept: 'x' } }));
    vi.spyOn(api, 'patch').mockRejectedValueOnce(new ApiError(400, 'x'));
    await processQueue();
    const [failed] = await getQueue();

    await discardQueueEntry(failed.queueId);

    expect(await getQueue()).toEqual([]);
    const cached = await getCachedTransaction('tx-1');
    expect(cached).toMatchObject({ pending: false, pendingAction: null });
  });
});

describe('subscribeQueue', () => {
  it('notifica a los listeners tras cada cambio de estado de un ítem', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx() });
    const listener = vi.fn();
    subscribeQueue(listener);

    await processQueue();

    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual([]);
  });
});

describe('sin cambios pendientes', () => {
  it('processQueue() sobre una cola vacía no llama a ninguna API ni falla', async () => {
    const postSpy = vi.spyOn(api, 'post');
    await expect(processQueue()).resolves.toBeUndefined();
    expect(postSpy).not.toHaveBeenCalled();
    expect(await getAllCachedTransactions()).toEqual([]);
  });
});
