import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { DataImportController } from './data-import.controller.js';
import { DataImportService } from './data-import.service.js';

/**
 * Spec 032, plan.md §4. Mismo criterio que `ImportModule`: solo necesita
 * `AuthGuardModule` (por `AuthGuard`) — `DataImportService` accede a las 24
 * tablas de datos económicos directamente vía `DB` (global), sin depender
 * de `CategoriesModule`/`TransactionsModule`/`GoalsModule`/`WealthModule`.
 * Módulo propio en vez de sumarse a `ImportModule` (plan.md §5, decisión 4):
 * ese módulo importa movimientos desde Excel/Google Sheets, una
 * responsabilidad muy distinta a fusionar un export completo ya tipado.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
