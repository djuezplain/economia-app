import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { scheduledExports } from '../db/schema/index.js';
import { ScheduledExportsService } from './scheduled-exports.service.js';
import { isDue } from './scheduled-exports.due.js';

/**
 * Spec 032 H5, plan.md §11.3. Mismo patrón que `GoogleSheetsImportScheduler`
 * (spec 026): barrido periódico que revisa las configuraciones activas y
 * ejecuta las que tocan. Un fallo de un usuario no interrumpe a los demás —
 * `ScheduledExportsService.run()` ya deja el motivo en `lastRunError` de la
 * propia fila; aquí solo queda constancia en el log del proceso.
 */
@Injectable()
export class ScheduledExportsScheduler {
  private readonly logger = new Logger(ScheduledExportsScheduler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scheduledExportsService: ScheduledExportsService,
  ) {}

  @Cron('*/15 * * * *')
  async runDue(): Promise<void> {
    const configs = await this.db.query.scheduledExports.findMany({
      where: eq(scheduledExports.enabled, true),
      with: { user: true },
    });
    const now = new Date();

    for (const config of configs) {
      // Mismo criterio que `RequireActiveUserGuard`/`GoogleSheetsImportScheduler`.
      if (config.user.status !== 'ACTIVE') continue;
      if (!isDue(config, now)) continue;

      try {
        await this.scheduledExportsService.run(config);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Exportación programada fallida para el usuario ${config.userId}: ${message}`);
      }
    }
  }
}
