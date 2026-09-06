import { api } from './client';
import type { ImportConfirmResult } from './import';

// H1-H3 (spec 026). Espejo de los tipos de respuesta del backend
// (`GoogleSheetsImportService` — `google-sheets-import.service.ts`).
export interface GoogleSheetsImportConfig {
  serviceAccountEmail: string;
  spreadsheetId: string | null;
  autoImportEnabled: boolean;
  lastRun: { at: string; result: ImportConfirmResult | null; error: string | null } | null;
}

export function getGoogleSheetConfig(): Promise<GoogleSheetsImportConfig> {
  return api.get<GoogleSheetsImportConfig>('/import/google-sheet/config');
}

/** H1 criterio 1-2: `spreadsheetId` admite tanto una URL completa como un ID pelado. */
export function saveGoogleSheetConfig(spreadsheetId: string): Promise<GoogleSheetsImportConfig> {
  return api.put<GoogleSheetsImportConfig>('/import/google-sheet/config', { spreadsheetId });
}

/** H1 criterio 3. */
export function removeGoogleSheetConfig(): Promise<void> {
  return api.delete<void>('/import/google-sheet/config');
}

/** H3 criterios 1 y 4. */
export function setGoogleSheetAutoImport(enabled: boolean): Promise<GoogleSheetsImportConfig> {
  return api.patch<GoogleSheetsImportConfig>('/import/google-sheet/config/auto-import', { enabled });
}

/** H2: importación manual, sin previsualización (plan.md §5). */
export function runGoogleSheetImportNow(): Promise<ImportConfirmResult> {
  return api.post<ImportConfirmResult>('/import/google-sheet/run');
}
