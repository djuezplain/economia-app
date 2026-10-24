import type {
  bankAccountBalances,
  bankAccounts,
  cashBalances,
  cashHoldings,
  categories,
  cryptoPurchases,
  cryptoValuations,
  cryptos,
  expenseBudgets,
  fundDividends,
  fundPurchases,
  fundSales,
  fundValuations,
  funds,
  pensionPlanContributions,
  pensionPlanValuations,
  pensionPlans,
  recurringOccurrenceResolutions,
  recurringReconciliationDismissals,
  supermarkets,
  products,
  receipts,
  receiptLines,
  shoppingLists,
  shoppingListItems,
  receiptDocuments,
  recurringTransactions,
  savingsGoals,
  stockDividends,
  stockPurchases,
  stockSales,
  stockValuations,
  stocks,
  transactions,
  vehicleValuations,
  vehicles,
} from '../db/schema/index.js';

/**
 * Spec 032, plan.md §1. `formatVersion` deja preparado el terreno para poder
 * rechazar (o migrar) un fichero de una versión futura incompatible sin
 * adivinar — hoy solo existe la versión 1.
 */
export const EXPORT_FORMAT_VERSION = 1 as const;

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type SavingsGoalRow = typeof savingsGoals.$inferSelect;
export type ExpenseBudgetRow = typeof expenseBudgets.$inferSelect;
export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type BankAccountBalanceRow = typeof bankAccountBalances.$inferSelect;
export type StockRow = typeof stocks.$inferSelect;
export type StockPurchaseRow = typeof stockPurchases.$inferSelect;
export type StockSaleRow = typeof stockSales.$inferSelect;
export type StockValuationRow = typeof stockValuations.$inferSelect;
export type StockDividendRow = typeof stockDividends.$inferSelect;
export type FundRow = typeof funds.$inferSelect;
export type FundPurchaseRow = typeof fundPurchases.$inferSelect;
export type FundSaleRow = typeof fundSales.$inferSelect;
export type FundValuationRow = typeof fundValuations.$inferSelect;
export type FundDividendRow = typeof fundDividends.$inferSelect;
export type CryptoRow = typeof cryptos.$inferSelect;
export type CryptoPurchaseRow = typeof cryptoPurchases.$inferSelect;
export type CryptoValuationRow = typeof cryptoValuations.$inferSelect;
export type VehicleRow = typeof vehicles.$inferSelect;
export type VehicleValuationRow = typeof vehicleValuations.$inferSelect;
export type PensionPlanRow = typeof pensionPlans.$inferSelect;
export type PensionPlanContributionRow = typeof pensionPlanContributions.$inferSelect;
export type PensionPlanValuationRow = typeof pensionPlanValuations.$inferSelect;
export type CashHoldingRow = typeof cashHoldings.$inferSelect;
export type CashBalanceRow = typeof cashBalances.$inferSelect;
export type RecurringTransactionRow = typeof recurringTransactions.$inferSelect;
export type RecurringOccurrenceResolutionRow = typeof recurringOccurrenceResolutions.$inferSelect;
export type RecurringReconciliationDismissalRow = typeof recurringReconciliationDismissals.$inferSelect;
export type SupermarketRow = typeof supermarkets.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ReceiptRow = typeof receipts.$inferSelect;
export type ReceiptLineRow = typeof receiptLines.$inferSelect;
export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type ShoppingListItemRow = typeof shoppingListItems.$inferSelect;
/**
 * Spec 048 H1 criterio 6 (plan.md §3.4): metadatos de un documento, nunca el
 * contenido. El binario va en el `.zip`, en la ruta `file`; en una
 * exportación solo `.json` no hay forma de restaurarlo y se omite al importar.
 */
// Spec 051: la miniatura nunca se exporta (se regenera); el texto del OCR entra en T8.1.
export type ReceiptDocumentMeta = Omit<typeof receiptDocuments.$inferSelect, 'content' | 'thumbnail' | 'ocrText' | 'ocrReadAt'> & { file: string };

/**
 * Spec 032, plan.md §1. Todo el dato económico del usuario, en 24 arrays
 * planos (uno por tabla) — ni anidado bajo su entidad padre ni agregado:
 * así el import (spec 032, `data-import/`) puede recorrerlas de forma
 * genérica, tabla a tabla, en vez de reconstruir un árbol.
 *
 * Excluidas a propósito (spec.md §2): `users`, `oauthAccounts`, `sessions`,
 * `emailTokens`, `auditLogs`, `googleSheetsImportConfigs` — ninguna es
 * "dato económico", y varias contienen secretos (hash de contraseña,
 * tokens de sesión/refresh).
 */
