import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ReceiptImportController } from './receipt-import.controller.js';
import { ReceiptImportService } from './receipt-import.service.js';
import { ReceiptOcrService } from './receipt-ocr.service.js';

/**
 * Spec 034, plan.md §12. Mismo criterio que `StockImportModule` (spec 033):
 * `ReceiptImportService` consulta/escribe `supermarkets`/`products`/
 * `receipts`/`receiptLines` directamente vía `DB` (global), sin depender de
 * un futuro `GroceriesModule` de lectura (grupo 5).
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [ReceiptImportController],
  providers: [ReceiptImportService, ReceiptOcrService],
})
export class ReceiptImportModule {}
