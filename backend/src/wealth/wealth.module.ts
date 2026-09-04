import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { BankAccountEntriesController } from './bank-account-entries.controller.js';
import { BankAccountEntriesService } from './bank-account-entries.service.js';
import { StockEntriesController } from './stock-entries.controller.js';
import { StockEntriesService } from './stock-entries.service.js';

/**
 * Spec 018 (Resumen Patrimonio). `AuthGuardModule` por `AuthGuard` — mismo
 * criterio que `GoalsModule`/`CategoriesModule`. A diferencia de
 * `GoalsModule`, no importa `DashboardModule`: ningún servicio de aquí
 * reutiliza cálculos de otro módulo.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [BankAccountEntriesController, StockEntriesController],
  providers: [BankAccountEntriesService, StockEntriesService],
})
export class WealthModule {}
