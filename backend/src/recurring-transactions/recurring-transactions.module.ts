import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { RecurringTransactionsController } from './recurring-transactions.controller.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';

/** Spec 047. Reutiliza la validación de categorías de `TransactionsService`. */
@Module({
  imports: [AuthGuardModule, TransactionsModule],
  controllers: [RecurringTransactionsController],
  providers: [RecurringTransactionsService],
})
export class RecurringTransactionsModule {}
