import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { UsersModule } from '../users/users.module.js';
import { GoogleDriveOAuthController } from './google-drive-oauth.controller.js';
import { GoogleDriveController } from './google-drive.controller.js';
import { GoogleDriveConfiguredGuard } from './google-drive-configured.guard.js';
import { GoogleDriveService } from './google-drive.service.js';

/**
 * Spec 032 H4, plan.md §9.8. `AuthModule` aporta `SessionsService`
 * (`verifyActive`, usado por `GoogleDriveOAuthController`) y, re-exportado,
 * `AuthGuardModule` (`AuthGuard`/`JwtService`, usados por ambos
 * controladores); se importa también `AuthGuardModule` de forma explícita
 * para dejar claro que `JwtService` es una dependencia real de este módulo,
 * no un efecto colateral de importar `AuthModule`. `UsersModule` aporta
 * `UsersService.exportData()`, que reutiliza `GoogleDriveService.exportToDrive()`
 * (plan.md §9.7, grupo 7) — sin duplicar la construcción del fichero de
 * exportación entre H1 y H4.
 */
@Module({
  imports: [AuthModule, AuthGuardModule, UsersModule],
  controllers: [GoogleDriveOAuthController, GoogleDriveController],
  providers: [GoogleDriveService, GoogleDriveConfiguredGuard],
  // Spec 032 H5, plan.md §11.8: la exportación programada con destino
  // Drive (ScheduledExportsModule) reutiliza `exportToDrive()`/`isConnected()`
  // tal cual, sin duplicar nada de H4.
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
