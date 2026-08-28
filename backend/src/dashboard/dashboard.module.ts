import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/**
 * Solo necesita `AuthGuardModule` (por `AuthGuard`) — igual que
 * `TransactionsModule`, consulta la tabla `transactions` directamente vía
 * `DB` (global), sin depender de `TransactionsModule` ni `CategoriesModule`.
 *
 * `exports: [DashboardService]` (spec 004, plan.md §3): `GoalsModule` lo
 * importa para que `GoalsProgressService` reutilice `month()`/`.year()`
 * directamente en vez de duplicar su consulta — mismo patrón que
 * `CategoriesModule` exportando `CategoriesService` para `AuthModule`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
