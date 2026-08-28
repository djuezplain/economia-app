import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { SavingsGoalsController } from './savings-goals.controller.js';
import { SavingsGoalsService } from './savings-goals.service.js';
import { ExpenseBudgetsController } from './expense-budgets.controller.js';
import { ExpenseBudgetsService } from './expense-budgets.service.js';

/**
 * H1/H2 (spec 004). Solo necesita `AuthGuardModule` (por `AuthGuard`) —
 * igual que `CategoriesModule`/`TransactionsModule`, consulta `categories`/
 * `savings_goals`/`expense_budgets` directamente vía `DB` (global).
 *
 * `SavingsGoalsController`/`ExpenseBudgetsController` viven en el mismo
 * módulo (no dos módulos separados) porque son las dos caras de la misma
 * spec (H1/H2) y el grupo 3 (`GoalsProgressController`, T3.1) necesitará
 * inyectar ambos servicios a la vez — separarlos en dos módulos solo para
 * volver a juntarlos enseguida no aportaría nada.
 */
@Module({
  imports: [AuthGuardModule],
  controllers: [SavingsGoalsController, ExpenseBudgetsController],
  providers: [SavingsGoalsService, ExpenseBudgetsService],
  exports: [SavingsGoalsService, ExpenseBudgetsService],
})
export class GoalsModule {}
