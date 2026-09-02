import { api, ApiError } from '../api/client';
import type { Transaction } from '../api/transactions';
import {
  deleteCachedTransaction,
  getCachedTransaction,
  getQueue,
  getQueueForTransaction,
  putTransaction,
  removeQueueEntry,
  updateQueueEntry,
} from './db';
import type { CachedTransaction, SyncQueueEntry } from './db';
import { syncFullHistory } from './sync';

/**
 * Spec 011 (modo offline), plan.md §5. Procesa la cola de cambios
 * pendientes (movimientos creados/editados/borrados sin conexión) contra
 * la API real, en el orden en que se crearon.
 */

export type QueueProcessListener = (queue: SyncQueueEntry[]) => void;

const listeners = new Set<QueueProcessListener>();

/** Grupo 7 (UI) se suscribe aquí para reflejar el estado de la cola en vivo. */
export function subscribeQueue(listener: QueueProcessListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function notify(): Promise<void> {
  const queue = await getQueue();
  for (const listener of listeners) listener(queue);
}

let processingPromise: Promise<void> | null = null;

/** Solo para tests: descarta cualquier ejecución en curso y los listeners suscritos (cada test debe partir de un estado limpio). Nunca se llama desde código de producción. */
export function resetForTests(): void {
  processingPromise = null;
  listeners.clear();
}

/**
 * Punto de entrada público. Varias llamadas solapadas dentro de la misma
 * pestaña comparten la misma ejecución en vez de procesar la cola dos
 * veces en paralelo; entre pestañas distintas, `navigator.locks` asegura
 * que solo una procesa a la vez (T5.4) — si el navegador no lo soporta
 * (o en el entorno de test, que no lo implementa), se procesa igualmente,
 * solo sin esa coordinación extra entre pestañas.
 */
export function processQueue(): Promise<void> {
  if (!processingPromise) {
    processingPromise = runWithLock().finally(() => {
      processingPromise = null;
    });
  }
  return processingPromise;
}

function runWithLock(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
    return navigator.locks.request('economia-offline-sync-queue', () => run());
  }
  return run();
}

async function run(): Promise<void> {
  const collapsed = await collapseNeverSyncedCreateDelete(await getQueue());
  await notify();

  let sessionExpired = false;
  let appliedAny = false;

  for (const entry of collapsed) {
    if (entry.status !== 'pending') continue;
    if (sessionExpired) {
      await updateQueueEntry(entry.queueId, {
        status: 'failed',
        failureKind: 'session_expired',
        failureReason: 'La sesión ha caducado. Inicia sesión de nuevo para sincronizar este cambio.',
      });
      continue;
    }

    await updateQueueEntry(entry.queueId, { status: 'syncing' });
    await notify();

    try {
      await applyEntry(entry);
      appliedAny = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        sessionExpired = true;
        await updateQueueEntry(entry.queueId, {
          status: 'failed',
          failureKind: 'session_expired',
          failureReason: 'La sesión ha caducado. Inicia sesión de nuevo para sincronizar este cambio.',
        });
      } else if (err instanceof ApiError) {
        await updateQueueEntry(entry.queueId, {
          status: 'failed',
          failureKind: err.status === 404 ? 'not_found' : 'validation',
          failureReason: err.message,
        });
      } else {
        // Error de red (se volvió a caer la conexión a mitad de proceso):
        // se deja el resto de la cola tal cual, `pending`, para reintentarlo
        // la próxima vez que haya conexión — no es un fallo del cambio en sí.
        await updateQueueEntry(entry.queueId, { status: 'pending' });
        await notify();
        return;
      }
    }
    await notify();
  }

  if (appliedAny) {
    try {
      await syncFullHistory();
    } catch {
      // Ver `syncFullHistory`: sin conexión, no pasa nada, se reintentará.
    }
  }
}

