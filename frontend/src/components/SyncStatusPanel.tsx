import { useEffect, useState } from 'react';
import { useConnectivity } from '../hooks/useConnectivity';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { isOnline as connectivityIsOnline, subscribe } from '../offline/connectivity';
import { discardQueueEntry, processQueue, retryQueueEntry } from '../offline/queueProcessor';
import type { SyncQueueEntry } from '../offline/db';

const ACTION_LABELS: Record<SyncQueueEntry['action'], string> = {
  CREATE: 'Crear movimiento',
  UPDATE: 'Editar movimiento',
  DELETE: 'Eliminar movimiento',
};

const STATUS_LABELS: Record<SyncQueueEntry['status'], string> = {
  pending: 'Pendiente',
  syncing: 'Sincronizando…',
  failed: 'Fallido',
};

function summarizePayload(entry: SyncQueueEntry): string | null {
  if (!entry.payload) return null;
  const { concept, amount } = entry.payload as { concept?: unknown; amount?: unknown };
  const parts = [typeof concept === 'string' ? concept : null, typeof amount === 'string' ? amount : null].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Spec 011 (modo offline), plan.md §7, H1/H4/H5. Franja fija dentro de
 * `AppLayout` (las 8 páginas autenticadas): siempre visible si hay algo
 * que mostrar (offline, o cambios pendientes/fallidos), colapsada si no.
 * Dispara el procesador de la cola al recuperar conexión (H4 criterio 1) —
 * no hace falta que el usuario haga nada para que arranque.
 */
export function SyncStatusPanel() {
  const isOnline = useConnectivity();
  const queue = useSyncQueue();
  const [expanded, setExpanded] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<number | null>(null);

  useEffect(() => {
    if (connectivityIsOnline()) void processQueue();
    return subscribe((online) => {
      if (online) void processQueue();
    });
  }, []);

  // Mientras se está procesando, el panel se abre solo (H4 criterio 1) —
  // el usuario puede volver a colapsarlo, pero empieza visible.
  useEffect(() => {
    if (queue.some((entry) => entry.status === 'syncing')) setExpanded(true);
  }, [queue]);

  const pendingCount = queue.length;
  if (isOnline && pendingCount === 0) return null;

  const summaryParts = [
    !isOnline ? 'Sin conexión' : null,
    pendingCount > 0 ? `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}` : null,
  ].filter((p): p is string => Boolean(p));

  return (
    <div id="sync-status-panel" role="status">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {summaryParts.join(' · ')}
      </button>
      {expanded && (
        <ul id="sync-status-queue">
          {queue.map((entry) => {
            const summary = summarizePayload(entry);
            return (
              <li key={entry.queueId}>
                <span>{ACTION_LABELS[entry.action]}</span>
                {summary && <span> — {summary}</span>}
                <span> · {STATUS_LABELS[entry.status]}</span>
                {entry.status === 'failed' && (
                  <>
                    {entry.failureReason && <p role="alert">{entry.failureReason}</p>}
                    <button type="button" onClick={() => void retryQueueEntry(entry.queueId)}>
                      Reintentar
                    </button>{' '}
                    {confirmDiscardId === entry.queueId ? (
                      <>
                        <span>¿Descartar este cambio? No se puede deshacer.</span>{' '}
                        <button
                          type="button"
                          onClick={() => {
                            void discardQueueEntry(entry.queueId);
                            setConfirmDiscardId(null);
                          }}
                        >
                          Confirmar descarte
                        </button>{' '}
                        <button type="button" onClick={() => setConfirmDiscardId(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDiscardId(entry.queueId)}>
                        Descartar
                      </button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
