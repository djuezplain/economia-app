import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/db.module.js';
import type { ScheduledExportsService } from './scheduled-exports.service.js';
import { ScheduledExportsScheduler } from './scheduled-exports.scheduler.js';

/**
 * Spec 032 H5. Mismo criterio que `GoogleDriveOAuthController` (T6.5): sin
 * pasar por Nest/BD real — se instancia la clase con dobles, centrado en la
 * lógica propia del scheduler (filtrar por `enabled`/estado del
 * usuario/`isDue`, no dejar que un fallo interrumpa a los demás). El
 * comportamiento de `isDue` en sí ya tiene su propia suite
 * (`scheduled-exports.due.spec.ts`), así que aquí basta con una config
 * claramente debida u obviamente no debida (hora muy pasada / futura).
 */
describe('ScheduledExportsScheduler', () => {
  const DUE_CONFIG_BASE = {
    id: 'config-1',
    userId: 'user-1',
    frequency: 'DAILY' as const,
    dayOfWeek: null,
    dayOfMonth: null,
    timeOfDay: '00:00', // ya ha pasado a cualquier hora del día — siempre "debido" si no hay lastRunAt.
    lastRunAt: null,
    user: { status: 'ACTIVE' as const },
  };

  const NOT_DUE_CONFIG = {
    ...DUE_CONFIG_BASE,
    id: 'config-2',
    userId: 'user-2',
    timeOfDay: '23:59', // no debido salvo que se ejecute justo a esa hora.
  };

  let findMany: ReturnType<typeof vi.fn>;
  let run: ReturnType<typeof vi.fn>;
  let db: { query: { scheduledExports: { findMany: typeof findMany } } };
  let service: { run: typeof run };
  let scheduler: ScheduledExportsScheduler;

  beforeEach(() => {
    findMany = vi.fn();
    run = vi.fn().mockResolvedValue(undefined);
    db = { query: { scheduledExports: { findMany } } };
    service = { run };
    scheduler = new ScheduledExportsScheduler(db as unknown as Database, service as unknown as ScheduledExportsService);
  });

  it('ejecuta las configuraciones debidas y no toca las que no lo están', async () => {
    findMany.mockResolvedValue([DUE_CONFIG_BASE, NOT_DUE_CONFIG]);

    await scheduler.runDue();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(DUE_CONFIG_BASE);
  });

  it('se salta a un usuario no ACTIVE aunque su configuración esté activada y debida', async () => {
    findMany.mockResolvedValue([{ ...DUE_CONFIG_BASE, user: { status: 'PENDING_VERIFICATION' } }]);

    await scheduler.runDue();

    expect(run).not.toHaveBeenCalled();
  });

  it('un fallo al ejecutar la de un usuario no impide procesar la de los siguientes', async () => {
    const second = { ...DUE_CONFIG_BASE, id: 'config-3', userId: 'user-3' };
    findMany.mockResolvedValue([DUE_CONFIG_BASE, second]);
    run.mockRejectedValueOnce(new Error('fallo simulado')).mockResolvedValueOnce(undefined);

    await expect(scheduler.runDue()).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, DUE_CONFIG_BASE);
    expect(run).toHaveBeenNthCalledWith(2, second);
  });

  it('sin ninguna configuración activada, no llama a run', async () => {
    findMany.mockResolvedValue([]);

    await scheduler.runDue();

    expect(run).not.toHaveBeenCalled();
  });
});
