import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { REMINDERS_TIME_ZONE, todayInRemindersTimeZone } from '../recurring-transactions/recurring-reminders.service.js';
import { WarrantyRemindersService } from './warranty-reminders.service.js';

/** Spec 051 H5 criterio 3: a las 8:00 de Madrid, como los avisos de recibos (spec 049). */
@Injectable()
export class WarrantyRemindersScheduler {
  private readonly logger = new Logger(WarrantyRemindersScheduler.name);

  constructor(private readonly reminders: WarrantyRemindersService) {}

  @Cron('0 8 * * *', { timeZone: REMINDERS_TIME_ZONE })
  async run(): Promise<void> {
    const result = await this.reminders.sendDueReminders(todayInRemindersTimeZone());
    if (result.emailsSent > 0) {
      this.logger.log(`Avisos de garantía: ${result.emailsSent} emails, ${result.warrantiesReminded} garantías.`);
    }
  }
}
