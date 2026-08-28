import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { SavingsGoalsController } from './savings-goals.controller.js';
import { SavingsGoalsService } from './savings-goals.service.js';
import { ExpenseBudgetsController } from './expense-budgets.controller.js';
import { ExpenseBudgetsService } from './expense-budgets.service.js';
import { GoalsProgressController } from './goals-progress.controller.js';
import { GoalsProgressService } from './goals-progress.service.js';

/**
 * H1/H2/H3/H4 (spec 004). `AuthGuardModule` por `AuthGuard` — igual que
 * `CategoriesModule`/`TransactionsModule`, `SavingsGoalsService`/
 * `ExpenseBudgetsService` consultan `savings_goals`/`expense_budgets`/
 * `categories` directamente vía `DB` (global). `DashboardModule` (plan.md
 * §3): `GoalsProgressService` inyecta `DashboardService` para reutilizar
 * `month()`/`.year()` en vez de duplicar su consulta.
 *
 * Los tres controladores viven en el mismo módulo (no varios separados)
 * porque son las distintas caras de la misma spec (H1-H4) y
 * `GoalsProgressService` necesita inyectar `SavingsGoalsService` y
 * `ExpenseBudgetsService` a la vez — separarlos en módulos distintos solo
 * para volver a juntarlos enseguida no aportaría nada.
 */
@Module({
  imports: [AuthGuardModule, DashboardModule],
  controllers: [SavingsGoalsController, ExpenseBudgetsController, GoalsProgressController],
  providers: [SavingsGoalsService, ExpenseBudgetsService, GoalsProgressService],
  exports: [SavingsGoalsService, ExpenseBudgetsService],
})
export class GoalsModule {}
