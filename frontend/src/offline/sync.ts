import { api } from '../api/client';
import type { ListTransactionsResult } from '../api/transactions';
import type { Category } from '../api/categories';
import { putTransactions, putCategories, setMeta } from './db';
import type { CachedTransaction } from './db';

const FULL_SYNC_PAGE_SIZE = 200;
export const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';

function toCached(item: ListTransactionsResult['items'][number]): CachedTransaction {
  return { ...item, pending: false, pendingAction: null };
}

/**
 * Spec 011 (modo offline), plan.md §4. Pagina `GET /transactions` y pide
 * `GET /categories` completos, y los vuelca en IndexedDB. Se llama al
 * arrancar la app con sesión y conexión, y al terminar de procesar la cola
 * de pendientes con éxito (grupo 5) — nunca en segundo plano de forma
 * periódica (fuera de alcance, `spec.md` §2).
 *
 * Llama a `api.get` directamente (no a `listTransactions`/`listCategories`
 * de `api/transactions.ts`/`api/categories.ts`): son dos fuentes de la
 * misma información — la hidratación completa en segundo plano y lo que
 * cada página pide para pintarse — y conviene que sean independientes entre
 * sí en vez de competir por la misma llamada (evita, de paso, que esta
 * sincronización de fondo interfiera con las peticiones que cada página
 * hace explícitamente).
 *
 * "Fire and forget" por diseño en quien la llama (igual que `hydrateUser`
 * en `AuthContext`): si no hay conexión, la primera petición falla y no se
 * actualiza nada — no es un error que deba interrumpir el arranque de la
 * app ni el login.
 */
export async function syncFullHistory(): Promise<void> {
  let page = 1;
  let fetched = 0;
  let total = Number.POSITIVE_INFINITY;

  while (fetched < total) {
    const result = await api.get<ListTransactionsResult>(`/transactions?page=${page}&limit=${FULL_SYNC_PAGE_SIZE}`);
    if (result.items.length === 0) break;
    await putTransactions(result.items.map(toCached));
    fetched += result.items.length;
    total = result.totalItems;
    page += 1;
  }

  const categories = await api.get<Category[]>('/categories');
  await putCategories(categories);

  await setMeta(LAST_FULL_SYNC_AT_KEY, new Date().toISOString());
}
