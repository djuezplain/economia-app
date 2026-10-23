import { Module } from '@nestjs/common';
import { AuthGuardModule } from '../auth/guards/auth-guard.module.js';
import { RecurringTransactionsModule } from '../recurring-transactions/recurring-transactions.module.js';
import { GoogleSheetsConfiguredGuard } from './google-sheets-configured.guard.js';
import { GoogleSheetsImportController } from './google-sheets-import.controller.js';
import { GoogleSheetsImportService } from './google-sheets-import.service.js';
import { GoogleSheetsImportScheduler } from './google-sheets-import.scheduler.js';
import { GoogleSheetsService } from './google-sheets.service.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

/**
 * Igual que `DashboardModule`: solo necesita `AuthGuardModule` (por
 * `AuthGuard`) — `ImportService` consulta/escribe `categories` y
 * `transactions` directamente vía `DB` (global), sin depender de
 * `CategoriesModule` ni `TransactionsModule` (plan.md §3). Spec 026 añade
 * la importación desde Google Sheets al mismo módulo: reutiliza
 * `ImportService.importWorkbook()` (plan.md §4), sin depender de un
 * módulo nuevo. Spec 049: importa `RecurringTransactionsModule` para
 * conciliar los recibos recurrentes con lo recién importado (plan.md §3.3).
 */
@Module({
  imports: [AuthGuardModule, RecurringTransactionsModule],
  controllers: [ImportController, GoogleSheetsImportController],
  providers: [ImportService, GoogleSheetsService, GoogleSheetsImportService, GoogleSheetsConfiguredGuard, GoogleSheetsImportScheduler],
})
export class ImportModule {}
