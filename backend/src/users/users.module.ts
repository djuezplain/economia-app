import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SessionsController } from './sessions.controller.js';
import { ProfileController } from './profile.controller.js';
import { UsersService } from './users.service.js';
import { AccountArchiveService } from './account-archive.service.js';

/**
 * Módulo para las rutas `/users/me/*` (plan.md §2): sesiones (grupo 6),
 * perfil, export y borrado de cuenta (grupos 7 y 8), auditoría (grupo 9) —
 * todo en el mismo módulo en vez de uno nuevo por grupo.
 *
 * `MailModule` y `AuditModule` se importan aquí directamente (no basta con
 * `AuthModule`): `UsersService` necesita `MailService` (aviso de cuenta
 * eliminada, grupo 8) y `AuditLogService` (grupo 9), y `AuthModule` no los
 * reexporta — es el mismo tipo de gotcha de DI que el de `JwtModule` en
 * `auth.module.ts`, resuelto aquí igual: la dependencia se importa donde se
 * necesita, en vez de encadenar reexports.
 */
@Module({
  imports: [AuthModule, MailModule, AuditModule],
  controllers: [SessionsController, ProfileController],
  providers: [UsersService, AccountArchiveService],
  // Spec 032 H4 (plan.md §9.8): GoogleDriveModule reutiliza
  // `UsersService.exportData()` para no duplicar la construcción del
  // fichero de exportación entre H1 (descarga local) y H4 (Google Drive).
  // Spec 048: `AccountArchiveService` (el `.zip`) lo reutilizan la exportación
  // programada y Google Drive, igual que `UsersService.exportData()`.
  exports: [UsersService, AccountArchiveService],
})
export class UsersModule {}
