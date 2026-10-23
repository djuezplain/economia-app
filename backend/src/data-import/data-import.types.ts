import type { EconomicData } from '../data-export/account-export.types.js';

/** Spec 032, plan.md §3. Resumen de una tabla: cuántas filas trae el fichero, cuántas se van a importar y cuántas ya existían (mismo id) y se omiten. */
export interface TableImportSummary {
  total: number;
  toImport: number;
  alreadyExisting: number;
  /**
   * Spec 048: filas que no se importan por otro motivo (p. ej. un documento
   * que no viene en el `.zip` o no coincide con su SHA-256). Solo en las
   * tablas que lo calculan.
   */
  omitted?: number;
}

/** Una entrada por cada una de las 24 tablas de `EconomicData` — mismas claves. */
export type DataImportSummary = Record<keyof EconomicData, TableImportSummary>;
