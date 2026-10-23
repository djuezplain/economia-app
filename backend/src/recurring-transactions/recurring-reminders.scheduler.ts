import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecurringRemindersService, REMINDERS_TIME_ZONE, todayInRemindersTimeZone } from './recurring-reminders.service.js';

/**
 * Spec 049 H1 / plan.md §3.5: una vez al día, a las 8:00 de Madrid, envía
 * los avisos de recibos que tocan hoy. "Hoy" se calcula en esa misma zona,
 * no en UTC, para que un aviso de "vence hoy" no salga con la fecha del día
 * anterior. Mismo patrón que `GoogleSheetsImportScheduler`.
 */
@Injectable()
export class RecurringRemindersScheduler {
  private readonly logger = new Logger(RecurringRemindersScheduler.name);

  constructor(private readonly reminders: RecurringRemindersService) {}

  @Cron('0 8 * * *', { timeZone: REMINDERS_TIME_ZONE })
  async run(): Promise<void> {
    const result = await this.reminders.sendDueReminders(todayInRemindersTimeZone());
    if (result.emailsSent > 0) {
      this.logger.log(`Avisos de recibos: ${result.emailsSent} emails, ${result.occurrencesReminded} recibos.`);
    }
  }
}
