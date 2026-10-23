import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReceiptDocumentsService } from './receipt-documents.service.js';

/**
 * Spec 048 plan.md §3.1: una vez al día borra los documentos subidos en la
 * vista previa de la importación que nadie llegó a confirmar. A las 4:00 de
 * Madrid, lejos de las demás tareas programadas.
 */
@Injectable()
export class ReceiptDocumentsCleanupScheduler {
  private readonly logger = new Logger(ReceiptDocumentsCleanupScheduler.name);

  constructor(private readonly documents: ReceiptDocumentsService) {}

  @Cron('0 4 * * *', { timeZone: 'Europe/Madrid' })
  async run(): Promise<void> {
    const purged = await this.documents.purgeStalePending();
    if (purged > 0) this.logger.log(`Documentos de tickets sin confirmar borrados: ${purged}.`);
  }
}
