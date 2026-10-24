import { Module } from '@nestjs/common';
import { ReceiptDocumentsCleanupScheduler } from './receipt-documents-cleanup.scheduler.js';
import { ReceiptDocumentsService } from './receipt-documents.service.js';
import { ReceiptOcrService } from '../receipt-import/receipt-ocr.service.js';

/**
 * Spec 048 H1. Módulo propio porque lo usan la importación de tickets
 * (`ReceiptImportModule`: guardar el pendiente y asociarlo al confirmar) y
 * la consulta (`GroceriesModule`: ver, adjuntar, sustituir y quitar), sin
 * que ninguno de esos dos dependa del otro.
 */
@Module({
  // Spec 051 H3: el OCR vive aquí porque lo usan la importación (vista previa) y
  // los documentos de tickets ya guardados (adjuntar, sustituir y releer el texto).
  providers: [ReceiptDocumentsService, ReceiptDocumentsCleanupScheduler, ReceiptOcrService],
  exports: [ReceiptDocumentsService, ReceiptOcrService],
})
export class ReceiptDocumentsModule {}
