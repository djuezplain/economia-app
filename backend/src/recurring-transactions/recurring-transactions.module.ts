import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { MailModule } from '../mail/mail.module.js';
import { RecurringTransactionsController } from './recurring-transactions.controller.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';
import { RecurringReconciliationService } from './recurring-reconciliation.service.js';
import { RecurringRemindersService } from './recurring-reminders.service.js';
import { RecurringRemindersScheduler } from './recurring-reminders.scheduler.js';

/**
 * Spec 047. Reutiliza la validación de categorías de `TransactionsService`.
 * Spec 049: exporta `RecurringReconciliationService` para que `ImportModule`
 * concilie al importar (plan.md §3.3). No hay ciclo: este módulo no depende
 * de `ImportModule`. Los avisos por email (spec 049 H1) usan `MailModule`.
 */
@Module({
  imports: [AuthGuardModule, TransactionsModule, MailModule],
  controllers: [RecurringTransactionsController],
  providers: [RecurringTransactionsService, RecurringReconciliationService, RecurringRemindersService, RecurringRemindersScheduler],
  exports: [RecurringReconciliationService],
})
export class RecurringTransactionsModule {}
