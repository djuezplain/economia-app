import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { StockImportController } from './stock-import.controller.js';
import { StockImportService } from './stock-import.service.js';

/**
 * Spec 033, plan.md §11. Mismo criterio que `ImportModule`/`DataImportModule`:
 * solo necesita `AuthGuardModule` — `StockImportService` consulta/escribe
 * `stocks`/`stockPurchases`/`stockSales`/`stockValuations` directamente vía
 * `DB` (global), sin depender de `WealthModule`.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [StockImportController],
  providers: [StockImportService],
})
export class StockImportModule {}
