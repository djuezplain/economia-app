import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/**
 * Solo necesita `AuthGuardModule` (por `AuthGuard`) — igual que
 * `TransactionsModule`, consulta la tabla `transactions` directamente vía
 * `DB` (global), sin depender de `TransactionsModule` ni `CategoriesModule`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
