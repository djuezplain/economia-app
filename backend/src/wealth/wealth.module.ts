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
import { StockSalesController } from './stock-sales.controller.js';
import { StockSalesService } from './stock-sales.service.js';
import { StockValuationsController } from './stock-valuations.controller.js';
import { StockValuationsService } from './stock-valuations.service.js';
import { StockDividendsController } from './stock-dividends.controller.js';
import { StockDividendsService } from './stock-dividends.service.js';
import { FundsController } from './funds.controller.js';
import { FundsService } from './funds.service.js';
import { FundPurchasesController } from './fund-purchases.controller.js';
import { FundPurchasesService } from './fund-purchases.service.js';
import { FundSalesController } from './fund-sales.controller.js';
import { FundSalesService } from './fund-sales.service.js';
import { FundValuationsController } from './fund-valuations.controller.js';
import { FundValuationsService } from './fund-valuations.service.js';
import { FundDividendsController } from './fund-dividends.controller.js';
import { FundDividendsService } from './fund-dividends.service.js';
import { CryptosController } from './cryptos.controller.js';
import { CryptosService } from './cryptos.service.js';
import { CryptoPurchasesController } from './crypto-purchases.controller.js';
import { CryptoPurchasesService } from './crypto-purchases.service.js';
import { CryptoValuationsController } from './crypto-valuations.controller.js';
import { CryptoValuationsService } from './crypto-valuations.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { VehicleValuationsController } from './vehicle-valuations.controller.js';
import { VehicleValuationsService } from './vehicle-valuations.service.js';
import { PensionPlansController } from './pension-plans.controller.js';
import { PensionPlansService } from './pension-plans.service.js';
import { PensionPlanContributionsController } from './pension-plan-contributions.controller.js';
import { PensionPlanContributionsService } from './pension-plan-contributions.service.js';
import { PensionPlanValuationsController } from './pension-plan-valuations.controller.js';
import { PensionPlanValuationsService } from './pension-plan-valuations.service.js';
import { CashHoldingsController } from './cash-holdings.controller.js';
import { CashHoldingsService } from './cash-holdings.service.js';
import { CashBalancesController } from './cash-balances.controller.js';
import { CashBalancesService } from './cash-balances.service.js';

/**
 * Spec 018 (Resumen Patrimonio) / spec 019 (cuentas bancarias únicas) /
 * spec 020 (acciones únicas) / spec 021 (fondos de inversión únicos, mismo
 * modelo que spec 020) / spec 022 (cripto, mismo modelo también) / spec 023
 * (vehículos, mismo modelo en dos niveles que spec 019 — sin "cantidad") /
 * spec 024 (fondo pensiones, patrón en tres niveles como Cripto pero sin
 * cantidad ni precio por unidad — aportaciones y valoraciones son importes
 * directos) / spec 025 (efectivo, mismo modelo en dos niveles que spec 019
 * pero con un único campo identificativo — cierra spec 018, las 7
 * categorías quedan implementadas) / spec 029 (dividendos de Acciones y
 * Fondos Inversión, tercer historial dentro de cada posición ya existente,
 * sin tabla ni módulo propio). `AuthGuardModule` por `AuthGuard` —
 * mismo criterio que `GoalsModule`/`CategoriesModule`. A diferencia de
 * `GoalsModule`, no importa `DashboardModule`: ningún servicio de aquí
 * reutiliza cálculos de otro módulo. `BankAccountBalancesService`/
 * `StockPurchasesService`/`StockValuationsService`/`FundPurchasesService`/
 * `FundValuationsService`/`CryptoPurchasesService`/`CryptoValuationsService`/
 * `VehicleValuationsService`/`PensionPlanContributionsService`/
 * `PensionPlanValuationsService`/`CashBalancesService` inyectan
 * `BankAccountsService`/`StocksService`/`FundsService`/`CryptosService`/
 * `VehiclesService`/`PensionPlansService`/`CashHoldingsService` (mismo
 * módulo) para reutilizar su `findOwnOrThrow()`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [
    BankAccountsController,
    BankAccountBalancesController,
    StocksController,
    StockPurchasesController,
    StockSalesController,
    StockValuationsController,
    StockDividendsController,
    FundsController,
    FundPurchasesController,
    FundSalesController,
    FundValuationsController,
    FundDividendsController,
    CryptosController,
    CryptoPurchasesController,
    CryptoValuationsController,
    VehiclesController,
    VehicleValuationsController,
    PensionPlansController,
    PensionPlanContributionsController,
    PensionPlanValuationsController,
    CashHoldingsController,
    CashBalancesController,
  ],
  providers: [
    BankAccountsService,
    BankAccountBalancesService,
    StocksService,
    StockPurchasesService,
    StockSalesService,
    StockValuationsService,
    StockDividendsService,
    FundsService,
    FundPurchasesService,
    FundSalesService,
    FundValuationsService,
    FundDividendsService,
    CryptosService,
    CryptoPurchasesService,
    CryptoValuationsService,
    VehiclesService,
    VehicleValuationsService,
    PensionPlansService,
    PensionPlanContributionsService,
    PensionPlanValuationsService,
    CashHoldingsService,
    CashBalancesService,
  ],
})
export class WealthModule {}
