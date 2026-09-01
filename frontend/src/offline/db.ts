import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Transaction } from '../api/transactions';
import type { Category } from '../api/categories';

/**
 * Spec 011 (modo offline), plan.md §3. Espejo local (IndexedDB) de
 * movimientos y categorías, más la cola de cambios de escritura pendientes
 * de sincronizar. Una única base por navegador, vaciada al cambiar de
 * usuario o al cerrar sesión (ver `clearAll`, T2.2).
 */

export type QueueAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type FailureKind = 'validation' | 'not_found' | 'session_expired';
export type QueueStatus = 'pending' | 'syncing' | 'failed';

/** `pending`/`pendingAction`: campos locales, no existen en la API real. */
export interface CachedTransaction extends Transaction {
  pending: boolean;
  pendingAction: QueueAction | null;
}

export interface SyncQueueEntry {
  queueId: number;
  entity: 'transaction';
  action: QueueAction;
  transactionId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  status: QueueStatus;
  failureReason: string | null;
  failureKind: FailureKind | null;
}

export type NewSyncQueueEntry = Omit<SyncQueueEntry, 'queueId'>;

interface OfflineDBSchema extends DBSchema {
  transactions: { key: string; value: CachedTransaction };
  categories: { key: string; value: Category };
  syncQueue: {
    key: number;
    value: SyncQueueEntry;
    indexes: { transactionId: string };
  };
  meta: { key: string; value: string };
}

const DB_NAME = 'economia-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('transactions', { keyPath: 'id' });
        db.createObjectStore('categories', { keyPath: 'id' });
        const queue = db.createObjectStore('syncQueue', { keyPath: 'queueId', autoIncrement: true });
        queue.createIndex('transactionId', 'transactionId');
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

/** Solo para tests: fuerza una reapertura de la base (cada test usa su propia instancia de `fake-indexeddb`). */
export function resetDBConnection(): void {
  dbPromise = null;
}

// --- transactions ---------------------------------------------------------

export async function putTransaction(tx: CachedTransaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', tx);
}

export async function putTransactions(txs: CachedTransaction[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('transactions', 'readwrite');
  await Promise.all([...txs.map((t) => tx.store.put(t)), tx.done]);
}

export async function getCachedTransaction(id: string): Promise<CachedTransaction | undefined> {
  const db = await getDB();
  return db.get('transactions', id);
}

export async function getAllCachedTransactions(): Promise<CachedTransaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function deleteCachedTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
}

// --- categories -------------------------------------------------------------

export async function putCategories(categories: Category[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  await Promise.all([...categories.map((c) => tx.store.put(c)), tx.done]);
}

export async function getAllCachedCategories(): Promise<Category[]> {
  const db = await getDB();
  return db.getAll('categories');
}

// --- syncQueue --------------------------------------------------------------

export async function enqueue(entry: NewSyncQueueEntry): Promise<number> {
  const db = await getDB();
  return db.add('syncQueue', entry as SyncQueueEntry);
}

/** Orden de procesamiento: por `queueId` (orden de creación), `plan.md` §5 punto 3. */
export async function getQueue(): Promise<SyncQueueEntry[]> {
  const db = await getDB();
  const entries = await db.getAll('syncQueue');
  return entries.sort((a, b) => a.queueId - b.queueId);
}

export async function getQueueForTransaction(transactionId: string): Promise<SyncQueueEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('syncQueue', 'transactionId', transactionId);
  return entries.sort((a, b) => a.queueId - b.queueId);
}

export async function updateQueueEntry(queueId: number, patch: Partial<SyncQueueEntry>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('syncQueue', queueId);
  if (!existing) return;
  await db.put('syncQueue', { ...existing, ...patch });
}

export async function removeQueueEntry(queueId: number): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', queueId);
}

// --- meta ---------------------------------------------------------------

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  return db.get('meta', key);
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('meta', value, key);
}

/**
 * Vacía toda la caché local: al cerrar sesión, o al detectar que
 * `meta.userId` no coincide con el usuario que acaba de autenticarse
 * (`plan.md` §3 — evita que datos económicos de un usuario queden
 * accesibles en IndexedDB tras cambiar de cuenta en el mismo navegador).
 */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear('transactions'),
    db.clear('categories'),
    db.clear('syncQueue'),
    db.clear('meta'),
  ]);
}

const USER_ID_KEY = 'userId';

/**
 * Se llama en cuanto se sabe qué usuario está autenticado (arranque de la
 * app, login). Si la caché ya tenía datos de otro usuario, los vacía antes
 * de asociarla al usuario actual — la primera vez que se cachea algo para
 * este usuario, o si coincide con el ya cacheado, no hace nada más que
 * dejar `meta.userId` puesto.
 */
export async function ensureUserScope(userId: string): Promise<void> {
  const cachedUserId = await getMeta(USER_ID_KEY);
  if (cachedUserId && cachedUserId !== userId) {
    await clearAll();
  }
  await setMeta(USER_ID_KEY, userId);
}

/**
 * Spec 011 (modo offline), plan.md §5: el `userId` del usuario autenticado,
 * para poder rellenar ese campo en un movimiento creado offline (la capa de
 * API, `api/transactions.ts`, no tiene acceso directo al contexto de auth).
 * `null` si `ensureUserScope` todavía no se ha llamado en esta sesión.
 */
export async function getCachedUserId(): Promise<string | null> {
  return (await getMeta(USER_ID_KEY)) ?? null;
}
