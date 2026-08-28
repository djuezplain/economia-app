import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { auditLogs } from '../db/schema/index.js';

/**
 * Grupo 9 (tasks.md T9.1), lista mínima pedida: `login_success`,
 * `login_failed`, `password_reset`, `account_deleted`, `session_revoked`.
 * Se añade `password_changed`, distinto de `password_reset`: son flujos muy
 * distintos (H7, autenticado, exige la contraseña actual — frente a H5, sin
 * sesión, exige un token de un solo uso por email) y conflar ambos bajo la
 * misma acción perdería justo la distinción que un audit log existe para dar.
 */
export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'password_reset'
  | 'password_changed'
  | 'account_deleted'
  | 'session_revoked';

export interface RecordAuditEventParams {
  userId?: string | null;
  ipAddress?: string | null;
}

/**
 * Registro de eventos de seguridad clave (`plan.md` §1, tabla `AuditLog`).
 * Deliberadamente "best-effort": un fallo al escribir el log de auditoría
 * (p. ej. la BD está momentáneamente saturada) no debe tumbar el flujo
 * principal que lo dispara (login, borrado de cuenta...) — se registra el
 * error con el logger de Nest y se sigue. Esta clase es la ÚNICA que escribe
 * en `audit_logs`; nada más de la app inserta ahí directamente.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async record(action: AuditAction, params: RecordAuditEventParams = {}): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        userId: params.userId ?? null,
        action,
        ipAddress: params.ipAddress ?? null,
      });
    } catch (err) {
      this.logger.error(`No se ha podido registrar el evento de auditoría "${action}".`, err as Error);
    }
  }
}
