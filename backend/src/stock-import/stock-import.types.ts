/** Spec 033, plan.md §3. Misma forma que `TableImportSummary` (spec 032, `data-import.types.ts`) — no se reutiliza el tipo en sí (plan.md §3) para no acoplar los dos módulos solo por 3 campos en común. */
export interface TableImportCount {
  total: number;
  toImport: number;
  alreadyExisting: number;
}

export type StockImportRowStatus = 'new' | 'existing' | 'ambiguous';

export interface StockImportRowSummary {
  /** Columna "Nombre" del CSV, tal cual. */
  name: string;
  status: StockImportRowStatus;
  /** Banco custodia reutilizado (existente), `"-"` si es nueva, `null` si es ambigua (no se importa nada de esta fila). */
  custodyBank: string | null;
  purchases: TableImportCount;
  sales: TableImportCount;
  valuations: TableImportCount;
}

export interface StockImportSummary {
  stocks: StockImportRowSummary[];
  totals: { newStocks: number; existingStocks: number; ambiguousStocks: number };
}
