import { useEffect, useState } from 'react';
import { getQueue } from '../offline/db';
import type { SyncQueueEntry } from '../offline/db';
import { subscribeQueue } from '../offline/queueProcessor';

/** Spec 011 (modo offline). Estado en vivo de la cola de sincronización — usado por `SyncStatusPanel` y por `AppLayout` (confirmación al cerrar sesión con cambios pendientes, T7.3). */
export function useSyncQueue(): SyncQueueEntry[] {
  const [queue, setQueue] = useState<SyncQueueEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await getQueue();
      if (!cancelled) setQueue(initial);
    })();
    const unsubscribe = subscribeQueue((q) => setQueue(q));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return queue;
}
