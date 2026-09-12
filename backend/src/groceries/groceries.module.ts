import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';
import { SupermarketsController } from './supermarkets.controller.js';
import { SupermarketsService } from './supermarkets.service.js';

/**
 * Spec 034, plan.md §12. Lado de consulta — separado de
 * `ReceiptImportModule` (escritura), mismo criterio que `WealthModule` vs.
 * `StockImportModule` en spec 033.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [SupermarketsController, ProductsController, ReceiptsController],
  providers: [SupermarketsService, ProductsService, ReceiptsService],
})
export class GroceriesModule {}
