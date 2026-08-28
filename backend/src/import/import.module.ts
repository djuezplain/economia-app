import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

/**
 * Igual que `DashboardModule`: solo necesita `AuthGuardModule` (por
 * `AuthGuard`) — `ImportService` consulta/escribe `categories` y
 * `transactions` directamente vía `DB` (global), sin depender de
 * `CategoriesModule` ni `TransactionsModule` (plan.md §3).
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
