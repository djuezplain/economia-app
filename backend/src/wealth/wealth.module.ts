import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { BankAccountsController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { BankAccountBalancesController } from './bank-account-balances.controller.js';
import { BankAccountBalancesService } from './bank-account-balances.service.js';
import { StockEntriesController } from './stock-entries.controller.js';
import { StockEntriesService } from './stock-entries.service.js';

/**
 * Spec 018 (Resumen Patrimonio) / spec 019 (cuentas bancarias únicas).
 * `AuthGuardModule` por `AuthGuard` — mismo criterio que `GoalsModule`/
 * `CategoriesModule`. A diferencia de `GoalsModule`, no importa
 * `DashboardModule`: ningún servicio de aquí reutiliza cálculos de otro
 * módulo. `BankAccountBalancesService` inyecta `BankAccountsService`
 * (mismo módulo) para reutilizar su `findOwnOrThrow()`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [BankAccountsController, BankAccountBalancesController, StockEntriesController],
  providers: [BankAccountsService, BankAccountBalancesService, StockEntriesService],
})
export class WealthModule {}
