import { Module } from '@nestjs/common';
import { ReceiptTagsModule } from '../groceries/receipt-tags.module.js';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ReceiptImportController } from './receipt-import.controller.js';
import { ReceiptImportService } from './receipt-import.service.js';
import { ReceiptDocumentsModule } from '../groceries/receipt-documents.module.js';

/**
 * Spec 034, plan.md §12. Mismo criterio que `StockImportModule` (spec 033):
 * `ReceiptImportService` consulta/escribe `supermarkets`/`products`/
 * `receipts`/`receiptLines` directamente vía `DB` (global), sin depender de
 * un futuro `GroceriesModule` de lectura (grupo 5).
 */
@Module({
  imports: [AuthGuardModule, ReceiptDocumentsModule, ReceiptTagsModule],
  controllers: [ReceiptImportController],
  // Spec 051: `ReceiptOcrService` lo aporta `ReceiptDocumentsModule`, que también lo usa
  // (leer el texto al adjuntar o sustituir un documento).
  providers: [ReceiptImportService],
})
export class ReceiptImportModule {}