export interface EconomicData {
  categories: CategoryRow[];
  transactions: TransactionRow[];
  savingsGoals: SavingsGoalRow[];
  expenseBudgets: ExpenseBudgetRow[];
  bankAccounts: BankAccountRow[];
  bankAccountBalances: BankAccountBalanceRow[];
  stocks: StockRow[];
  stockPurchases: StockPurchaseRow[];
  stockSales: StockSaleRow[];
  stockValuations: StockValuationRow[];
  stockDividends: StockDividendRow[];
  funds: FundRow[];
  fundPurchases: FundPurchaseRow[];
  /** Spec 050: añadida después; una copia antigua puede no traerla. */
  fundSales: FundSaleRow[];
  fundValuations: FundValuationRow[];
  fundDividends: FundDividendRow[];
  cryptos: CryptoRow[];
  cryptoPurchases: CryptoPurchaseRow[];
  cryptoValuations: CryptoValuationRow[];
  vehicles: VehicleRow[];
  vehicleValuations: VehicleValuationRow[];
  pensionPlans: PensionPlanRow[];
  pensionPlanContributions: PensionPlanContributionRow[];
  pensionPlanValuations: PensionPlanValuationRow[];
  cashHoldings: CashHoldingRow[];
  cashBalances: CashBalanceRow[];
  // Spec 047: copias de seguridad anteriores no traen estas dos claves — el import las tolera ausentes (`OPTIONAL_ECONOMIC_DATA_KEYS`).
  recurringTransactions: RecurringTransactionRow[];
  recurringOccurrenceResolutions: RecurringOccurrenceResolutionRow[];
  // Spec 049: "este movimiento no corresponde a esta ocurrencia". Opcional en
  // el import, igual que las dos anteriores. `recurring_reminders_sent` no se
  // exporta: es un registro de operación, no un dato económico (plan.md §3.6).
  recurringReconciliationDismissals: RecurringReconciliationDismissalRow[];
  // Spec 048 (plan.md §0 decisión 2): tickets, comercios, productos y listas
  // de la compra no se exportaban (hueco de la spec 032). Opcionales en el
  // import, como las anteriores.
  supermarkets: SupermarketRow[];
  products: ProductRow[];
  receipts: ReceiptRow[];
  receiptLines: ReceiptLineRow[];
  receiptDocuments: ReceiptDocumentMeta[];
  shoppingLists: ShoppingListRow[];
  shoppingListItems: ShoppingListItemRow[];
}

/**
 * Spec 032, plan.md §1. Forma completa del fichero que descarga
 * `UsersService.exportData()` y que `DataImportService` sabe leer de
 * vuelta. `profile` es puramente informativo (plan.md §2) — el import
 * nunca lo usa para escribir nada.
 */
export interface AccountExportFile {
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  profile: { name: string; currency: string; locale: string };
  economicData: EconomicData;
}

/** Claves de `EconomicData`, en el orden de dependencias por FK (plan.md §3.2) — reutilizado por el import para recorrerlas en el orden correcto. */
export const ECONOMIC_DATA_TABLE_ORDER: (keyof EconomicData)[] = [
  'categories',
  'transactions',
  'savingsGoals',
  'expenseBudgets',
  'bankAccounts',
  'bankAccountBalances',
  'stocks',
  'stockPurchases',
  'stockSales',
  'stockValuations',
  'stockDividends',
  'funds',
  'fundPurchases',
  'fundSales',
  'fundValuations',
  'fundDividends',
  'cryptos',
  'cryptoPurchases',
  'cryptoValuations',
  'vehicles',
  'vehicleValuations',
  'pensionPlans',
  'pensionPlanContributions',
  'pensionPlanValuations',
  'cashHoldings',
  'cashBalances',
  'recurringTransactions',
  'recurringOccurrenceResolutions',
  'recurringReconciliationDismissals',
  'supermarkets',
  'products',
  'receipts',
  'receiptLines',
  'receiptDocuments',
  'shoppingLists',
  'shoppingListItems',
];

/** Spec 047: claves añadidas después de la versión 1 original del formato; un fichero antiguo puede no traerlas. */
export const OPTIONAL_ECONOMIC_DATA_KEYS: (keyof EconomicData)[] = [
  'fundSales',
  'recurringTransactions',
  'recurringOccurrenceResolutions',
  'recurringReconciliationDismissals',
  'supermarkets',
  'products',
  'receipts',
  'receiptLines',
  'receiptDocuments',
  'shoppingLists',
  'shoppingListItems',
];
