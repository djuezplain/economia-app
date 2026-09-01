import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusPanel } from './SyncStatusPanel';
import { api } from '../api/client';
import { resetForTests as resetConnectivity } from '../offline/connectivity';
import { enqueue, ensureUserScope, putTransaction } from '../offline/db';
import type { CachedTransaction, NewSyncQueueEntry } from '../offline/db';

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
    payload: { id: 'tx-1', concept: 'Café', amount: '3.50' },
    createdAt: '2026-08-01T00:00:00.000Z',
    status: 'pending',
    failureReason: null,
    failureKind: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  resetConnectivity(true);
  await ensureUserScope('user-1');
});

describe('SyncStatusPanel (T7.1-T7.2, spec 011)', () => {
  it('online y sin cambios pendientes, no muestra nada', () => {
    const { container } = render(<SyncStatusPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offline, muestra "Sin conexión" aunque no haya pendientes', async () => {
    resetConnectivity(false);
    render(<SyncStatusPanel />);
    expect(await screen.findByText(/Sin conexión/)).toBeInTheDocument();
  });

  it('con cambios pendientes, muestra el recuento y arranca el procesador solo', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx(), pending: undefined, pendingAction: undefined });

    render(<SyncStatusPanel />);

    expect(await screen.findByText(/1 cambio pendiente/)).toBeInTheDocument();
    await waitFor(() => expect(postSpy).toHaveBeenCalled());
  });

  it('al recuperar conexión, dispara el procesador automáticamente', async () => {
    resetConnectivity(false);
    await putTransaction(cachedTx());
    await enqueue(queueEntry());
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx(), pending: undefined, pendingAction: undefined });

    render(<SyncStatusPanel />);
    expect(postSpy).not.toHaveBeenCalled();

    // No se llama a `resetConnectivity(true)` aquí: además de forzar el
    // estado, vacía los listeners ya suscritos por el propio componente
    // (`resetForTests` está pensado para *empezar* un test en un estado
    // conocido, no para simular una transición real a mitad de uno). En vez
    // de eso, se deja que el evento real `online` del navegador dispare
    // `checkNow()`, que confirma contra `/health` (mockeado) y notifica a
    // los listeners ya suscritos con un cambio real de estado.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
  });

  it('un ítem fallido muestra el motivo y permite reintentar', async () => {
    await putTransaction(cachedTx());
    await enqueue(
      queueEntry({ status: 'failed', failureKind: 'validation', failureReason: 'Categoría no encontrada.' }),
    );

    render(<SyncStatusPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /1 cambio pendiente/ }));

    expect(screen.getByText('Categoría no encontrada.')).toBeInTheDocument();

    vi.spyOn(api, 'post').mockResolvedValue({ ...cachedTx(), pending: undefined, pendingAction: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.queryByText('Categoría no encontrada.')).not.toBeInTheDocument());
  });

  it('descartar un ítem fallido pide confirmación explícita antes de aplicarse', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry({ status: 'failed', failureKind: 'validation', failureReason: 'x' }));

    render(<SyncStatusPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /1 cambio pendiente/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
    expect(screen.getByText(/1 cambio pendiente/)).toBeInTheDocument(); // todavía no se ha descartado

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar descarte' }));

    await waitFor(() => expect(screen.queryByText(/cambio pendiente/)).not.toBeInTheDocument());
  });

  it('cancelar la confirmación de descarte no borra el ítem', async () => {
    await putTransaction(cachedTx());
    await enqueue(queueEntry({ status: 'failed', failureKind: 'validation', failureReason: 'x' }));

    render(<SyncStatusPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /1 cambio pendiente/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/No se puede deshacer/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 cambio pendiente/)).toBeInTheDocument();
  });

  it('varios cambios de sesión caducada bloqueados se muestran todos con su motivo', async () => {
    await putTransaction(cachedTx({ id: 'tx-1' }));
    await putTransaction(cachedTx({ id: 'tx-2' }));
    await enqueue(
      queueEntry({
        transactionId: 'tx-1',
        status: 'failed',
        failureKind: 'session_expired',
        failureReason: 'La sesión ha caducado. Inicia sesión de nuevo para sincronizar este cambio.',
      }),
    );
    await enqueue(
      queueEntry({
        transactionId: 'tx-2',
        status: 'failed',
        failureKind: 'session_expired',
        failureReason: 'La sesión ha caducado. Inicia sesión de nuevo para sincronizar este cambio.',
      }),
    );

    render(<SyncStatusPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /2 cambios pendientes/ }));

    expect(screen.getAllByText(/La sesión ha caducado/)).toHaveLength(2);
  });
});
