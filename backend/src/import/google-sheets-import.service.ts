import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { googleSheetsImportConfigs } from '../db/schema/index.js';
import type { GoogleSheetsImportRunResult } from '../db/schema/index.js';
import { GoogleSheetAccessError, GoogleSheetsService } from './google-sheets.service.js';
import { InvalidWorkbookError } from './import.parsing.js';
import { ImportService } from './import.service.js';
import type { ImportConfirmResult } from './import.service.js';

export type GoogleSheetsImportConfig = typeof googleSheetsImportConfigs.$inferSelect;

export interface GoogleSheetsImportConfigView {
  serviceAccountEmail: string;
  spreadsheetId: string | null;
  autoImportEnabled: boolean;
  lastRun: { at: Date; result: GoogleSheetsImportRunResult | null; error: string | null } | null;
}

/**
 * H1-H3 (spec 026). `executeImport` es el tramo común que usan tanto el
 * disparo manual (`runNow`, vía el controller) como el cron (plan.md §6) —
 * ambos acaban escribiendo el mismo resultado en `lastRunAt`/`lastRunResult`/
 * `lastRunError` de la fila del usuario.
 */
@Injectable()
export class GoogleSheetsImportService {
  // plan.md §6: lock en memoria por `userId`, mismo criterio "una sola
  // instancia" ya documentado en la constitution para el rate-limit guard —
  // evita que una ejecución manual y el cron se solapen para el mismo usuario.
  private readonly runningUserIds = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly importService: ImportService,
  ) {}

  async getConfig(userId: string): Promise<GoogleSheetsImportConfigView> {
    const config = await this.findByUserId(userId);
    return this.toView(config);
  }

  /** H1 criterio 2: comprueba acceso antes de guardar — no se persiste una hoja que no se puede leer. */
  async saveConfig(userId: string, rawInput: string): Promise<GoogleSheetsImportConfigView> {
    const spreadsheetId = this.googleSheetsService.extractSpreadsheetId(rawInput);
    if (!spreadsheetId) {
      throw new BadRequestException('No se reconoce como una URL o un ID de Google Sheets válidos.');
    }
    await this.fetchWorkbookOrThrow(spreadsheetId);

    const existing = await this.findByUserId(userId);
    if (existing) {
      const [updated] = await this.db
        .update(googleSheetsImportConfigs)
        .set({ spreadsheetId, updatedAt: new Date() })
        .where(eq(googleSheetsImportConfigs.id, existing.id))
        .returning();
      return this.toView(updated);
    }

    const [created] = await this.db.insert(googleSheetsImportConfigs).values({ userId, spreadsheetId }).returning();
    return this.toView(created);
  }

  /** H1 criterio 3: borra la configuración; no toca los movimientos ya importados. */
  async removeConfig(userId: string): Promise<void> {
    await this.db.delete(googleSheetsImportConfigs).where(eq(googleSheetsImportConfigs.userId, userId));
  }

  /** H3 criterio 1: hace falta una hoja configurada antes de poder activar la automática. */
  async setAutoImport(userId: string, enabled: boolean): Promise<GoogleSheetsImportConfigView> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      throw new BadRequestException('Configura primero tu Google Sheet antes de activar la importación automática.');
    }
    const [updated] = await this.db
      .update(googleSheetsImportConfigs)
      .set({ autoImportEnabled: enabled, updatedAt: new Date() })
      .where(eq(googleSheetsImportConfigs.id, existing.id))
      .returning();
    return this.toView(updated);
  }

  /** H2: ejecución manual — 400 sin hoja configurada, 409 si ya hay una en curso para este usuario. */
  async runNow(userId: string): Promise<ImportConfirmResult> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      throw new BadRequestException('Configura primero tu Google Sheet antes de poder importar.');
    }
    return this.executeImport(existing);
  }

  /** Usado también por el scheduler (plan.md §6) — un fallo se guarda en `lastRunError` y se relanza para que quien llama decida cómo tratarlo. */
  async executeImport(config: GoogleSheetsImportConfig): Promise<ImportConfirmResult> {
    if (this.runningUserIds.has(config.userId)) {
      throw new ConflictException('Ya hay una importación en curso para esta cuenta.');
    }
    this.runningUserIds.add(config.userId);

    try {
      const workbook = await this.fetchWorkbookOrThrow(config.spreadsheetId);
      const result = await this.importService.importWorkbook(config.userId, workbook);
      await this.db
        .update(googleSheetsImportConfigs)
        .set({ lastRunAt: new Date(), lastRunResult: result, lastRunError: null, updatedAt: new Date() })
        .where(eq(googleSheetsImportConfigs.id, config.id));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fallo desconocido al importar desde Google Sheets.';
      await this.db
        .update(googleSheetsImportConfigs)
        .set({ lastRunAt: new Date(), lastRunResult: null, lastRunError: message, updatedAt: new Date() })
        .where(eq(googleSheetsImportConfigs.id, config.id));
      throw err;
    } finally {
      this.runningUserIds.delete(config.userId);
    }
  }

  private async fetchWorkbookOrThrow(spreadsheetId: string) {
    try {
      return await this.googleSheetsService.fetchWorkbook(spreadsheetId);
    } catch (err) {
      if (err instanceof InvalidWorkbookError || err instanceof GoogleSheetAccessError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private async findByUserId(userId: string): Promise<GoogleSheetsImportConfig | undefined> {
    return this.db.query.googleSheetsImportConfigs.findFirst({ where: eq(googleSheetsImportConfigs.userId, userId) });
  }

  private toView(config: GoogleSheetsImportConfig | undefined): GoogleSheetsImportConfigView {
    return {
      serviceAccountEmail: this.googleSheetsService.serviceAccountEmail(),
      spreadsheetId: config?.spreadsheetId ?? null,
      autoImportEnabled: config?.autoImportEnabled ?? false,
      lastRun: config?.lastRunAt ? { at: config.lastRunAt, result: config.lastRunResult, error: config.lastRunError } : null,
    };
  }
}
