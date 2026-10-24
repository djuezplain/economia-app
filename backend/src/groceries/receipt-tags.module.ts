import { Module } from '@nestjs/common';
import { ReceiptTagsService } from './receipt-tags.service.js';

/**
 * Spec 051 H1. Módulo propio, como `ReceiptDocumentsModule`: lo usan la
 * consulta (`GroceriesModule`) y la confirmación de una importación
 * (`ReceiptImportModule`, H1 criterio 5).
 */
@Module({
  providers: [ReceiptTagsService],
  exports: [ReceiptTagsService],
})
export class ReceiptTagsModule {}
