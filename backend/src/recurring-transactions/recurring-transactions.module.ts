import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { RecurringTransactionsController } from './recurring-transactions.controller.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';
import { RecurringReconciliationService } from './recurring-reconciliation.service.js';

/**
 * Spec 047. Reutiliza la validación de categorías de `TransactionsService`.
 * Spec 049: exporta `RecurringReconciliationService` para que `ImportModule`
 * concilie al importar (plan.md §3.3). No hay ciclo: este módulo no depende
 * de `ImportModule`.
 */
@Module({
  imports: [AuthGuardModule, TransactionsModule],
  controllers: [RecurringTransactionsController],
  providers: [RecurringTransactionsService, RecurringReconciliationService],
  exports: [RecurringReconciliationService],
})
export class RecurringTransactionsModule {}