async function applyEntry(entry: SyncQueueEntry): Promise<void> {
  if (entry.action === 'CREATE') {
    const transaction = await api.post<Transaction>('/transactions', entry.payload);
    await afterSyncSuccess(entry, transaction);
    return;
  }

  if (entry.action === 'UPDATE') {
    const transaction = await api.patch<Transaction>(`/transactions/${entry.transactionId}`, entry.payload);
    await afterSyncSuccess(entry, transaction);
    return;
  }

  // DELETE: un 404 significa que el estado deseado (que no exista) ya se
  // cumple — se trata como éxito, no como fallo (`plan.md` §5 punto 3).
  try {
    await api.delete<void>(`/transactions/${entry.transactionId}`);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  await deleteCachedTransaction(entry.transactionId);
  await removeQueueEntry(entry.queueId);
}

/**
 * `remaining` excluye la propia entrada (`entry.queueId`) — todavía no se
 * ha borrado de la cola en el momento en que se calcula, así que sin
 * excluirla se contaría a sí misma como "trabajo pendiente" y el
 * movimiento se quedaría marcado `pending` para siempre tras su única
 * sincronización.
 */
async function afterSyncSuccess(entry: SyncQueueEntry, serverTransaction: Transaction): Promise<void> {
  const remaining = (await getQueueForTransaction(entry.transactionId)).filter(
    (e) => e.status !== 'failed' && e.queueId !== entry.queueId,
  );
  const stillPending = remaining.length > 0;
  const cached: CachedTransaction = {
    ...serverTransaction,
    pending: stillPending,
    pendingAction: stillPending ? (remaining[0]?.action ?? null) : null,
  };
  await putTransaction(cached);
  await removeQueueEntry(entry.queueId);
}

/**
 * T5.1: un `CREATE` y un `DELETE` del mismo movimiento, ninguno de los dos
 * sincronizado todavía, se anulan mutuamente sin llamar al servidor — el
 * movimiento nunca llegó a existir para el backend.
 */
async function collapseNeverSyncedCreateDelete(queue: SyncQueueEntry[]): Promise<SyncQueueEntry[]> {
  const byTransaction = new Map<string, SyncQueueEntry[]>();
  for (const entry of queue) {
    const list = byTransaction.get(entry.transactionId) ?? [];
    list.push(entry);
    byTransaction.set(entry.transactionId, list);
  }

  const toRemove = new Set<number>();
  for (const [transactionId, entries] of byTransaction) {
    const pending = entries.filter((e) => e.status === 'pending');
    const hasCreate = pending.some((e) => e.action === 'CREATE');
    const hasDelete = pending.some((e) => e.action === 'DELETE');
    if (hasCreate && hasDelete) {
      for (const entry of pending) toRemove.add(entry.queueId);
      await deleteCachedTransaction(transactionId);
    }
  }

  if (toRemove.size === 0) return queue;
  await Promise.all([...toRemove].map((queueId) => removeQueueEntry(queueId)));
  return queue.filter((e) => !toRemove.has(e.queueId));
}

/** H5 criterio 3 (`spec.md`): reintentar un ítem fallido individualmente. */
export async function retryQueueEntry(queueId: number): Promise<void> {
  await updateQueueEntry(queueId, { status: 'pending', failureReason: null, failureKind: null });
  await notify();
  await processQueue();
}

/** H5 criterio 4: descartar un ítem fallido sin aplicarlo (irreversible — la confirmación vive en la UI, grupo 7). */
export async function discardQueueEntry(queueId: number): Promise<void> {
  const queue = await getQueue();
  const entry = queue.find((e) => e.queueId === queueId);
  if (!entry) return;
  await removeQueueEntry(queueId);
  const remaining = await getQueueForTransaction(entry.transactionId);
  if (remaining.length === 0) {
    if (entry.action === 'CREATE') {
      await deleteCachedTransaction(entry.transactionId);
    } else {
      const existing = await getCachedTransaction(entry.transactionId);
      if (existing) await putTransaction({ ...existing, pending: false, pendingAction: null });
    }
  }
  await notify();
}

/** H5 criterio 5: tras volver a iniciar sesión, reintenta solo lo bloqueado por sesión caducada. */
export async function retrySessionExpiredEntries(): Promise<void> {
  const queue = await getQueue();
  const expired = queue.filter((e) => e.failureKind === 'session_expired');
  if (expired.length === 0) return;
  await Promise.all(
    expired.map((e) => updateQueueEntry(e.queueId, { status: 'pending', failureReason: null, failureKind: null })),
  );
  await notify();
  await processQueue();
}
