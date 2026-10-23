import { api } from './client';

// Spec 032 (H2). Espejo de `DataImportSummary`/`TableImportSummary`
// (backend, `data-import/data-import.types.ts`).
export interface TableImportSummary {
  total: number;
  toImport: number;
  alreadyExisting: number;
  /**
   * Filas que no se importan: documentos de tickets sin su fichero o con otro
   * SHA-256 (spec 048), o filas que apuntan a datos que no son de la cuenta
   * (spec 050).
   */
  omitted?: number;
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
  fundSales: 'Ventas de fondos',
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
  recurringTransactions: 'Movimientos recurrentes',
  recurringOccurrenceResolutions: 'Ocurrencias recurrentes resueltas',
  recurringReconciliationDismissals: 'Descartes de conciliación de recibos',
  supermarkets: 'Comercios',
  products: 'Productos',
  receipts: 'Tickets y facturas',
  receiptLines: 'Líneas de tickets',
  receiptDocuments: 'Documentos de tickets',
  shoppingLists: 'Listas de la compra',
  shoppingListItems: 'Elementos de listas de la compra',
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
