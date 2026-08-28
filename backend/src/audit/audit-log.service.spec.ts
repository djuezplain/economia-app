import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/db.module.js';
import { AuditLogService } from './audit-log.service.js';

function fakeDb(valuesImpl: (row: unknown) => unknown = () => Promise.resolve()) {
  const values = vi.fn(valuesImpl);
  const insert = vi.fn(() => ({ values }));
  return { db: { insert } as unknown as Database, insert, values };
}

describe('AuditLogService', () => {
  it('inserta una fila con la acción, el userId y la ip dados', async () => {
    const { db, insert, values } = fakeDb();
    const service = new AuditLogService(db);

    await service.record('login_success', { userId: 'user-1', ipAddress: '127.0.0.1' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({ userId: 'user-1', action: 'login_success', ipAddress: '127.0.0.1' });
  });

  it('sin userId/ipAddress, inserta null en vez de undefined (columnas nullable)', async () => {
    const { db, values } = fakeDb();
    const service = new AuditLogService(db);

    await service.record('login_failed');

    expect(values).toHaveBeenCalledWith({ userId: null, action: 'login_failed', ipAddress: null });
  });

  it('si falla la escritura en BD, no lanza (best-effort): no debe tumbar el flujo que lo llama', async () => {
    const { db } = fakeDb(() => Promise.reject(new Error('BD no disponible')));
    const service = new AuditLogService(db);

    await expect(service.record('session_revoked', { userId: 'user-1' })).resolves.toBeUndefined();
  });
});
