import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { BankAccountsController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { BankAccountBalancesController } from './bank-account-balances.controller.js';
import { BankAccountBalancesService } from './bank-account-balances.service.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';
import { StockPurchasesController } from './stock-purchases.controller.js';
import { StockPurchasesService } from './stock-purchases.service.js';
import { StockValuationsController } from './stock-valuations.controller.js';
import { StockValuationsService } from './stock-valuations.service.js';

/**
 * Spec 018 (Resumen Patrimonio) / spec 019 (cuentas bancarias únicas) /
 * spec 020 (acciones únicas). `AuthGuardModule` por `AuthGuard` — mismo
 * criterio que `GoalsModule`/`CategoriesModule`. A diferencia de
 * `GoalsModule`, no importa `DashboardModule`: ningún servicio de aquí
 * reutiliza cálculos de otro módulo. `BankAccountBalancesService`/
 * `StockPurchasesService`/`StockValuationsService` inyectan
 * `BankAccountsService`/`StocksService` (mismo módulo) para reutilizar su
 * `findOwnOrThrow()`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [
    BankAccountsController,
    BankAccountBalancesController,
    StocksController,
    StockPurchasesController,
    StockValuationsController,
  ],
  providers: [BankAccountsService, BankAccountBalancesService, StocksService, StockPurchasesService, StockValuationsService],
})
export class WealthModule {}
