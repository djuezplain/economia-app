import { Module } from '@nestjs/common';
import { ReceiptDocumentsCleanupScheduler } from './receipt-documents-cleanup.scheduler.js';
import { ReceiptDocumentsService } from './receipt-documents.service.js';

/**
 * Spec 048 H1. Módulo propio porque lo usan la importación de tickets
 * (`ReceiptImportModule`: guardar el pendiente y asociarlo al confirmar) y
 * la consulta (`GroceriesModule`: ver, adjuntar, sustituir y quitar), sin
 * que ninguno de esos dos dependa del otro.
 */
@Module({
  providers: [ReceiptDocumentsService, ReceiptDocumentsCleanupScheduler],
  exports: [ReceiptDocumentsService],
})
export class ReceiptDocumentsModule {}
