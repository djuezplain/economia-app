import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { googleSheetsImportConfigs } from '../db/schema/index.js';
import { GoogleSheetsImportService } from './google-sheets-import.service.js';
import { GoogleSheetsService } from './google-sheets.service.js';

/**
 * H3 (spec 026), plan.md §6: reejecuta cada 4 horas la importación de cada
 * usuario con la automática activada. Reutiliza
 * `GoogleSheetsImportService.executeImport()` — el mismo método que usa el
 * disparo manual — así que el resultado (o el error) queda escrito en
 * `lastRunAt`/`lastRunResult`/`lastRunError` exactamente igual en los dos
 * casos. Un fallo de un usuario no interrumpe a los demás (H3 criterio 5).
 */
@Injectable()
export class GoogleSheetsImportScheduler {
  private readonly logger = new Logger(GoogleSheetsImportScheduler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly googleSheetsImportService: GoogleSheetsImportService,
  ) {}

  @Cron('0 */4 * * *')
  async runDueImports(): Promise<void> {
    // Sin credenciales de la cuenta de servicio configuradas, no hay nada
    // que ejecutar — mismo criterio que `GoogleSheetsConfiguredGuard`.
    if (!this.googleSheetsService.isConfigured()) return;

    const configs = await this.db.query.googleSheetsImportConfigs.findMany({
      where: eq(googleSheetsImportConfigs.autoImportEnabled, true),
      with: { user: true },
    });

    for (const config of configs) {
      // Mismo criterio que `RequireActiveUserGuard`: una cuenta deshabilitada
      // o pendiente de verificar no se procesa (H3 criterio 5).
      if (config.user.status !== 'ACTIVE') continue;

      try {
        await this.googleSheetsImportService.executeImport(config);
      } catch (err) {
        // `executeImport` ya deja el motivo en `lastRunError` de la propia
        // fila; aquí solo queda constancia en el log del proceso.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Importación automática fallida para el usuario ${config.userId}: ${message}`);
      }
    }
  }
}
