import { api } from './client';

// H1/H2 (spec 003). Espejo de los tipos de respuesta del backend
// (`ImportService` — `import.service.ts`).
export interface InvalidImportRow {
  rowNumber: number;
  reason: string;
}

export interface ImportSideSummary {
  validCount: number;
  invalid: InvalidImportRow[];
}

export interface ImportPreviewResult {
  income: ImportSideSummary;
  expense: ImportSideSummary;
  /** Nombres (tal cual en el Excel) de las categorías que se crearían al confirmar. */
  newCategories: string[];
}

export interface ImportConfirmResult {
  income: { importedCount: number; invalid: InvalidImportRow[] };
  expense: { importedCount: number; invalid: InvalidImportRow[] };
  categoriesCreated: string[];
}

function fileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/** H1 criterio 1: no escribe nada — solo valida y mapea. */
export function previewImport(file: File): Promise<ImportPreviewResult> {
  return api.postForm<ImportPreviewResult>('/import/excel/preview', fileFormData(file));
}

/** H1 criterios 2-4: mismo fichero ya seleccionado, se vuelve a subir (plan.md §3, decisión 3). */
export function confirmImport(file: File): Promise<ImportConfirmResult> {
  return api.postForm<ImportConfirmResult>('/import/excel/confirm', fileFormData(file));
}
