import { api } from './client';

// Spec 032 (H2). Espejo de `DataImportSummary`/`TableImportSummary`
// (backend, `data-import/data-import.types.ts`).
export interface TableImportSummary {
  total: number;
  toImport: number;
  alreadyExisting: number;
}

export type DataImportSummary = Record<string, TableImportSummary>;

/** Mismo orden que `ECONOMIC_DATA_TABLE_ORDER` (backend), con la etiqueta en español que se muestra en `BackupPage`. */
export const DATA_TABLE_LABELS: Record<string, string> = {
  categories: 'Categorías',
  transactions: 'Movimientos',
  savingsGoals: 'Objetivos de ahorro',
  expenseBudgets: 'Presupuestos de gasto',
  bankAccounts: 'Cuentas bancarias',
  bankAccountBalances: 'Saldos de cuentas bancarias',
  stocks: 'Acciones',
  stockPurchases: 'Compras de acciones',
  stockSales: 'Ventas de acciones',
  stockValuations: 'Valoraciones de acciones',
  stockDividends: 'Dividendos de acciones',
  funds: 'Fondos de inversión',
  fundPurchases: 'Compras de fondos',
  fundValuations: 'Valoraciones de fondos',
  fundDividends: 'Dividendos de fondos',
  cryptos: 'Cripto',
  cryptoPurchases: 'Compras de cripto',
  cryptoValuations: 'Valoraciones de cripto',
  vehicles: 'Vehículos',
  vehicleValuations: 'Valoraciones de vehículos',
  pensionPlans: 'Planes de pensiones',
  pensionPlanContributions: 'Aportaciones a planes de pensiones',
  pensionPlanValuations: 'Valoraciones de planes de pensiones',
  cashHoldings: 'Efectivo',
  cashBalances: 'Saldos de efectivo',
};

function fileFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/** H2 criterio 4: no escribe nada — solo valida y cuenta. */
export function previewDataImport(file: File): Promise<DataImportSummary> {
  return api.postForm<DataImportSummary>('/data-import/preview', fileFormData(file));
}

/** H2 criterios 2-5: mismo fichero ya seleccionado, se vuelve a subir (mismo criterio que `confirmImport`, spec 003). */
export function confirmDataImport(file: File): Promise<DataImportSummary> {
  return api.postForm<DataImportSummary>('/data-import/confirm', fileFormData(file));
}
