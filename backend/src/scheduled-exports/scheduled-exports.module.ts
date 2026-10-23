import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { UsersModule } from '../users/users.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { ScheduledExportsController } from './scheduled-exports.controller.js';
import { ScheduledExportsService } from './scheduled-exports.service.js';
import { ScheduledExportsScheduler } from './scheduled-exports.scheduler.js';

/**
 * Spec 032 H5, plan.md §11.8. `UsersModule` aporta `AccountArchiveService` (la copia `.zip`, spec 048)
 * (destino LOCAL); `GoogleDriveModule` aporta `GoogleDriveService`
 * (destino DRIVE, reutiliza `exportToDrive()`/`isConnected()` tal cual, sin
 * duplicar nada de H4).
 */
@Module({
  imports: [AuthGuardModule, UsersModule, GoogleDriveModule],
  controllers: [ScheduledExportsController],
  providers: [ScheduledExportsService, ScheduledExportsScheduler],
})
export class ScheduledExportsModule {}
