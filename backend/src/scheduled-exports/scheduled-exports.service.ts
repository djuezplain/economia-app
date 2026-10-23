import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { scheduledExports } from '../db/schema/index.js';
import { AccountArchiveService, archiveFilename } from '../users/account-archive.service.js';
import { GoogleDriveService } from '../google-drive/google-drive.service.js';
import { sanitizeSubfolder } from './local-export-path.util.js';
import { SaveScheduledExportDto } from './dto/save-scheduled-export.dto.js';

export type ScheduledExportRow = typeof scheduledExports.$inferSelect;

// Spec 048: la exportación es un `.zip`; la purga reconoce también los `.json` anteriores.
const FILE_NAME_PATTERN = /^economia-app-datos-\d{4}-\d{2}-\d{2}\.(zip|json)$/;
const RETENTION_DAYS = 14; // plan.md §11.5 — mismo criterio que deploy/backup.sh.

/**
 * Spec 032 H5, plan.md §11.4/§11.6. Guarda/lee la configuración de
 * exportación programada de un usuario y ejecuta una exportación (llamada
 * tanto por el barrido periódico, `ScheduledExportsScheduler`, como —
 * potencialmente en el futuro — por un disparo manual; hoy solo el
 * scheduler la invoca).
 */
@Injectable()
export class ScheduledExportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly archives: AccountArchiveService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async get(userId: string): Promise<ScheduledExportRow | null> {
    const row = await this.db.query.scheduledExports.findFirst({ where: eq(scheduledExports.userId, userId) });
    return row ?? null;
  }

  /**
   * H5 criterio 3: activar con destino Drive exige tener Drive ya conectado
   * — se comprueba aquí, no en el DTO (depende del estado de otra tabla).
   * Guardar con `enabled: false` nunca exige esta comprobación (H5 criterio
   * 4: la config se puede preparar sin activarla todavía).
   */
  async save(userId: string, dto: SaveScheduledExportDto): Promise<ScheduledExportRow> {
    this.assertDaySelectionMatchesFrequency(dto);

    if (dto.enabled && dto.destination === 'DRIVE' && !(await this.googleDriveService.isConnected(userId))) {
      throw new BadRequestException('Conecta Google Drive antes de programar una exportación a Drive.');
    }

    const values = {
      userId,
      enabled: dto.enabled,
      frequency: dto.frequency,
      dayOfWeek: dto.frequency === 'WEEKLY' ? dto.dayOfWeek! : null,
      dayOfMonth: dto.frequency === 'MONTHLY' ? dto.dayOfMonth! : null,
      timeOfDay: dto.timeOfDay,
      destination: dto.destination,
      localSubfolder: dto.localSubfolder ?? null,
      updatedAt: new Date(),
    };

    const [row] = await this.db
      .insert(scheduledExports)
      .values(values)
      .onConflictDoUpdate({ target: scheduledExports.userId, set: values })
      .returning();
    return row;
  }

  /** H5 criterio 4: no borra la fila, solo desactiva — conserva periodicidad/hora/destino. */
  async disable(userId: string): Promise<void> {
    await this.db.update(scheduledExports).set({ enabled: false, updatedAt: new Date() }).where(eq(scheduledExports.userId, userId));
  }

  private assertDaySelectionMatchesFrequency(dto: SaveScheduledExportDto): void {
    if (dto.frequency === 'WEEKLY') {
      if (dto.dayOfWeek === undefined) throw new BadRequestException('Falta el día de la semana para una programación semanal.');
      if (dto.dayOfMonth !== undefined) throw new BadRequestException('El día del mes no aplica a una programación semanal.');
    } else if (dto.frequency === 'MONTHLY') {
      if (dto.dayOfMonth === undefined) throw new BadRequestException('Falta el día del mes para una programación mensual.');
      if (dto.dayOfWeek !== undefined) throw new BadRequestException('El día de la semana no aplica a una programación mensual.');
    } else if (dto.dayOfWeek !== undefined || dto.dayOfMonth !== undefined) {
      throw new BadRequestException('El día de la semana/del mes no aplica a una programación diaria.');
    }
  }

  /**
   * Plan.md §11.4: ejecuta una exportación programada — mismo contenido que
   * H1/H4 (H5 criterio 2), nunca un subconjunto. Deja constancia de la
   * ejecución (`lastRunAt`/`lastRunError`) tanto si va bien como si falla —
   * el llamador (`ScheduledExportsScheduler`) decide qué hacer con el error
   * (loguearlo, no interrumpir a los demás usuarios).
   */
  async run(config: ScheduledExportRow): Promise<void> {
    try {
      if (config.destination === 'LOCAL') {
        await this.writeLocal(config);
      } else {
        // Mismo método que ya usa H4 manual — sin recomponer nada
        // (plan.md §11.7 decisión 7). Si no hay conexión, lanza sola.
        await this.googleDriveService.exportToDrive(config.userId);
      }
      await this.markRun(config.id, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markRun(config.id, message);
      throw err;
    }
  }

  private async markRun(id: string, error: string | null): Promise<void> {
    await this.db.update(scheduledExports).set({ lastRunAt: new Date(), lastRunError: error }).where(eq(scheduledExports.id, id));
  }

  private localDir(): string {
    return this.config.get<string>('SCHEDULED_EXPORT_LOCAL_DIR', './scheduled-exports');
  }

  /** Spec 048 plan.md §3.4: la misma copia `.zip` que la descarga manual (datos y documentos). */
  private async writeLocal(config: ScheduledExportRow): Promise<void> {
    const dir = path.join(this.localDir(), config.userId, sanitizeSubfolder(config.localSubfolder));
    await fs.mkdir(dir, { recursive: true });
    await this.archives.writeArchive(config.userId, path.join(dir, archiveFilename()));
    await this.purgeOldFiles(dir);
  }

  /** Plan.md §11.5: mismo criterio que `deploy/backup.sh` (`-mtime +14 -delete`) — acotado a la carpeta propia del usuario. */
  private async purgeOldFiles(dir: string): Promise<void> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!FILE_NAME_PATTERN.test(entry)) continue;
      const filePath = path.join(dir, entry);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
      }
    }
  }
}
