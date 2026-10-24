import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';
import { ReceiptDocumentsModule } from './receipt-documents.module.js';
import { ReceiptTagsModule } from './receipt-tags.module.js';
import { ReceiptTagsController } from './receipt-tags.controller.js';
import { MailModule } from '../mail/mail.module.js';
import { WarrantyRemindersService } from './warranty-reminders.service.js';
import { WarrantyRemindersScheduler } from './warranty-reminders.scheduler.js';
import { SupermarketsController } from './supermarkets.controller.js';
import { SupermarketsService } from './supermarkets.service.js';

/**
 * Spec 034, plan.md §12. Lado de consulta — separado de
 * `ReceiptImportModule` (escritura), mismo criterio que `WealthModule` vs.
 * `StockImportModule` en spec 033.
 */
@Module({
  imports: [AuthGuardModule, ReceiptDocumentsModule, ReceiptTagsModule, MailModule],
  controllers: [SupermarketsController, ProductsController, ReceiptsController, ReceiptTagsController],
  providers: [SupermarketsService, ProductsService, ReceiptsService, WarrantyRemindersService, WarrantyRemindersScheduler],
})
export class GroceriesModule {}
