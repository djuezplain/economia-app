import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';

/**
 * No es `@Global()` (a diferencia de `DbModule`): se importa explícitamente
 * en cada módulo que necesita `AuditLogService` (`AuthModule`, `UsersModule`)
 * — mismo criterio ya aplicado con `MailModule` en el grupo 8, en vez de
 * encadenar reexports entre módulos de feature.
 */
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
