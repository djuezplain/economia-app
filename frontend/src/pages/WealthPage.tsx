import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { createBankAccount, deleteBankAccount, listBankAccounts, updateBankAccount } from '../api/bank-accounts';
import type { BankAccount, BankAccountInput } from '../api/bank-accounts';
import {
  createBankAccountBalance,
  deleteBankAccountBalance,
  listBankAccountBalances,
  updateBankAccountBalance,
} from '../api/bank-account-balances';
import type { BankAccountBalance, UpdateBankAccountBalanceInput } from '../api/bank-account-balances';
import { createStock, deleteStock, listStocks, updateStock } from '../api/stocks';
import type { Stock, StockInput } from '../api/stocks';
import {
  createStockPurchase,
  deleteStockPurchase,
  listStockPurchases,
  updateStockPurchase,
} from '../api/stock-purchases';
import type { StockPurchase, UpdateStockPurchaseInput } from '../api/stock-purchases';
import {
  createStockValuation,
  deleteStockValuation,
  listStockValuations,
  updateStockValuation,
} from '../api/stock-valuations';
import type { StockValuation, UpdateStockValuationInput } from '../api/stock-valuations';
import { createFund, deleteFund, listFunds, updateFund } from '../api/funds';
import type { Fund, FundInput } from '../api/funds';
import {
  createFundPurchase,
  deleteFundPurchase,
  listFundPurchases,
  updateFundPurchase,
} from '../api/fund-purchases';
import type { FundPurchase, UpdateFundPurchaseInput } from '../api/fund-purchases';
import {
  createFundValuation,
  deleteFundValuation,
  listFundValuations,
  updateFundValuation,
} from '../api/fund-valuations';
import type { FundValuation, UpdateFundValuationInput } from '../api/fund-valuations';
import { createCrypto, deleteCrypto, listCryptos, updateCrypto } from '../api/cryptos';
import type { Crypto, CryptoInput } from '../api/cryptos';
import {
  createCryptoPurchase,
  deleteCryptoPurchase,
  listCryptoPurchases,
  updateCryptoPurchase,
} from '../api/crypto-purchases';
import type { CryptoPurchase, UpdateCryptoPurchaseInput } from '../api/crypto-purchases';
import {
  createCryptoValuation,
  deleteCryptoValuation,
  listCryptoValuations,
  updateCryptoValuation,
} from '../api/crypto-valuations';
import type { CryptoValuation, UpdateCryptoValuationInput } from '../api/crypto-valuations';
import { createVehicle, deleteVehicle, listVehicles, updateVehicle } from '../api/vehicles';
import type { Vehicle, VehicleInput } from '../api/vehicles';
import {
  createVehicleValuation,
  deleteVehicleValuation,
  listVehicleValuations,
  updateVehicleValuation,
} from '../api/vehicle-valuations';
import type { UpdateVehicleValuationInput, VehicleValuation } from '../api/vehicle-valuations';
import { createPensionPlan, deletePensionPlan, listPensionPlans, updatePensionPlan } from '../api/pension-plans';
import type { PensionPlan, PensionPlanInput } from '../api/pension-plans';
import {
  createPensionPlanContribution,
  deletePensionPlanContribution,
  listPensionPlanContributions,
  updatePensionPlanContribution,
} from '../api/pension-plan-contributions';
import type { PensionPlanContribution, UpdatePensionPlanContributionInput } from '../api/pension-plan-contributions';
import {
  createPensionPlanValuation,
  deletePensionPlanValuation,
  listPensionPlanValuations,
  updatePensionPlanValuation,
} from '../api/pension-plan-valuations';
import type { PensionPlanValuation, UpdatePensionPlanValuationInput } from '../api/pension-plan-valuations';
import { ApiError } from '../api/client';
import { formatCurrency } from './home-shared';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_ACCOUNT_FORM: BankAccountInput = { bank: '', accountNumber: '', alias: '' };
const EMPTY_BALANCE_FORM: UpdateBankAccountBalanceInput = { euros: '', date: todayIso() };
const EMPTY_STOCK_FORM: StockInput = { custodyBank: '', stock: '' };
const EMPTY_PURCHASE_FORM: UpdateStockPurchaseInput = { shareCount: '', purchasePrice: '', date: todayIso() };
const EMPTY_VALUATION_FORM: UpdateStockValuationInput = { pricePerShare: '', date: todayIso() };
const EMPTY_FUND_FORM: FundInput = { custodyBank: '', fund: '' };
const EMPTY_FUND_PURCHASE_FORM: UpdateFundPurchaseInput = { shareCount: '', purchasePrice: '', date: todayIso() };
const EMPTY_FUND_VALUATION_FORM: UpdateFundValuationInput = { pricePerShare: '', date: todayIso() };
const EMPTY_CRYPTO_FORM: CryptoInput = { exchange: '', crypto: '' };
const EMPTY_CRYPTO_PURCHASE_FORM: UpdateCryptoPurchaseInput = { quantity: '', purchasePrice: '', date: todayIso() };
const EMPTY_CRYPTO_VALUATION_FORM: UpdateCryptoValuationInput = { pricePerUnit: '', date: todayIso() };
const EMPTY_VEHICLE_FORM: VehicleInput = { brandModel: '', plate: '', purchasePrice: '', purchaseDate: todayIso() };
const EMPTY_VEHICLE_VALUATION_FORM: UpdateVehicleValuationInput = { value: '', date: todayIso() };
const EMPTY_PENSION_PLAN_FORM: PensionPlanInput = { managingEntity: '', plan: '' };
const EMPTY_PENSION_PLAN_CONTRIBUTION_FORM: UpdatePensionPlanContributionInput = { amount: '', date: todayIso() };
const EMPTY_PENSION_PLAN_VALUATION_FORM: UpdatePensionPlanValuationInput = { value: '', date: todayIso() };

/** Formulario "Añadir acción" (nivel superior): crea la acción y su primera
 *  compra en un solo paso (spec 020, revisión §3.bis) — dos llamadas
 *  encadenadas (`createStock` + `createStockPurchase`), un solo formulario. */
type NewStockForm = StockInput & { shareCount: string; purchasePrice: string; date: string };

function emptyNewStockForm(): NewStockForm {
  return { custodyBank: '', stock: '', shareCount: '', purchasePrice: '', date: todayIso() };
}

/** Formulario "Añadir fondo" (nivel superior): mismo criterio que
 *  `NewStockForm` (spec 021, mismo modelo que spec 020) — crea el fondo y su
 *  primera compra en un solo paso. */
type NewFundForm = FundInput & { shareCount: string; purchasePrice: string; date: string };

function emptyNewFundForm(): NewFundForm {
  return { custodyBank: '', fund: '', shareCount: '', purchasePrice: '', date: todayIso() };
}

/** Formulario "Añadir posición" de Cripto (spec 022): mismo patrón en un solo paso que
 *  "Añadir acción" (spec 020, revisión §3.bis) — crea la posición y su primera compra juntas. */
type NewCryptoForm = CryptoInput & { quantity: string; purchasePrice: string; date: string };

function emptyNewCryptoForm(): NewCryptoForm {
  return { exchange: '', crypto: '', quantity: '', purchasePrice: '', date: todayIso() };
}

/** Formulario "Añadir plan" de Fondo Pensiones (spec 024): mismo patrón en un solo paso que
 *  "Añadir posición" de Cripto (spec 022), pero sin cantidad/precio — la primera aportación
 *  es solo un importe (decisión explícita con Diego, spec.md §3). */
type NewPensionPlanForm = PensionPlanInput & { amount: string; date: string };

function emptyNewPensionPlanForm(): NewPensionPlanForm {
  return { managingEntity: '', plan: '', amount: '', date: todayIso() };
}

function accountFormFromEntity(account: BankAccount): BankAccountInput {
  return { bank: account.bank, accountNumber: account.accountNumber, alias: account.alias ?? '' };
}

/** Espejo accesible del alias (spec 021): usado en textos y `aria-label` para
 *  no perder el contexto banco + número de cuenta cuando la cuenta ya tiene alias. */
function accountLabel(account: BankAccount): string {
  return account.alias ? `${account.alias} (${account.bank} · ${account.accountNumber})` : `${account.bank} · ${account.accountNumber}`;
}

function balanceFormFromEntity(balance: BankAccountBalance): UpdateBankAccountBalanceInput {
  return { euros: balance.euros, date: balance.date };
}

function stockFormFromEntity(stock: Stock): StockInput {
  return { custodyBank: stock.custodyBank, stock: stock.stock };
}

function purchaseFormFromEntity(purchase: StockPurchase): UpdateStockPurchaseInput {
  return { shareCount: purchase.shareCount, purchasePrice: purchase.purchasePrice, date: purchase.date };
}

function valuationFormFromEntity(valuation: StockValuation): UpdateStockValuationInput {
  return { pricePerShare: valuation.pricePerShare, date: valuation.date };
}

function fundFormFromEntity(fund: Fund): FundInput {
  return { custodyBank: fund.custodyBank, fund: fund.fund };
}

function fundPurchaseFormFromEntity(purchase: FundPurchase): UpdateFundPurchaseInput {
  return { shareCount: purchase.shareCount, purchasePrice: purchase.purchasePrice, date: purchase.date };
}

function fundValuationFormFromEntity(valuation: FundValuation): UpdateFundValuationInput {
  return { pricePerShare: valuation.pricePerShare, date: valuation.date };
}

function cryptoFormFromEntity(crypto: Crypto): CryptoInput {
  return { exchange: crypto.exchange, crypto: crypto.crypto };
}

function cryptoPurchaseFormFromEntity(purchase: CryptoPurchase): UpdateCryptoPurchaseInput {
  return { quantity: purchase.quantity, purchasePrice: purchase.purchasePrice, date: purchase.date };
}

function cryptoValuationFormFromEntity(valuation: CryptoValuation): UpdateCryptoValuationInput {
  return { pricePerUnit: valuation.pricePerUnit, date: valuation.date };
}

function vehicleFormFromEntity(vehicle: Vehicle): VehicleInput {
  return { brandModel: vehicle.brandModel, plate: vehicle.plate, purchasePrice: vehicle.purchasePrice, purchaseDate: vehicle.purchaseDate };
}

/** Espejo accesible del vehículo (spec 023): mismo criterio que `accountLabel` (spec 021). */
function vehicleLabel(vehicle: Vehicle): string {
  return `${vehicle.brandModel} · ${vehicle.plate}`;
}

function vehicleValuationFormFromEntity(valuation: VehicleValuation): UpdateVehicleValuationInput {
  return { value: valuation.value, date: valuation.date };
}

function pensionPlanFormFromEntity(plan: PensionPlan): PensionPlanInput {
  return { managingEntity: plan.managingEntity, plan: plan.plan };
}

/** Espejo accesible del plan (spec 024): mismo criterio que `vehicleLabel` (spec 023). */
function pensionPlanLabel(plan: PensionPlan): string {
  return `${plan.plan} · ${plan.managingEntity}`;
}

function pensionPlanContributionFormFromEntity(contribution: PensionPlanContribution): UpdatePensionPlanContributionInput {
  return { amount: contribution.amount, date: contribution.date };
}

function pensionPlanValuationFormFromEntity(valuation: PensionPlanValuation): UpdatePensionPlanValuationInput {
  return { value: valuation.value, date: valuation.date };
}

/** H2 criterio 3 (spec 020): calculado, nunca guardado — ver `wealth.calculations.ts` en el backend. */
function purchaseValue(purchasePrice: string, shareCount: string): string {
  const price = parseFloat(purchasePrice);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** H2 criterio 4 (spec 020): nº total de acciones/participaciones de una posición, sumando todas sus
 *  compras — calculado, nunca guardado. 8 decimales, no 4 — mismo criterio de precisión que `shareCount`
 *  (revisión). Tipo estructural (no `StockPurchase[]`/`FundPurchase[]`): mismo cálculo para acciones y
 *  fondos de inversión (spec 021, mismo modelo que spec 020). */
function totalShares(purchases: Array<{ shareCount: string }>): string {
  return purchases.reduce((sum, p) => sum + parseFloat(p.shareCount), 0).toFixed(8);
}

/** H2 criterio 4 (spec 020): coste total de una posición, sumando el valor de compra de todas sus compras. */
function totalCost(purchases: Array<{ shareCount: string; purchasePrice: string }>): string {
  return purchases.reduce((sum, p) => sum + parseFloat(purchaseValue(p.purchasePrice, p.shareCount) || '0'), 0).toFixed(2);
}

/** H3 criterio 1/3 (spec 020, revisión §3.ter): valor actual de la posición = precio por
 *  acción de la valoración más reciente × nº total de acciones — calculado, nunca guardado. */
function currentValue(pricePerShare: string, shareCount: string): string {
  const price = parseFloat(pricePerShare);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** % de ganancia o pérdida = (Valor actual − Coste total) / Coste total × 100 — calculado,
 *  nunca guardado. `null` sin coste (ninguna compra todavía): no hay base sobre la que calcular un %. */
function gainLossPercent(currentVal: string, cost: string): number | null {
  const value = parseFloat(currentVal);
  const costNum = parseFloat(cost);
  if (Number.isNaN(value) || Number.isNaN(costNum) || costNum === 0) return null;
  return ((value - costNum) / costNum) * 100;
}

/** H2 criterio 4 (spec 022): cantidad total de una posición de cripto, sumando todas sus compras
 *  — calculado, nunca guardado. Mismo patrón que `totalShares`, sobre `quantity` en vez de `shareCount`. */
function totalCryptoQuantity(purchases: CryptoPurchase[]): string {
  return purchases.reduce((sum, p) => sum + parseFloat(p.quantity), 0).toFixed(8);
}

/** H2 criterio 4 (spec 022): coste total de una posición de cripto, sumando el valor de compra
 *  (`purchaseValue`, reutilizada tal cual) de todas sus compras. */
function totalCryptoCost(purchases: CryptoPurchase[]): string {
  return purchases.reduce((sum, p) => sum + parseFloat(purchaseValue(p.purchasePrice, p.quantity) || '0'), 0).toFixed(2);
}

/** Resumen (parte superior de la página): sumatorio del último saldo de cada cuenta bancaria
 *  — calculado, nunca guardado. Una cuenta sin ningún saldo aún contribuye 0, mismo criterio
 *  que "Sin saldo" en su propia tarjeta. */
function bankAccountsTotal(accounts: BankAccount[], balances: BankAccountBalance[]): string {
  return accounts
    .reduce((sum, account) => {
      const lastBalance = balances.find((b) => b.bankAccountId === account.id); // ya ordenado por fecha descendente
      return sum + (lastBalance ? parseFloat(lastBalance.euros) : 0);
    }, 0)
    .toFixed(2);
}

/** Resumen (parte superior de la página): sumatorio del valor actual de cada acción — mismo
 *  criterio que `currentValue`. Una acción sin ninguna valoración aún contribuye 0, mismo
 *  criterio que "Sin valoración" en su propia tarjeta. */
function stocksTotal(stocks: Stock[], purchases: StockPurchase[], valuations: StockValuation[]): string {
  return stocks
    .reduce((sum, stock) => {
      const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
      const lastValuation = valuations.find((v) => v.stockId === stock.id); // ya ordenado por fecha descendente
      if (!lastValuation) return sum;
      return sum + parseFloat(currentValue(lastValuation.pricePerShare, totalShares(stockPurchases)));
    }, 0)
    .toFixed(2);
}

/** Resumen (parte superior de la página): sumatorio del valor actual de cada fondo — mismo criterio
 *  que `stocksTotal` (spec 021, mismo modelo que spec 020). Un fondo sin ninguna valoración aún
 *  contribuye 0, mismo criterio que "Sin valoración" en su propia tarjeta. */
function fundsTotal(funds: Fund[], purchases: FundPurchase[], valuations: FundValuation[]): string {
  return funds
    .reduce((sum, fund) => {
      const fundPurchases = purchases.filter((p) => p.fundId === fund.id);
      const lastValuation = valuations.find((v) => v.fundId === fund.id); // ya ordenado por fecha descendente
      if (!lastValuation) return sum;
      return sum + parseFloat(currentValue(lastValuation.pricePerShare, totalShares(fundPurchases)));
    }, 0)
    .toFixed(2);
}

/** H4 (spec 022): cuarto sumando de la tarjeta "Total" — mismo criterio que `stocksTotal`/`fundsTotal`. */
function cryptosTotal(cryptos: Crypto[], purchases: CryptoPurchase[], valuations: CryptoValuation[]): string {
  return cryptos
    .reduce((sum, crypto) => {
      const cryptoPurchases = purchases.filter((p) => p.cryptoId === crypto.id);
      const lastValuation = valuations.find((v) => v.cryptoId === crypto.id); // ya ordenado por fecha descendente
      if (!lastValuation) return sum;
      return sum + parseFloat(currentValue(lastValuation.pricePerUnit, totalCryptoQuantity(cryptoPurchases)));
    }, 0)
    .toFixed(2);
}

/** H3 (spec 023): quinto sumando de la tarjeta "Total" — mismo criterio que `bankAccountsTotal`
 *  (último valor conocido de cada posición, o 0 si no tiene ninguna valoración todavía), sin
 *  multiplicar por ninguna cantidad (a diferencia de `stocksTotal`/`fundsTotal`/`cryptosTotal`):
 *  un vehículo no tiene "cantidad". */
function vehiclesTotal(vehicles: Vehicle[], valuations: VehicleValuation[]): string {
  return vehicles
    .reduce((sum, vehicle) => {
      const lastValuation = valuations.find((v) => v.vehicleId === vehicle.id); // ya ordenado por fecha descendente
      return sum + (lastValuation ? parseFloat(lastValuation.value) : 0);
    }, 0)
    .toFixed(2);
}

/** H2 criterio 4 (spec 024): total aportado a un plan de pensiones, sumando todas sus aportaciones
 *  — calculado, nunca guardado. Suma directa de importes, sin cantidad ni precio que multiplicar
 *  (a diferencia de `totalCost`/`totalCryptoCost`; decisión explícita con Diego, spec.md §3). */
function totalContributions(contributions: PensionPlanContribution[]): string {
  return contributions.reduce((sum, c) => sum + parseFloat(c.amount), 0).toFixed(2);
}

/** H4 (spec 024): sexto sumando de la tarjeta "Total" — mismo criterio que `vehiclesTotal`
 *  (último valor conocido de cada posición, o 0 si no tiene ninguna valoración todavía). */
function pensionPlansTotal(plans: PensionPlan[], valuations: PensionPlanValuation[]): string {
  return plans
    .reduce((sum, plan) => {
      const lastValuation = valuations.find((v) => v.pensionPlanId === plan.id); // ya ordenado por fecha descendente
      return sum + (lastValuation ? parseFloat(lastValuation.value) : 0);
    }, 0)
    .toFixed(2);
}

/** La única categoría de spec 018 §2 que sigue sin funcionalidad tras spec 024
 *  (H1 criterio 3, spec 018). */
const PLACEHOLDER_SECTIONS = [{ icon: '💵', label: 'Efectivo' }];

/**
 * Spec 018 (Resumen Patrimonio) / spec 019 (cuentas bancarias únicas, con
 * historial de saldos) / spec 020 (acciones únicas, con historial de
 * compras y de valoraciones). 7 secciones plegables (H1 criterio 1/2 de
 * spec 018, mismo patrón `<details className="dashboard-section">` que el
 * Dashboard, spec 016/017): "Cuentas Bancarias" en dos niveles (cuenta →
 * historial de saldos anidado, spec 019), "Acciones" en tres niveles
 * (acción → historial de compras + historial de valoraciones anidados,
 * spec 020), las otras 5 con un aviso de "Próximamente.".
 */
export function WealthPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isOnline = useConnectivity();

  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);
  const [newAccountForm, setNewAccountForm] = useState<BankAccountInput>(EMPTY_ACCOUNT_FORM);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountForm, setEditingAccountForm] = useState<BankAccountInput>(EMPTY_ACCOUNT_FORM);
  const [editAccountError, setEditAccountError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);

  const [balances, setBalances] = useState<BankAccountBalance[] | null>(null);
  const [balancesLoadError, setBalancesLoadError] = useState<string | null>(null);
  const [newBalanceForms, setNewBalanceForms] = useState<Record<string, UpdateBankAccountBalanceInput>>({});
  const [createBalanceError, setCreateBalanceError] = useState<string | null>(null);
  const [creatingBalanceForAccountId, setCreatingBalanceForAccountId] = useState<string | null>(null);
  const [editingBalanceId, setEditingBalanceId] = useState<string | null>(null);
  const [editingBalanceForm, setEditingBalanceForm] = useState<UpdateBankAccountBalanceInput>(EMPTY_BALANCE_FORM);
  const [editBalanceError, setEditBalanceError] = useState<string | null>(null);
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [pendingDeleteBalanceId, setPendingDeleteBalanceId] = useState<string | null>(null);
  const [balanceActionError, setBalanceActionError] = useState<string | null>(null);

  const [stockList, setStockList] = useState<Stock[] | null>(null);
  const [stocksLoadError, setStocksLoadError] = useState<string | null>(null);
  const [newStockForm, setNewStockForm] = useState<NewStockForm>(emptyNewStockForm);
  const [createStockError, setCreateStockError] = useState<string | null>(null);
  const [isCreatingStock, setIsCreatingStock] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockForm, setEditingStockForm] = useState<StockInput>(EMPTY_STOCK_FORM);
  const [editStockError, setEditStockError] = useState<string | null>(null);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [pendingDeleteStockId, setPendingDeleteStockId] = useState<string | null>(null);
  const [stockActionError, setStockActionError] = useState<string | null>(null);

  const [purchases, setPurchases] = useState<StockPurchase[] | null>(null);
  const [purchasesLoadError, setPurchasesLoadError] = useState<string | null>(null);
  const [newPurchaseForms, setNewPurchaseForms] = useState<Record<string, UpdateStockPurchaseInput>>({});
  const [createPurchaseError, setCreatePurchaseError] = useState<string | null>(null);
  const [creatingPurchaseForStockId, setCreatingPurchaseForStockId] = useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editingPurchaseForm, setEditingPurchaseForm] = useState<UpdateStockPurchaseInput>(EMPTY_PURCHASE_FORM);
  const [editPurchaseError, setEditPurchaseError] = useState<string | null>(null);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);
  const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<string | null>(null);
  const [purchaseActionError, setPurchaseActionError] = useState<string | null>(null);

  const [valuations, setValuations] = useState<StockValuation[] | null>(null);
  const [valuationsLoadError, setValuationsLoadError] = useState<string | null>(null);
  const [newValuationForms, setNewValuationForms] = useState<Record<string, UpdateStockValuationInput>>({});
  const [createValuationError, setCreateValuationError] = useState<string | null>(null);
  const [creatingValuationForStockId, setCreatingValuationForStockId] = useState<string | null>(null);
  const [editingValuationId, setEditingValuationId] = useState<string | null>(null);
  const [editingValuationForm, setEditingValuationForm] = useState<UpdateStockValuationInput>(EMPTY_VALUATION_FORM);
  const [editValuationError, setEditValuationError] = useState<string | null>(null);
  const [isSavingValuation, setIsSavingValuation] = useState(false);
  const [pendingDeleteValuationId, setPendingDeleteValuationId] = useState<string | null>(null);
  const [valuationActionError, setValuationActionError] = useState<string | null>(null);

  const [fundList, setFundList] = useState<Fund[] | null>(null);
  const [fundsLoadError, setFundsLoadError] = useState<string | null>(null);
  const [newFundForm, setNewFundForm] = useState<NewFundForm>(emptyNewFundForm);
  const [createFundError, setCreateFundError] = useState<string | null>(null);
  const [isCreatingFund, setIsCreatingFund] = useState(false);
  const [editingFundId, setEditingFundId] = useState<string | null>(null);
  const [editingFundForm, setEditingFundForm] = useState<FundInput>(EMPTY_FUND_FORM);
  const [editFundError, setEditFundError] = useState<string | null>(null);
  const [isSavingFund, setIsSavingFund] = useState(false);
  const [pendingDeleteFundId, setPendingDeleteFundId] = useState<string | null>(null);
  const [fundActionError, setFundActionError] = useState<string | null>(null);

  const [fundPurchases, setFundPurchases] = useState<FundPurchase[] | null>(null);
  const [fundPurchasesLoadError, setFundPurchasesLoadError] = useState<string | null>(null);
  const [newFundPurchaseForms, setNewFundPurchaseForms] = useState<Record<string, UpdateFundPurchaseInput>>({});
  const [createFundPurchaseError, setCreateFundPurchaseError] = useState<string | null>(null);
  const [creatingFundPurchaseForFundId, setCreatingFundPurchaseForFundId] = useState<string | null>(null);
  const [editingFundPurchaseId, setEditingFundPurchaseId] = useState<string | null>(null);
  const [editingFundPurchaseForm, setEditingFundPurchaseForm] = useState<UpdateFundPurchaseInput>(EMPTY_FUND_PURCHASE_FORM);
  const [editFundPurchaseError, setEditFundPurchaseError] = useState<string | null>(null);
  const [isSavingFundPurchase, setIsSavingFundPurchase] = useState(false);
  const [pendingDeleteFundPurchaseId, setPendingDeleteFundPurchaseId] = useState<string | null>(null);
  const [fundPurchaseActionError, setFundPurchaseActionError] = useState<string | null>(null);

  const [fundValuations, setFundValuations] = useState<FundValuation[] | null>(null);
  const [fundValuationsLoadError, setFundValuationsLoadError] = useState<string | null>(null);
  const [newFundValuationForms, setNewFundValuationForms] = useState<Record<string, UpdateFundValuationInput>>({});
  const [createFundValuationError, setCreateFundValuationError] = useState<string | null>(null);
  const [creatingFundValuationForFundId, setCreatingFundValuationForFundId] = useState<string | null>(null);
  const [editingFundValuationId, setEditingFundValuationId] = useState<string | null>(null);
  const [editingFundValuationForm, setEditingFundValuationForm] = useState<UpdateFundValuationInput>(EMPTY_FUND_VALUATION_FORM);
  const [editFundValuationError, setEditFundValuationError] = useState<string | null>(null);
  const [isSavingFundValuation, setIsSavingFundValuation] = useState(false);
  const [pendingDeleteFundValuationId, setPendingDeleteFundValuationId] = useState<string | null>(null);
  const [fundValuationActionError, setFundValuationActionError] = useState<string | null>(null);

  const [cryptoList, setCryptoList] = useState<Crypto[] | null>(null);
  const [cryptosLoadError, setCryptosLoadError] = useState<string | null>(null);
  const [newCryptoForm, setNewCryptoForm] = useState<NewCryptoForm>(emptyNewCryptoForm);
  const [createCryptoError, setCreateCryptoError] = useState<string | null>(null);
  const [isCreatingCrypto, setIsCreatingCrypto] = useState(false);
  const [editingCryptoId, setEditingCryptoId] = useState<string | null>(null);
  const [editingCryptoForm, setEditingCryptoForm] = useState<CryptoInput>(EMPTY_CRYPTO_FORM);
  const [editCryptoError, setEditCryptoError] = useState<string | null>(null);
  const [isSavingCrypto, setIsSavingCrypto] = useState(false);
  const [pendingDeleteCryptoId, setPendingDeleteCryptoId] = useState<string | null>(null);
  const [cryptoActionError, setCryptoActionError] = useState<string | null>(null);

  const [cryptoPurchaseList, setCryptoPurchaseList] = useState<CryptoPurchase[] | null>(null);
  const [cryptoPurchasesLoadError, setCryptoPurchasesLoadError] = useState<string | null>(null);
  const [newCryptoPurchaseForms, setNewCryptoPurchaseForms] = useState<Record<string, UpdateCryptoPurchaseInput>>({});
  const [createCryptoPurchaseError, setCreateCryptoPurchaseError] = useState<string | null>(null);
  const [creatingCryptoPurchaseForCryptoId, setCreatingCryptoPurchaseForCryptoId] = useState<string | null>(null);
  const [editingCryptoPurchaseId, setEditingCryptoPurchaseId] = useState<string | null>(null);
  const [editingCryptoPurchaseForm, setEditingCryptoPurchaseForm] = useState<UpdateCryptoPurchaseInput>(EMPTY_CRYPTO_PURCHASE_FORM);
  const [editCryptoPurchaseError, setEditCryptoPurchaseError] = useState<string | null>(null);
  const [isSavingCryptoPurchase, setIsSavingCryptoPurchase] = useState(false);
  const [pendingDeleteCryptoPurchaseId, setPendingDeleteCryptoPurchaseId] = useState<string | null>(null);
  const [cryptoPurchaseActionError, setCryptoPurchaseActionError] = useState<string | null>(null);

  const [cryptoValuationList, setCryptoValuationList] = useState<CryptoValuation[] | null>(null);
  const [cryptoValuationsLoadError, setCryptoValuationsLoadError] = useState<string | null>(null);
  const [newCryptoValuationForms, setNewCryptoValuationForms] = useState<Record<string, UpdateCryptoValuationInput>>({});
  const [createCryptoValuationError, setCreateCryptoValuationError] = useState<string | null>(null);
  const [creatingCryptoValuationForCryptoId, setCreatingCryptoValuationForCryptoId] = useState<string | null>(null);
  const [editingCryptoValuationId, setEditingCryptoValuationId] = useState<string | null>(null);
  const [editingCryptoValuationForm, setEditingCryptoValuationForm] = useState<UpdateCryptoValuationInput>(EMPTY_CRYPTO_VALUATION_FORM);
  const [editCryptoValuationError, setEditCryptoValuationError] = useState<string | null>(null);
  const [isSavingCryptoValuation, setIsSavingCryptoValuation] = useState(false);
  const [pendingDeleteCryptoValuationId, setPendingDeleteCryptoValuationId] = useState<string | null>(null);
  const [cryptoValuationActionError, setCryptoValuationActionError] = useState<string | null>(null);

  const [vehicleList, setVehicleList] = useState<Vehicle[] | null>(null);
  const [vehiclesLoadError, setVehiclesLoadError] = useState<string | null>(null);
  const [newVehicleForm, setNewVehicleForm] = useState<VehicleInput>(EMPTY_VEHICLE_FORM);
  const [createVehicleError, setCreateVehicleError] = useState<string | null>(null);
  const [isCreatingVehicle, setIsCreatingVehicle] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingVehicleForm, setEditingVehicleForm] = useState<VehicleInput>(EMPTY_VEHICLE_FORM);
  const [editVehicleError, setEditVehicleError] = useState<string | null>(null);
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [pendingDeleteVehicleId, setPendingDeleteVehicleId] = useState<string | null>(null);
  const [vehicleActionError, setVehicleActionError] = useState<string | null>(null);

  const [vehicleValuationList, setVehicleValuationList] = useState<VehicleValuation[] | null>(null);
  const [vehicleValuationsLoadError, setVehicleValuationsLoadError] = useState<string | null>(null);
  const [newVehicleValuationForms, setNewVehicleValuationForms] = useState<Record<string, UpdateVehicleValuationInput>>({});
  const [createVehicleValuationError, setCreateVehicleValuationError] = useState<string | null>(null);
  const [creatingVehicleValuationForVehicleId, setCreatingVehicleValuationForVehicleId] = useState<string | null>(null);
  const [editingVehicleValuationId, setEditingVehicleValuationId] = useState<string | null>(null);
  const [editingVehicleValuationForm, setEditingVehicleValuationForm] =
    useState<UpdateVehicleValuationInput>(EMPTY_VEHICLE_VALUATION_FORM);
  const [editVehicleValuationError, setEditVehicleValuationError] = useState<string | null>(null);
  const [isSavingVehicleValuation, setIsSavingVehicleValuation] = useState(false);
  const [pendingDeleteVehicleValuationId, setPendingDeleteVehicleValuationId] = useState<string | null>(null);
  const [vehicleValuationActionError, setVehicleValuationActionError] = useState<string | null>(null);

  const [pensionPlanList, setPensionPlanList] = useState<PensionPlan[] | null>(null);
  const [pensionPlansLoadError, setPensionPlansLoadError] = useState<string | null>(null);
  const [newPensionPlanForm, setNewPensionPlanForm] = useState<NewPensionPlanForm>(emptyNewPensionPlanForm);
  const [createPensionPlanError, setCreatePensionPlanError] = useState<string | null>(null);
  const [isCreatingPensionPlan, setIsCreatingPensionPlan] = useState(false);
  const [editingPensionPlanId, setEditingPensionPlanId] = useState<string | null>(null);
  const [editingPensionPlanForm, setEditingPensionPlanForm] = useState<PensionPlanInput>(EMPTY_PENSION_PLAN_FORM);
  const [editPensionPlanError, setEditPensionPlanError] = useState<string | null>(null);
  const [isSavingPensionPlan, setIsSavingPensionPlan] = useState(false);
  const [pendingDeletePensionPlanId, setPendingDeletePensionPlanId] = useState<string | null>(null);
  const [pensionPlanActionError, setPensionPlanActionError] = useState<string | null>(null);

  const [pensionPlanContributionList, setPensionPlanContributionList] = useState<PensionPlanContribution[] | null>(null);
  const [pensionPlanContributionsLoadError, setPensionPlanContributionsLoadError] = useState<string | null>(null);
  const [newPensionPlanContributionForms, setNewPensionPlanContributionForms] = useState<
    Record<string, UpdatePensionPlanContributionInput>
  >({});
  const [createPensionPlanContributionError, setCreatePensionPlanContributionError] = useState<string | null>(null);
  const [creatingPensionPlanContributionForPlanId, setCreatingPensionPlanContributionForPlanId] = useState<string | null>(null);
  const [editingPensionPlanContributionId, setEditingPensionPlanContributionId] = useState<string | null>(null);
  const [editingPensionPlanContributionForm, setEditingPensionPlanContributionForm] =
    useState<UpdatePensionPlanContributionInput>(EMPTY_PENSION_PLAN_CONTRIBUTION_FORM);
  const [editPensionPlanContributionError, setEditPensionPlanContributionError] = useState<string | null>(null);
  const [isSavingPensionPlanContribution, setIsSavingPensionPlanContribution] = useState(false);
  const [pendingDeletePensionPlanContributionId, setPendingDeletePensionPlanContributionId] = useState<string | null>(null);
  const [pensionPlanContributionActionError, setPensionPlanContributionActionError] = useState<string | null>(null);

  const [pensionPlanValuationList, setPensionPlanValuationList] = useState<PensionPlanValuation[] | null>(null);
  const [pensionPlanValuationsLoadError, setPensionPlanValuationsLoadError] = useState<string | null>(null);
  const [newPensionPlanValuationForms, setNewPensionPlanValuationForms] = useState<Record<string, UpdatePensionPlanValuationInput>>({});
  const [createPensionPlanValuationError, setCreatePensionPlanValuationError] = useState<string | null>(null);
  const [creatingPensionPlanValuationForPlanId, setCreatingPensionPlanValuationForPlanId] = useState<string | null>(null);
  const [editingPensionPlanValuationId, setEditingPensionPlanValuationId] = useState<string | null>(null);
  const [editingPensionPlanValuationForm, setEditingPensionPlanValuationForm] =
    useState<UpdatePensionPlanValuationInput>(EMPTY_PENSION_PLAN_VALUATION_FORM);
  const [editPensionPlanValuationError, setEditPensionPlanValuationError] = useState<string | null>(null);
  const [isSavingPensionPlanValuation, setIsSavingPensionPlanValuation] = useState(false);
  const [pendingDeletePensionPlanValuationId, setPendingDeletePensionPlanValuationId] = useState<string | null>(null);
  const [pensionPlanValuationActionError, setPensionPlanValuationActionError] = useState<string | null>(null);

  async function reloadAccounts() {
    setAccounts(await listBankAccounts());
  }

  async function reloadBalances() {
    setBalances(await listBankAccountBalances());
  }

  async function reloadStocks() {
    setStockList(await listStocks());
  }

  async function reloadPurchases() {
    setPurchases(await listStockPurchases());
  }

  async function reloadValuations() {
    setValuations(await listStockValuations());
  }

  async function reloadFunds() {
    setFundList(await listFunds());
  }

  async function reloadFundPurchases() {
    setFundPurchases(await listFundPurchases());
  }

  async function reloadFundValuations() {
    setFundValuations(await listFundValuations());
  }

  async function reloadCryptos() {
    setCryptoList(await listCryptos());
  }

  async function reloadCryptoPurchases() {
    setCryptoPurchaseList(await listCryptoPurchases());
  }

  async function reloadCryptoValuations() {
    setCryptoValuationList(await listCryptoValuations());
  }

  async function reloadVehicles() {
    setVehicleList(await listVehicles());
  }

  async function reloadVehicleValuations() {
    setVehicleValuationList(await listVehicleValuations());
  }

  async function reloadPensionPlans() {
    setPensionPlanList(await listPensionPlans());
  }

  async function reloadPensionPlanContributions() {
    setPensionPlanContributionList(await listPensionPlanContributions());
  }

  async function reloadPensionPlanValuations() {
    setPensionPlanValuationList(await listPensionPlanValuations());
  }

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadAccounts();
      } catch (err) {
        if (!cancelled) setAccountsLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las cuentas bancarias.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadBalances();
      } catch (err) {
        if (!cancelled) setBalancesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de saldos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadStocks();
      } catch (err) {
        if (!cancelled) setStocksLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las acciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadPurchases();
      } catch (err) {
        if (!cancelled) setPurchasesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de compras.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadValuations();
      } catch (err) {
        if (!cancelled) setValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadFunds();
      } catch (err) {
        if (!cancelled) setFundsLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los fondos de inversión.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadFundPurchases();
      } catch (err) {
        if (!cancelled) setFundPurchasesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de compras.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadFundValuations();
      } catch (err) {
        if (!cancelled)
          setFundValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadCryptos();
      } catch (err) {
        if (!cancelled) setCryptosLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las posiciones de cripto.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadCryptoPurchases();
      } catch (err) {
        if (!cancelled) setCryptoPurchasesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de compras.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadCryptoValuations();
      } catch (err) {
        if (!cancelled)
          setCryptoValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadVehicles();
      } catch (err) {
        if (!cancelled) setVehiclesLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los vehículos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadVehicleValuations();
      } catch (err) {
        if (!cancelled)
          setVehicleValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadPensionPlans();
      } catch (err) {
        if (!cancelled) setPensionPlansLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar los planes de pensiones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadPensionPlanContributions();
      } catch (err) {
        if (!cancelled)
          setPensionPlanContributionsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de aportaciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadPensionPlanValuations();
      } catch (err) {
        if (!cancelled)
          setPensionPlanValuationsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de valoraciones.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isOnline]);

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateAccountError(null);
    setIsCreatingAccount(true);
    try {
      await createBankAccount(newAccountForm);
      setNewAccountForm(EMPTY_ACCOUNT_FORM);
      await reloadAccounts();
    } catch (err) {
      setCreateAccountError(err instanceof ApiError ? err.message : 'No se ha podido crear la cuenta.');
    } finally {
      setIsCreatingAccount(false);
    }
  }

  function startEditAccount(account: BankAccount) {
    setEditAccountError(null);
    setEditingAccountId(account.id);
    setEditingAccountForm(accountFormFromEntity(account));
  }

  async function handleEditAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccountId) return;
    setEditAccountError(null);
    setIsSavingAccount(true);
    try {
      await updateBankAccount(editingAccountId, editingAccountForm);
      setEditingAccountId(null);
      await reloadAccounts();
    } catch (err) {
      setEditAccountError(err instanceof ApiError ? err.message : 'No se ha podido guardar la cuenta.');
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    setAccountActionError(null);
    setPendingDeleteAccountId(id);
    try {
      await deleteBankAccount(id);
      await Promise.all([reloadAccounts(), reloadBalances()]);
    } catch (err) {
      setAccountActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la cuenta.');
    } finally {
      setPendingDeleteAccountId(null);
    }
  }

  function getNewBalanceForm(accountId: string): UpdateBankAccountBalanceInput {
    return newBalanceForms[accountId] ?? { euros: '', date: todayIso() };
  }

  function setNewBalanceForm(accountId: string, form: UpdateBankAccountBalanceInput) {
    setNewBalanceForms((prev) => ({ ...prev, [accountId]: form }));
  }

  async function handleCreateBalance(accountId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBalanceError(null);
    setCreatingBalanceForAccountId(accountId);
    try {
      const form = getNewBalanceForm(accountId);
      await createBankAccountBalance({ bankAccountId: accountId, euros: form.euros ?? '', date: form.date ?? todayIso() });
      setNewBalanceForm(accountId, { euros: '', date: todayIso() });
      await reloadBalances();
    } catch (err) {
      setCreateBalanceError(err instanceof ApiError ? err.message : 'No se ha podido añadir el saldo.');
    } finally {
      setCreatingBalanceForAccountId(null);
    }
  }

  function startEditBalance(balance: BankAccountBalance) {
    setEditBalanceError(null);
    setEditingBalanceId(balance.id);
    setEditingBalanceForm(balanceFormFromEntity(balance));
  }

  async function handleEditBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBalanceId) return;
    setEditBalanceError(null);
    setIsSavingBalance(true);
    try {
      await updateBankAccountBalance(editingBalanceId, editingBalanceForm);
      setEditingBalanceId(null);
      await reloadBalances();
    } catch (err) {
      setEditBalanceError(err instanceof ApiError ? err.message : 'No se ha podido guardar el saldo.');
    } finally {
      setIsSavingBalance(false);
    }
  }

  async function handleDeleteBalance(id: string) {
    setBalanceActionError(null);
    setPendingDeleteBalanceId(id);
    try {
      await deleteBankAccountBalance(id);
      await reloadBalances();
    } catch (err) {
      setBalanceActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el saldo.');
    } finally {
      setPendingDeleteBalanceId(null);
    }
  }

  async function handleCreateStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStockError(null);
    setIsCreatingStock(true);
    try {
      const stock = await createStock({ custodyBank: newStockForm.custodyBank, stock: newStockForm.stock });
      await createStockPurchase({
        stockId: stock.id,
        shareCount: newStockForm.shareCount,
        purchasePrice: newStockForm.purchasePrice,
        date: newStockForm.date,
      });
      setNewStockForm(emptyNewStockForm());
      await Promise.all([reloadStocks(), reloadPurchases()]);
    } catch (err) {
      setCreateStockError(err instanceof ApiError ? err.message : 'No se ha podido crear la acción.');
    } finally {
      setIsCreatingStock(false);
    }
  }

  function startEditStock(stock: Stock) {
    setEditStockError(null);
    setEditingStockId(stock.id);
    setEditingStockForm(stockFormFromEntity(stock));
  }

  async function handleEditStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStockId) return;
    setEditStockError(null);
    setIsSavingStock(true);
    try {
      await updateStock(editingStockId, editingStockForm);
      setEditingStockId(null);
      await reloadStocks();
    } catch (err) {
      setEditStockError(err instanceof ApiError ? err.message : 'No se ha podido guardar la acción.');
    } finally {
      setIsSavingStock(false);
    }
  }

  async function handleDeleteStock(id: string) {
    setStockActionError(null);
    setPendingDeleteStockId(id);
    try {
      await deleteStock(id);
      await Promise.all([reloadStocks(), reloadPurchases(), reloadValuations()]);
    } catch (err) {
      setStockActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la acción.');
    } finally {
      setPendingDeleteStockId(null);
    }
  }

  function getNewPurchaseForm(stockId: string): UpdateStockPurchaseInput {
    return newPurchaseForms[stockId] ?? { shareCount: '', purchasePrice: '', date: todayIso() };
  }

  function setNewPurchaseForm(stockId: string, form: UpdateStockPurchaseInput) {
    setNewPurchaseForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreatePurchase(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePurchaseError(null);
    setCreatingPurchaseForStockId(stockId);
    try {
      const form = getNewPurchaseForm(stockId);
      await createStockPurchase({
        stockId,
        shareCount: form.shareCount ?? '',
        purchasePrice: form.purchasePrice ?? '',
        date: form.date ?? todayIso(),
      });
      setNewPurchaseForm(stockId, { shareCount: '', purchasePrice: '', date: todayIso() });
      await reloadPurchases();
    } catch (err) {
      setCreatePurchaseError(err instanceof ApiError ? err.message : 'No se ha podido añadir la compra.');
    } finally {
      setCreatingPurchaseForStockId(null);
    }
  }

  function startEditPurchase(purchase: StockPurchase) {
    setEditPurchaseError(null);
    setEditingPurchaseId(purchase.id);
    setEditingPurchaseForm(purchaseFormFromEntity(purchase));
  }

  async function handleEditPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPurchaseId) return;
    setEditPurchaseError(null);
    setIsSavingPurchase(true);
    try {
      await updateStockPurchase(editingPurchaseId, editingPurchaseForm);
      setEditingPurchaseId(null);
      await reloadPurchases();
    } catch (err) {
      setEditPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido guardar la compra.');
    } finally {
      setIsSavingPurchase(false);
    }
  }

  async function handleDeletePurchase(id: string) {
    setPurchaseActionError(null);
    setPendingDeletePurchaseId(id);
    try {
      await deleteStockPurchase(id);
      await reloadPurchases();
    } catch (err) {
      setPurchaseActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la compra.');
    } finally {
      setPendingDeletePurchaseId(null);
    }
  }

  function getNewValuationForm(stockId: string): UpdateStockValuationInput {
    return newValuationForms[stockId] ?? { pricePerShare: '', date: todayIso() };
  }

  function setNewValuationForm(stockId: string, form: UpdateStockValuationInput) {
    setNewValuationForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreateValuation(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateValuationError(null);
    setCreatingValuationForStockId(stockId);
    try {
      const form = getNewValuationForm(stockId);
      await createStockValuation({ stockId, pricePerShare: form.pricePerShare ?? '', date: form.date ?? todayIso() });
      setNewValuationForm(stockId, { pricePerShare: '', date: todayIso() });
      await reloadValuations();
    } catch (err) {
      setCreateValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingValuationForStockId(null);
    }
  }

  function startEditValuation(valuation: StockValuation) {
    setEditValuationError(null);
    setEditingValuationId(valuation.id);
    setEditingValuationForm(valuationFormFromEntity(valuation));
  }

  async function handleEditValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingValuationId) return;
    setEditValuationError(null);
    setIsSavingValuation(true);
    try {
      await updateStockValuation(editingValuationId, editingValuationForm);
      setEditingValuationId(null);
      await reloadValuations();
    } catch (err) {
      setEditValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingValuation(false);
    }
  }

  async function handleDeleteValuation(id: string) {
    setValuationActionError(null);
    setPendingDeleteValuationId(id);
    try {
      await deleteStockValuation(id);
      await reloadValuations();
    } catch (err) {
      setValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeleteValuationId(null);
    }
  }

  async function handleCreateFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateFundError(null);
    setIsCreatingFund(true);
    try {
      const fund = await createFund({ custodyBank: newFundForm.custodyBank, fund: newFundForm.fund });
      await createFundPurchase({
        fundId: fund.id,
        shareCount: newFundForm.shareCount,
        purchasePrice: newFundForm.purchasePrice,
        date: newFundForm.date,
      });
      setNewFundForm(emptyNewFundForm());
      await Promise.all([reloadFunds(), reloadFundPurchases()]);
    } catch (err) {
      setCreateFundError(err instanceof ApiError ? err.message : 'No se ha podido crear el fondo.');
    } finally {
      setIsCreatingFund(false);
    }
  }

  function startEditFund(fund: Fund) {
    setEditFundError(null);
    setEditingFundId(fund.id);
    setEditingFundForm(fundFormFromEntity(fund));
  }

  async function handleEditFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFundId) return;
    setEditFundError(null);
    setIsSavingFund(true);
    try {
      await updateFund(editingFundId, editingFundForm);
      setEditingFundId(null);
      await reloadFunds();
    } catch (err) {
      setEditFundError(err instanceof ApiError ? err.message : 'No se ha podido guardar el fondo.');
    } finally {
      setIsSavingFund(false);
    }
  }

  async function handleDeleteFund(id: string) {
    setFundActionError(null);
    setPendingDeleteFundId(id);
    try {
      await deleteFund(id);
      await Promise.all([reloadFunds(), reloadFundPurchases(), reloadFundValuations()]);
    } catch (err) {
      setFundActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el fondo.');
    } finally {
      setPendingDeleteFundId(null);
    }
  }

  function getNewFundPurchaseForm(fundId: string): UpdateFundPurchaseInput {
    return newFundPurchaseForms[fundId] ?? { shareCount: '', purchasePrice: '', date: todayIso() };
  }

  function setNewFundPurchaseForm(fundId: string, form: UpdateFundPurchaseInput) {
    setNewFundPurchaseForms((prev) => ({ ...prev, [fundId]: form }));
  }

  async function handleCreateFundPurchase(fundId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateFundPurchaseError(null);
    setCreatingFundPurchaseForFundId(fundId);
    try {
      const form = getNewFundPurchaseForm(fundId);
      await createFundPurchase({
        fundId,
        shareCount: form.shareCount ?? '',
        purchasePrice: form.purchasePrice ?? '',
        date: form.date ?? todayIso(),
      });
      setNewFundPurchaseForm(fundId, { shareCount: '', purchasePrice: '', date: todayIso() });
      await reloadFundPurchases();
    } catch (err) {
      setCreateFundPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido añadir la compra.');
    } finally {
      setCreatingFundPurchaseForFundId(null);
    }
  }

  function startEditFundPurchase(purchase: FundPurchase) {
    setEditFundPurchaseError(null);
    setEditingFundPurchaseId(purchase.id);
    setEditingFundPurchaseForm(fundPurchaseFormFromEntity(purchase));
  }

  async function handleEditFundPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFundPurchaseId) return;
    setEditFundPurchaseError(null);
    setIsSavingFundPurchase(true);
    try {
      await updateFundPurchase(editingFundPurchaseId, editingFundPurchaseForm);
      setEditingFundPurchaseId(null);
      await reloadFundPurchases();
    } catch (err) {
      setEditFundPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido guardar la compra.');
    } finally {
      setIsSavingFundPurchase(false);
    }
  }

  async function handleDeleteFundPurchase(id: string) {
    setFundPurchaseActionError(null);
    setPendingDeleteFundPurchaseId(id);
    try {
      await deleteFundPurchase(id);
      await reloadFundPurchases();
    } catch (err) {
      setFundPurchaseActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la compra.');
    } finally {
      setPendingDeleteFundPurchaseId(null);
    }
  }

  function getNewFundValuationForm(fundId: string): UpdateFundValuationInput {
    return newFundValuationForms[fundId] ?? { pricePerShare: '', date: todayIso() };
  }

  function setNewFundValuationForm(fundId: string, form: UpdateFundValuationInput) {
    setNewFundValuationForms((prev) => ({ ...prev, [fundId]: form }));
  }

  async function handleCreateFundValuation(fundId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateFundValuationError(null);
    setCreatingFundValuationForFundId(fundId);
    try {
      const form = getNewFundValuationForm(fundId);
      await createFundValuation({ fundId, pricePerShare: form.pricePerShare ?? '', date: form.date ?? todayIso() });
      setNewFundValuationForm(fundId, { pricePerShare: '', date: todayIso() });
      await reloadFundValuations();
    } catch (err) {
      setCreateFundValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingFundValuationForFundId(null);
    }
  }

  function startEditFundValuation(valuation: FundValuation) {
    setEditFundValuationError(null);
    setEditingFundValuationId(valuation.id);
    setEditingFundValuationForm(fundValuationFormFromEntity(valuation));
  }

  async function handleEditFundValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFundValuationId) return;
    setEditFundValuationError(null);
    setIsSavingFundValuation(true);
    try {
      await updateFundValuation(editingFundValuationId, editingFundValuationForm);
      setEditingFundValuationId(null);
      await reloadFundValuations();
    } catch (err) {
      setEditFundValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingFundValuation(false);
    }
  }

  async function handleDeleteFundValuation(id: string) {
    setFundValuationActionError(null);
    setPendingDeleteFundValuationId(id);
    try {
      await deleteFundValuation(id);
      await reloadFundValuations();
    } catch (err) {
      setFundValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeleteFundValuationId(null);
    }
  }

  async function handleCreateCrypto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateCryptoError(null);
    setIsCreatingCrypto(true);
    try {
      const crypto = await createCrypto({ exchange: newCryptoForm.exchange, crypto: newCryptoForm.crypto });
      await createCryptoPurchase({
        cryptoId: crypto.id,
        quantity: newCryptoForm.quantity,
        purchasePrice: newCryptoForm.purchasePrice,
        date: newCryptoForm.date,
      });
      setNewCryptoForm(emptyNewCryptoForm());
      await Promise.all([reloadCryptos(), reloadCryptoPurchases()]);
    } catch (err) {
      setCreateCryptoError(err instanceof ApiError ? err.message : 'No se ha podido crear la posición.');
    } finally {
      setIsCreatingCrypto(false);
    }
  }

  function startEditCrypto(crypto: Crypto) {
    setEditCryptoError(null);
    setEditingCryptoId(crypto.id);
    setEditingCryptoForm(cryptoFormFromEntity(crypto));
  }

  async function handleEditCrypto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCryptoId) return;
    setEditCryptoError(null);
    setIsSavingCrypto(true);
    try {
      await updateCrypto(editingCryptoId, editingCryptoForm);
      setEditingCryptoId(null);
      await reloadCryptos();
    } catch (err) {
      setEditCryptoError(err instanceof ApiError ? err.message : 'No se ha podido guardar la posición.');
    } finally {
      setIsSavingCrypto(false);
    }
  }

  async function handleDeleteCrypto(id: string) {
    setCryptoActionError(null);
    setPendingDeleteCryptoId(id);
    try {
      await deleteCrypto(id);
      await Promise.all([reloadCryptos(), reloadCryptoPurchases(), reloadCryptoValuations()]);
    } catch (err) {
      setCryptoActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la posición.');
    } finally {
      setPendingDeleteCryptoId(null);
    }
  }

  function getNewCryptoPurchaseForm(cryptoId: string): UpdateCryptoPurchaseInput {
    return newCryptoPurchaseForms[cryptoId] ?? { quantity: '', purchasePrice: '', date: todayIso() };
  }

  function setNewCryptoPurchaseForm(cryptoId: string, form: UpdateCryptoPurchaseInput) {
    setNewCryptoPurchaseForms((prev) => ({ ...prev, [cryptoId]: form }));
  }

  async function handleCreateCryptoPurchase(cryptoId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateCryptoPurchaseError(null);
    setCreatingCryptoPurchaseForCryptoId(cryptoId);
    try {
      const form = getNewCryptoPurchaseForm(cryptoId);
      await createCryptoPurchase({
        cryptoId,
        quantity: form.quantity ?? '',
        purchasePrice: form.purchasePrice ?? '',
        date: form.date ?? todayIso(),
      });
      setNewCryptoPurchaseForm(cryptoId, { quantity: '', purchasePrice: '', date: todayIso() });
      await reloadCryptoPurchases();
    } catch (err) {
      setCreateCryptoPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido añadir la compra.');
    } finally {
      setCreatingCryptoPurchaseForCryptoId(null);
    }
  }

  function startEditCryptoPurchase(purchase: CryptoPurchase) {
    setEditCryptoPurchaseError(null);
    setEditingCryptoPurchaseId(purchase.id);
    setEditingCryptoPurchaseForm(cryptoPurchaseFormFromEntity(purchase));
  }

  async function handleEditCryptoPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCryptoPurchaseId) return;
    setEditCryptoPurchaseError(null);
    setIsSavingCryptoPurchase(true);
    try {
      await updateCryptoPurchase(editingCryptoPurchaseId, editingCryptoPurchaseForm);
      setEditingCryptoPurchaseId(null);
      await reloadCryptoPurchases();
    } catch (err) {
      setEditCryptoPurchaseError(err instanceof ApiError ? err.message : 'No se ha podido guardar la compra.');
    } finally {
      setIsSavingCryptoPurchase(false);
    }
  }

  async function handleDeleteCryptoPurchase(id: string) {
    setCryptoPurchaseActionError(null);
    setPendingDeleteCryptoPurchaseId(id);
    try {
      await deleteCryptoPurchase(id);
      await reloadCryptoPurchases();
    } catch (err) {
      setCryptoPurchaseActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la compra.');
    } finally {
      setPendingDeleteCryptoPurchaseId(null);
    }
  }

  function getNewCryptoValuationForm(cryptoId: string): UpdateCryptoValuationInput {
    return newCryptoValuationForms[cryptoId] ?? { pricePerUnit: '', date: todayIso() };
  }

  function setNewCryptoValuationForm(cryptoId: string, form: UpdateCryptoValuationInput) {
    setNewCryptoValuationForms((prev) => ({ ...prev, [cryptoId]: form }));
  }

  async function handleCreateCryptoValuation(cryptoId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateCryptoValuationError(null);
    setCreatingCryptoValuationForCryptoId(cryptoId);
    try {
      const form = getNewCryptoValuationForm(cryptoId);
      await createCryptoValuation({ cryptoId, pricePerUnit: form.pricePerUnit ?? '', date: form.date ?? todayIso() });
      setNewCryptoValuationForm(cryptoId, { pricePerUnit: '', date: todayIso() });
      await reloadCryptoValuations();
    } catch (err) {
      setCreateCryptoValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingCryptoValuationForCryptoId(null);
    }
  }

  function startEditCryptoValuation(valuation: CryptoValuation) {
    setEditCryptoValuationError(null);
    setEditingCryptoValuationId(valuation.id);
    setEditingCryptoValuationForm(cryptoValuationFormFromEntity(valuation));
  }

  async function handleEditCryptoValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCryptoValuationId) return;
    setEditCryptoValuationError(null);
    setIsSavingCryptoValuation(true);
    try {
      await updateCryptoValuation(editingCryptoValuationId, editingCryptoValuationForm);
      setEditingCryptoValuationId(null);
      await reloadCryptoValuations();
    } catch (err) {
      setEditCryptoValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingCryptoValuation(false);
    }
  }

  async function handleDeleteCryptoValuation(id: string) {
    setCryptoValuationActionError(null);
    setPendingDeleteCryptoValuationId(id);
    try {
      await deleteCryptoValuation(id);
      await reloadCryptoValuations();
    } catch (err) {
      setCryptoValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeleteCryptoValuationId(null);
    }
  }

  async function handleCreateVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateVehicleError(null);
    setIsCreatingVehicle(true);
    try {
      await createVehicle(newVehicleForm);
      setNewVehicleForm(EMPTY_VEHICLE_FORM);
      await reloadVehicles();
    } catch (err) {
      setCreateVehicleError(err instanceof ApiError ? err.message : 'No se ha podido crear el vehículo.');
    } finally {
      setIsCreatingVehicle(false);
    }
  }

  function startEditVehicle(vehicle: Vehicle) {
    setEditVehicleError(null);
    setEditingVehicleId(vehicle.id);
    setEditingVehicleForm(vehicleFormFromEntity(vehicle));
  }

  async function handleEditVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVehicleId) return;
    setEditVehicleError(null);
    setIsSavingVehicle(true);
    try {
      await updateVehicle(editingVehicleId, editingVehicleForm);
      setEditingVehicleId(null);
      await reloadVehicles();
    } catch (err) {
      setEditVehicleError(err instanceof ApiError ? err.message : 'No se ha podido guardar el vehículo.');
    } finally {
      setIsSavingVehicle(false);
    }
  }

  async function handleDeleteVehicle(id: string) {
    setVehicleActionError(null);
    setPendingDeleteVehicleId(id);
    try {
      await deleteVehicle(id);
      await Promise.all([reloadVehicles(), reloadVehicleValuations()]);
    } catch (err) {
      setVehicleActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el vehículo.');
    } finally {
      setPendingDeleteVehicleId(null);
    }
  }

  function getNewVehicleValuationForm(vehicleId: string): UpdateVehicleValuationInput {
    return newVehicleValuationForms[vehicleId] ?? { value: '', date: todayIso() };
  }

  function setNewVehicleValuationForm(vehicleId: string, form: UpdateVehicleValuationInput) {
    setNewVehicleValuationForms((prev) => ({ ...prev, [vehicleId]: form }));
  }

  async function handleCreateVehicleValuation(vehicleId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateVehicleValuationError(null);
    setCreatingVehicleValuationForVehicleId(vehicleId);
    try {
      const form = getNewVehicleValuationForm(vehicleId);
      await createVehicleValuation({ vehicleId, value: form.value ?? '', date: form.date ?? todayIso() });
      setNewVehicleValuationForm(vehicleId, { value: '', date: todayIso() });
      await reloadVehicleValuations();
    } catch (err) {
      setCreateVehicleValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingVehicleValuationForVehicleId(null);
    }
  }

  function startEditVehicleValuation(valuation: VehicleValuation) {
    setEditVehicleValuationError(null);
    setEditingVehicleValuationId(valuation.id);
    setEditingVehicleValuationForm(vehicleValuationFormFromEntity(valuation));
  }

  async function handleEditVehicleValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVehicleValuationId) return;
    setEditVehicleValuationError(null);
    setIsSavingVehicleValuation(true);
    try {
      await updateVehicleValuation(editingVehicleValuationId, editingVehicleValuationForm);
      setEditingVehicleValuationId(null);
      await reloadVehicleValuations();
    } catch (err) {
      setEditVehicleValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingVehicleValuation(false);
    }
  }

  async function handleDeleteVehicleValuation(id: string) {
    setVehicleValuationActionError(null);
    setPendingDeleteVehicleValuationId(id);
    try {
      await deleteVehicleValuation(id);
      await reloadVehicleValuations();
    } catch (err) {
      setVehicleValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeleteVehicleValuationId(null);
    }
  }

  async function handleCreatePensionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePensionPlanError(null);
    setIsCreatingPensionPlan(true);
    try {
      const plan = await createPensionPlan({ managingEntity: newPensionPlanForm.managingEntity, plan: newPensionPlanForm.plan });
      await createPensionPlanContribution({
        pensionPlanId: plan.id,
        amount: newPensionPlanForm.amount,
        date: newPensionPlanForm.date,
      });
      setNewPensionPlanForm(emptyNewPensionPlanForm());
      await Promise.all([reloadPensionPlans(), reloadPensionPlanContributions()]);
    } catch (err) {
      setCreatePensionPlanError(err instanceof ApiError ? err.message : 'No se ha podido crear el plan de pensiones.');
    } finally {
      setIsCreatingPensionPlan(false);
    }
  }

  function startEditPensionPlan(plan: PensionPlan) {
    setEditPensionPlanError(null);
    setEditingPensionPlanId(plan.id);
    setEditingPensionPlanForm(pensionPlanFormFromEntity(plan));
  }

  async function handleEditPensionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPensionPlanId) return;
    setEditPensionPlanError(null);
    setIsSavingPensionPlan(true);
    try {
      await updatePensionPlan(editingPensionPlanId, editingPensionPlanForm);
      setEditingPensionPlanId(null);
      await reloadPensionPlans();
    } catch (err) {
      setEditPensionPlanError(err instanceof ApiError ? err.message : 'No se ha podido guardar el plan de pensiones.');
    } finally {
      setIsSavingPensionPlan(false);
    }
  }

  async function handleDeletePensionPlan(id: string) {
    setPensionPlanActionError(null);
    setPendingDeletePensionPlanId(id);
    try {
      await deletePensionPlan(id);
      await Promise.all([reloadPensionPlans(), reloadPensionPlanContributions(), reloadPensionPlanValuations()]);
    } catch (err) {
      setPensionPlanActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el plan de pensiones.');
    } finally {
      setPendingDeletePensionPlanId(null);
    }
  }

  function getNewPensionPlanContributionForm(planId: string): UpdatePensionPlanContributionInput {
    return newPensionPlanContributionForms[planId] ?? { amount: '', date: todayIso() };
  }

  function setNewPensionPlanContributionForm(planId: string, form: UpdatePensionPlanContributionInput) {
    setNewPensionPlanContributionForms((prev) => ({ ...prev, [planId]: form }));
  }

  async function handleCreatePensionPlanContribution(planId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePensionPlanContributionError(null);
    setCreatingPensionPlanContributionForPlanId(planId);
    try {
      const form = getNewPensionPlanContributionForm(planId);
      await createPensionPlanContribution({ pensionPlanId: planId, amount: form.amount ?? '', date: form.date ?? todayIso() });
      setNewPensionPlanContributionForm(planId, { amount: '', date: todayIso() });
      await reloadPensionPlanContributions();
    } catch (err) {
      setCreatePensionPlanContributionError(err instanceof ApiError ? err.message : 'No se ha podido añadir la aportación.');
    } finally {
      setCreatingPensionPlanContributionForPlanId(null);
    }
  }

  function startEditPensionPlanContribution(contribution: PensionPlanContribution) {
    setEditPensionPlanContributionError(null);
    setEditingPensionPlanContributionId(contribution.id);
    setEditingPensionPlanContributionForm(pensionPlanContributionFormFromEntity(contribution));
  }

  async function handleEditPensionPlanContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPensionPlanContributionId) return;
    setEditPensionPlanContributionError(null);
    setIsSavingPensionPlanContribution(true);
    try {
      await updatePensionPlanContribution(editingPensionPlanContributionId, editingPensionPlanContributionForm);
      setEditingPensionPlanContributionId(null);
      await reloadPensionPlanContributions();
    } catch (err) {
      setEditPensionPlanContributionError(err instanceof ApiError ? err.message : 'No se ha podido guardar la aportación.');
    } finally {
      setIsSavingPensionPlanContribution(false);
    }
  }

  async function handleDeletePensionPlanContribution(id: string) {
    setPensionPlanContributionActionError(null);
    setPendingDeletePensionPlanContributionId(id);
    try {
      await deletePensionPlanContribution(id);
      await reloadPensionPlanContributions();
    } catch (err) {
      setPensionPlanContributionActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la aportación.');
    } finally {
      setPendingDeletePensionPlanContributionId(null);
    }
  }

  function getNewPensionPlanValuationForm(planId: string): UpdatePensionPlanValuationInput {
    return newPensionPlanValuationForms[planId] ?? { value: '', date: todayIso() };
  }

  function setNewPensionPlanValuationForm(planId: string, form: UpdatePensionPlanValuationInput) {
    setNewPensionPlanValuationForms((prev) => ({ ...prev, [planId]: form }));
  }

  async function handleCreatePensionPlanValuation(planId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePensionPlanValuationError(null);
    setCreatingPensionPlanValuationForPlanId(planId);
    try {
      const form = getNewPensionPlanValuationForm(planId);
      await createPensionPlanValuation({ pensionPlanId: planId, value: form.value ?? '', date: form.date ?? todayIso() });
      setNewPensionPlanValuationForm(planId, { value: '', date: todayIso() });
      await reloadPensionPlanValuations();
    } catch (err) {
      setCreatePensionPlanValuationError(err instanceof ApiError ? err.message : 'No se ha podido añadir la valoración.');
    } finally {
      setCreatingPensionPlanValuationForPlanId(null);
    }
  }

  function startEditPensionPlanValuation(valuation: PensionPlanValuation) {
    setEditPensionPlanValuationError(null);
    setEditingPensionPlanValuationId(valuation.id);
    setEditingPensionPlanValuationForm(pensionPlanValuationFormFromEntity(valuation));
  }

  async function handleEditPensionPlanValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPensionPlanValuationId) return;
    setEditPensionPlanValuationError(null);
    setIsSavingPensionPlanValuation(true);
    try {
      await updatePensionPlanValuation(editingPensionPlanValuationId, editingPensionPlanValuationForm);
      setEditingPensionPlanValuationId(null);
      await reloadPensionPlanValuations();
    } catch (err) {
      setEditPensionPlanValuationError(err instanceof ApiError ? err.message : 'No se ha podido guardar la valoración.');
    } finally {
      setIsSavingPensionPlanValuation(false);
    }
  }

  async function handleDeletePensionPlanValuation(id: string) {
    setPensionPlanValuationActionError(null);
    setPendingDeletePensionPlanValuationId(id);
    try {
      await deletePensionPlanValuation(id);
      await reloadPensionPlanValuations();
    } catch (err) {
      setPensionPlanValuationActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la valoración.');
    } finally {
      setPendingDeletePensionPlanValuationId(null);
    }
  }

  if (isAuthLoading) {
    return (
      <main>
        <p>Comprobando tu sesión…</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Resumen Patrimonio</h1>
        <p role="alert">Tienes que iniciar sesión para ver esto.</p>
        <p>
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </main>
    );
  }

  // Spec 018, spec.md §2: modo offline fuera de alcance, mismo criterio que Dashboard y Objetivos y presupuestos.
  if (!isOnline) {
    return (
      <main>
        <h1>Resumen Patrimonio</h1>
        <p role="status">Esta página requiere conexión a internet.</p>
      </main>
    );
  }

  const canShowTotal =
    accounts !== null &&
    balances !== null &&
    stockList !== null &&
    purchases !== null &&
    valuations !== null &&
    fundList !== null &&
    fundPurchases !== null &&
    fundValuations !== null &&
    cryptoList !== null &&
    cryptoPurchaseList !== null &&
    cryptoValuationList !== null &&
    vehicleList !== null &&
    vehicleValuationList !== null &&
    pensionPlanList !== null &&
    pensionPlanContributionList !== null &&
    pensionPlanValuationList !== null;

  return (
    <main>
      <h1>Resumen Patrimonio</h1>

      {canShowTotal && (
        <div className="card elev-sm" id="wealth-total-summary">
          <span className="card-title">Total</span>
          <span className="card-amount">
            {formatCurrency(
              (
                parseFloat(bankAccountsTotal(accounts, balances)) +
                parseFloat(stocksTotal(stockList, purchases, valuations)) +
                parseFloat(fundsTotal(fundList, fundPurchases, fundValuations)) +
                parseFloat(cryptosTotal(cryptoList, cryptoPurchaseList, cryptoValuationList)) +
                parseFloat(vehiclesTotal(vehicleList, vehicleValuationList)) +
                parseFloat(pensionPlansTotal(pensionPlanList, pensionPlanValuationList))
              ).toFixed(2),
            )}
          </span>
          <p className="card-meta">
            Cuentas Bancarias: {formatCurrency(bankAccountsTotal(accounts, balances))} · Acciones:{' '}
            {formatCurrency(stocksTotal(stockList, purchases, valuations))} · Fondos Inversión:{' '}
            {formatCurrency(fundsTotal(fundList, fundPurchases, fundValuations))} · Cripto:{' '}
            {formatCurrency(cryptosTotal(cryptoList, cryptoPurchaseList, cryptoValuationList))} · Vehículos:{' '}
            {formatCurrency(vehiclesTotal(vehicleList, vehicleValuationList))} · Fondo Pensiones:{' '}
            {formatCurrency(pensionPlansTotal(pensionPlanList, pensionPlanValuationList))}
          </p>
        </div>
      )}

      <details className="dashboard-section">
        <summary>
          <h2>🏦 Cuentas Bancarias</h2>
        </summary>

        {accountsLoadError && <p role="alert">{accountsLoadError}</p>}
        {balancesLoadError && <p role="alert">{balancesLoadError}</p>}
        {accountActionError && <p role="alert">{accountActionError}</p>}
        {balanceActionError && <p role="alert">{balanceActionError}</p>}

        {accounts && accounts.length === 0 && <p>Todavía no tienes ninguna cuenta bancaria.</p>}

        {accounts && accounts.length > 0 && (
          <ul id="wealth-bank-account-list" aria-label="Tus cuentas bancarias">
            {accounts.map((account) => {
              const isEditingAccount = editingAccountId === account.id;
              const accountBalances = (balances ?? []).filter((b) => b.bankAccountId === account.id);
              const lastBalance = accountBalances[0] ?? null; // `balances` ya viene ordenado por fecha descendente
              const newBalanceForm = getNewBalanceForm(account.id);

              if (isEditingAccount) {
                return (
                  <li className="card elev-sm" key={account.id}>
                    <form onSubmit={handleEditAccount} aria-label={`Editar cuenta: ${accountLabel(account)}`} noValidate>
                      <div className="field">
                        <label htmlFor={`account-${account.id}-bank`}>Banco</label>
                        <input
                          id={`account-${account.id}-bank`}
                          className="input"
                          value={editingAccountForm.bank}
                          onChange={(e) => setEditingAccountForm({ ...editingAccountForm, bank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`account-${account.id}-accountNumber`}>Número de Cuenta</label>
                        <input
                          id={`account-${account.id}-accountNumber`}
                          className="input"
                          value={editingAccountForm.accountNumber}
                          onChange={(e) => setEditingAccountForm({ ...editingAccountForm, accountNumber: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`account-${account.id}-alias`}>Alias</label>
                        <input
                          id={`account-${account.id}-alias`}
                          className="input"
                          placeholder="p. ej. Nómina"
                          value={editingAccountForm.alias ?? ''}
                          onChange={(e) => setEditingAccountForm({ ...editingAccountForm, alias: e.target.value })}
                        />
                      </div>
                      {editAccountError && <p role="alert">{editAccountError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingAccount}>
                        {isSavingAccount ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingAccount}
                        onClick={() => setEditingAccountId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={account.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">{account.alias || `${account.bank} · ${account.accountNumber}`}</span>
                    <span className="card-amount">{lastBalance ? formatCurrency(lastBalance.euros) : 'Sin saldo'}</span>
                  </div>
                  {account.alias && (
                    <p className="card-meta">
                      {account.bank} · {account.accountNumber}
                    </p>
                  )}
                  {lastBalance && <p className="card-meta">Última fecha: {lastBalance.date}</p>}
                  <div>
                    {/* Nombre accesible propio (spec 019): con el historial de saldos anidado, "Editar"/"Eliminar"
                        a secas se repite en dos niveles (la cuenta, y cada saldo dentro de su historial) — sin
                        distinguirlos, un lector de pantalla no podría saber cuál es cuál al tabular por la página. */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar cuenta: ${accountLabel(account)}`}
                      onClick={() => startEditAccount(account)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar cuenta: ${accountLabel(account)}`}
                      disabled={pendingDeleteAccountId === account.id}
                      onClick={() => void handleDeleteAccount(account.id)}
                    >
                      {pendingDeleteAccountId === account.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial ({accountBalances.length})</summary>

                    {accountBalances.length === 0 && <p>Todavía no hay ningún saldo registrado en esta cuenta.</p>}

                    {accountBalances.length > 0 && (
                      <ul aria-label={`Historial de ${accountLabel(account)}`}>
                        {accountBalances.map((balance) => {
                          const isEditingBalance = editingBalanceId === balance.id;

                          if (isEditingBalance) {
                            return (
                              <li key={balance.id}>
                                <form onSubmit={handleEditBalance} aria-label={`Editar saldo del ${balance.date}`} noValidate>
                                  <div className="field">
                                    <label htmlFor={`balance-${balance.id}-euros`}>Euros</label>
                                    <input
                                      id={`balance-${balance.id}-euros`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingBalanceForm.euros}
                                      onChange={(e) => setEditingBalanceForm({ ...editingBalanceForm, euros: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`balance-${balance.id}-date`}>Fecha</label>
                                    <input
                                      id={`balance-${balance.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingBalanceForm.date}
                                      onChange={(e) => setEditingBalanceForm({ ...editingBalanceForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  {editBalanceError && <p role="alert">{editBalanceError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingBalance}>
                                    {isSavingBalance ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingBalance}
                                    onClick={() => setEditingBalanceId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={balance.id}>
                              <span>{balance.date}</span> <span>{formatCurrency(balance.euros)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar saldo del ${balance.date}`}
                                onClick={() => startEditBalance(balance)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar saldo del ${balance.date}`}
                                disabled={pendingDeleteBalanceId === balance.id}
                                onClick={() => void handleDeleteBalance(balance.id)}
                              >
                                {pendingDeleteBalanceId === balance.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateBalance(account.id, e)}
                      aria-label={`Añadir saldo: ${accountLabel(account)}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-balance-${account.id}-euros`}>Euros</label>
                        <input
                          id={`new-balance-${account.id}-euros`}
                          className="input"
                          inputMode="decimal"
                          placeholder="p. ej. 1500.00 o -50.00"
                          value={newBalanceForm.euros}
                          onChange={(e) => setNewBalanceForm(account.id, { ...newBalanceForm, euros: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-balance-${account.id}-date`}>Fecha</label>
                        <input
                          id={`new-balance-${account.id}-date`}
                          type="date"
                          className="input"
                          value={newBalanceForm.date}
                          onChange={(e) => setNewBalanceForm(account.id, { ...newBalanceForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createBalanceError && <p role="alert">{createBalanceError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingBalanceForAccountId === account.id}>
                        {creatingBalanceForAccountId === account.id ? 'Añadiendo…' : 'Añadir saldo'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir cuenta</h3>
        <form onSubmit={handleCreateAccount} aria-label="Añadir cuenta bancaria" noValidate>
          <div className="field">
            <label htmlFor="new-account-bank">Banco</label>
            <input
              id="new-account-bank"
              className="input"
              value={newAccountForm.bank}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, bank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-account-accountNumber">Número de Cuenta</label>
            <input
              id="new-account-accountNumber"
              className="input"
              value={newAccountForm.accountNumber}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, accountNumber: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-account-alias">Alias</label>
            <input
              id="new-account-alias"
              className="input"
              placeholder="p. ej. Nómina"
              value={newAccountForm.alias ?? ''}
              onChange={(e) => setNewAccountForm({ ...newAccountForm, alias: e.target.value })}
            />
          </div>
          {createAccountError && <p role="alert">{createAccountError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingAccount}>
            {isCreatingAccount ? 'Creando…' : 'Añadir cuenta'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>📈 Acciones</h2>
        </summary>

        {stocksLoadError && <p role="alert">{stocksLoadError}</p>}
        {purchasesLoadError && <p role="alert">{purchasesLoadError}</p>}
        {valuationsLoadError && <p role="alert">{valuationsLoadError}</p>}
        {stockActionError && <p role="alert">{stockActionError}</p>}
        {purchaseActionError && <p role="alert">{purchaseActionError}</p>}
        {valuationActionError && <p role="alert">{valuationActionError}</p>}

        {stockList && stockList.length === 0 && <p>Todavía no tienes ninguna acción.</p>}

        {stockList && stockList.length > 0 && (
          <ul id="wealth-stock-list" aria-label="Tus acciones">
            {stockList.map((stock) => {
              const isEditingStock = editingStockId === stock.id;
              const stockPurchases = (purchases ?? []).filter((p) => p.stockId === stock.id);
              const stockValuations = (valuations ?? []).filter((v) => v.stockId === stock.id);
              const lastValuation = stockValuations[0] ?? null; // `valuations` ya viene ordenado por fecha descendente
              const newPurchaseForm = getNewPurchaseForm(stock.id);
              const newValuationForm = getNewValuationForm(stock.id);
              const gainLoss = lastValuation
                ? gainLossPercent(currentValue(lastValuation.pricePerShare, totalShares(stockPurchases)), totalCost(stockPurchases))
                : null;

              if (isEditingStock) {
                return (
                  <li className="card elev-sm" key={stock.id}>
                    <form onSubmit={handleEditStock} aria-label={`Editar acción: ${stock.stock}`} noValidate>
                      <div className="field">
                        <label htmlFor={`stock-${stock.id}-custodyBank`}>Banco Custodia</label>
                        <input
                          id={`stock-${stock.id}-custodyBank`}
                          className="input"
                          value={editingStockForm.custodyBank}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, custodyBank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`stock-${stock.id}-stock`}>Acción</label>
                        <input
                          id={`stock-${stock.id}-stock`}
                          className="input"
                          value={editingStockForm.stock}
                          onChange={(e) => setEditingStockForm({ ...editingStockForm, stock: e.target.value })}
                          required
                        />
                      </div>
                      {editStockError && <p role="alert">{editStockError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingStock}>
                        {isSavingStock ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" disabled={isSavingStock} onClick={() => setEditingStockId(null)}>
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={stock.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">
                      {stock.stock} · {stock.custodyBank}
                      {gainLoss !== null && (
                        <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          {gainLoss >= 0 ? '+' : ''}
                          {gainLoss.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">
                      {lastValuation ? formatCurrency(currentValue(lastValuation.pricePerShare, totalShares(stockPurchases))) : 'Sin valoración'}
                    </span>
                  </div>
                  <p className="card-meta">
                    {totalShares(stockPurchases)} acciones · Coste total: {formatCurrency(totalCost(stockPurchases))}
                    {lastValuation && (
                      <>
                        {' '}
                        · Precio actual: {formatCurrency(lastValuation.pricePerShare)}/acción · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar acción: ${stock.stock} · ${stock.custodyBank}`}
                      onClick={() => startEditStock(stock)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar acción: ${stock.stock} · ${stock.custodyBank}`}
                      disabled={pendingDeleteStockId === stock.id}
                      onClick={() => void handleDeleteStock(stock.id)}
                    >
                      {pendingDeleteStockId === stock.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial de compras ({stockPurchases.length})</summary>

                    {stockPurchases.length === 0 && <p>Todavía no hay ninguna compra registrada en esta acción.</p>}

                    {stockPurchases.length > 0 && (
                      <ul aria-label={`Historial de compras de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockPurchases.map((purchase) => {
                          const isEditingPurchase = editingPurchaseId === purchase.id;
                          // Nombre accesible construido con los valores en crudo (sin `formatCurrency`): evita depender
                          // del formato de `Intl.NumberFormat` (incluye un espacio no separable) para identificar el elemento.
                          const purchaseLabel = `${purchase.date} · ${purchase.shareCount} acciones a ${purchase.purchasePrice}€`;

                          if (isEditingPurchase) {
                            return (
                              <li key={purchase.id}>
                                <form
                                  onSubmit={handleEditPurchase}
                                  aria-label={`Editar compra de ${stock.stock}: ${purchaseLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-shareCount`}>Número acciones</label>
                                    <input
                                      id={`purchase-${purchase.id}-shareCount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPurchaseForm.shareCount}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, shareCount: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-purchasePrice`}>Precio compra</label>
                                    <input
                                      id={`purchase-${purchase.id}-purchasePrice`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPurchaseForm.purchasePrice}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, purchasePrice: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`purchase-${purchase.id}-date`}>Fecha de compra</label>
                                    <input
                                      id={`purchase-${purchase.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingPurchaseForm.date}
                                      onChange={(e) => setEditingPurchaseForm({ ...editingPurchaseForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor compra:{' '}
                                    {formatCurrency(
                                      purchaseValue(editingPurchaseForm.purchasePrice ?? '', editingPurchaseForm.shareCount ?? '') ||
                                        '0.00',
                                    )}
                                  </p>
                                  {editPurchaseError && <p role="alert">{editPurchaseError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingPurchase}>
                                    {isSavingPurchase ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingPurchase}
                                    onClick={() => setEditingPurchaseId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={purchase.id}>
                              <span>{purchase.date}</span>{' '}
                              <span>
                                {purchase.shareCount} acciones @ {formatCurrency(purchase.purchasePrice)} ={' '}
                                {formatCurrency(purchaseValue(purchase.purchasePrice, purchase.shareCount))}
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar compra de ${stock.stock}: ${purchaseLabel}`}
                                onClick={() => startEditPurchase(purchase)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar compra de ${stock.stock}: ${purchaseLabel}`}
                                disabled={pendingDeletePurchaseId === purchase.id}
                                onClick={() => void handleDeletePurchase(purchase.id)}
                              >
                                {pendingDeletePurchaseId === purchase.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreatePurchase(stock.id, e)}
                      aria-label={`Añadir compra: ${stock.stock}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-shareCount`}>Número acciones</label>
                        <input
                          id={`new-purchase-${stock.id}-shareCount`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.shareCount}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, shareCount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-purchasePrice`}>Precio compra</label>
                        <input
                          id={`new-purchase-${stock.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.purchasePrice}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-purchase-${stock.id}-date`}>Fecha de compra</label>
                        <input
                          id={`new-purchase-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newPurchaseForm.date}
                          onChange={(e) => setNewPurchaseForm(stock.id, { ...newPurchaseForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor compra:{' '}
                        {formatCurrency(purchaseValue(newPurchaseForm.purchasePrice ?? '', newPurchaseForm.shareCount ?? '') || '0.00')}
                      </p>
                      {createPurchaseError && <p role="alert">{createPurchaseError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingPurchaseForStockId === stock.id}>
                        {creatingPurchaseForStockId === stock.id ? 'Añadiendo…' : 'Añadir compra'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de valoraciones ({stockValuations.length})</summary>

                    {stockValuations.length === 0 && <p>Todavía no hay ninguna valoración registrada en esta acción.</p>}

                    {stockValuations.length > 0 && (
                      <ul aria-label={`Historial de valoraciones de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockValuations.map((valuation) => {
                          const isEditingValuation = editingValuationId === valuation.id;

                          if (isEditingValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditValuation}
                                  aria-label={`Editar valoración de ${stock.stock} del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`valuation-${valuation.id}-pricePerShare`}>Precio por acción actual</label>
                                    <input
                                      id={`valuation-${valuation.id}-pricePerShare`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingValuationForm.pricePerShare}
                                      onChange={(e) => setEditingValuationForm({ ...editingValuationForm, pricePerShare: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingValuationForm.date}
                                      onChange={(e) => setEditingValuationForm({ ...editingValuationForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor total:{' '}
                                    {formatCurrency(
                                      currentValue(editingValuationForm.pricePerShare ?? '', totalShares(stockPurchases)) || '0.00',
                                    )}
                                  </p>
                                  {editValuationError && <p role="alert">{editValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingValuation}>
                                    {isSavingValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingValuation}
                                    onClick={() => setEditingValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.pricePerShare)}/acción</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración de ${stock.stock} del ${valuation.date}`}
                                onClick={() => startEditValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración de ${stock.stock} del ${valuation.date}`}
                                disabled={pendingDeleteValuationId === valuation.id}
                                onClick={() => void handleDeleteValuation(valuation.id)}
                              >
                                {pendingDeleteValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateValuation(stock.id, e)}
                      aria-label={`Añadir valoración: ${stock.stock}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-valuation-${stock.id}-pricePerShare`}>Precio por acción actual</label>
                        <input
                          id={`new-valuation-${stock.id}-pricePerShare`}
                          className="input"
                          inputMode="decimal"
                          value={newValuationForm.pricePerShare}
                          onChange={(e) => setNewValuationForm(stock.id, { ...newValuationForm, pricePerShare: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-valuation-${stock.id}-date`}>Fecha</label>
                        <input
                          id={`new-valuation-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newValuationForm.date}
                          onChange={(e) => setNewValuationForm(stock.id, { ...newValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor total:{' '}
                        {formatCurrency(currentValue(newValuationForm.pricePerShare ?? '', totalShares(stockPurchases)) || '0.00')}
                      </p>
                      {createValuationError && <p role="alert">{createValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingValuationForStockId === stock.id}>
                        {creatingValuationForStockId === stock.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir acción</h3>
        <form onSubmit={handleCreateStock} aria-label="Añadir acción" noValidate>
          <div className="field">
            <label htmlFor="new-stock-custodyBank">Banco Custodia</label>
            <input
              id="new-stock-custodyBank"
              className="input"
              value={newStockForm.custodyBank}
              onChange={(e) => setNewStockForm({ ...newStockForm, custodyBank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-stock">Acción</label>
            <input
              id="new-stock-stock"
              className="input"
              value={newStockForm.stock}
              onChange={(e) => setNewStockForm({ ...newStockForm, stock: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-shareCount">Número acciones</label>
            <input
              id="new-stock-shareCount"
              className="input"
              inputMode="decimal"
              value={newStockForm.shareCount}
              onChange={(e) => setNewStockForm({ ...newStockForm, shareCount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-purchasePrice">Precio compra</label>
            <input
              id="new-stock-purchasePrice"
              className="input"
              inputMode="decimal"
              value={newStockForm.purchasePrice}
              onChange={(e) => setNewStockForm({ ...newStockForm, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-stock-date">Fecha de compra</label>
            <input
              id="new-stock-date"
              type="date"
              className="input"
              value={newStockForm.date}
              onChange={(e) => setNewStockForm({ ...newStockForm, date: e.target.value })}
              required
            />
          </div>
          <p className="card-meta">
            Valor compra: {formatCurrency(purchaseValue(newStockForm.purchasePrice, newStockForm.shareCount) || '0.00')}
          </p>
          {createStockError && <p role="alert">{createStockError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingStock}>
            {isCreatingStock ? 'Creando…' : 'Añadir acción'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>💹 Fondos Inversión</h2>
        </summary>

        {fundsLoadError && <p role="alert">{fundsLoadError}</p>}
        {fundPurchasesLoadError && <p role="alert">{fundPurchasesLoadError}</p>}
        {fundValuationsLoadError && <p role="alert">{fundValuationsLoadError}</p>}
        {fundActionError && <p role="alert">{fundActionError}</p>}
        {fundPurchaseActionError && <p role="alert">{fundPurchaseActionError}</p>}
        {fundValuationActionError && <p role="alert">{fundValuationActionError}</p>}

        {fundList && fundList.length === 0 && <p>Todavía no tienes ningún fondo de inversión.</p>}

        {fundList && fundList.length > 0 && (
          <ul id="wealth-fund-list" aria-label="Tus fondos de inversión">
            {fundList.map((fund) => {
              const isEditingFund = editingFundId === fund.id;
              const fundPurchaseHistory = (fundPurchases ?? []).filter((p) => p.fundId === fund.id);
              const fundValuationHistory = (fundValuations ?? []).filter((v) => v.fundId === fund.id);
              const lastValuation = fundValuationHistory[0] ?? null; // `fundValuations` ya viene ordenado por fecha descendente
              const newFundPurchaseForm = getNewFundPurchaseForm(fund.id);
              const newFundValuationForm = getNewFundValuationForm(fund.id);
              const gainLoss = lastValuation
                ? gainLossPercent(
                    currentValue(lastValuation.pricePerShare, totalShares(fundPurchaseHistory)),
                    totalCost(fundPurchaseHistory),
                  )
                : null;

              if (isEditingFund) {
                return (
                  <li className="card elev-sm" key={fund.id}>
                    <form onSubmit={handleEditFund} aria-label={`Editar fondo: ${fund.fund}`} noValidate>
                      <div className="field">
                        <label htmlFor={`fund-${fund.id}-custodyBank`}>Banco Custodia</label>
                        <input
                          id={`fund-${fund.id}-custodyBank`}
                          className="input"
                          value={editingFundForm.custodyBank}
                          onChange={(e) => setEditingFundForm({ ...editingFundForm, custodyBank: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`fund-${fund.id}-fund`}>Fondo</label>
                        <input
                          id={`fund-${fund.id}-fund`}
                          className="input"
                          value={editingFundForm.fund}
                          onChange={(e) => setEditingFundForm({ ...editingFundForm, fund: e.target.value })}
                          required
                        />
                      </div>
                      {editFundError && <p role="alert">{editFundError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingFund}>
                        {isSavingFund ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button type="button" className="btn btn-secondary" disabled={isSavingFund} onClick={() => setEditingFundId(null)}>
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={fund.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">
                      {fund.fund} · {fund.custodyBank}
                      {gainLoss !== null && (
                        <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          {gainLoss >= 0 ? '+' : ''}
                          {gainLoss.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">
                      {lastValuation
                        ? formatCurrency(currentValue(lastValuation.pricePerShare, totalShares(fundPurchaseHistory)))
                        : 'Sin valoración'}
                    </span>
                  </div>
                  <p className="card-meta">
                    {totalShares(fundPurchaseHistory)} participaciones · Coste total: {formatCurrency(totalCost(fundPurchaseHistory))}
                    {lastValuation && (
                      <>
                        {' '}
                        · Precio actual: {formatCurrency(lastValuation.pricePerShare)}/participación · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar fondo: ${fund.fund} · ${fund.custodyBank}`}
                      onClick={() => startEditFund(fund)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar fondo: ${fund.fund} · ${fund.custodyBank}`}
                      disabled={pendingDeleteFundId === fund.id}
                      onClick={() => void handleDeleteFund(fund.id)}
                    >
                      {pendingDeleteFundId === fund.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial de compras ({fundPurchaseHistory.length})</summary>

                    {fundPurchaseHistory.length === 0 && <p>Todavía no hay ninguna compra registrada en este fondo.</p>}

                    {fundPurchaseHistory.length > 0 && (
                      <ul aria-label={`Historial de compras de ${fund.fund} · ${fund.custodyBank}`}>
                        {fundPurchaseHistory.map((purchase) => {
                          const isEditingFundPurchase = editingFundPurchaseId === purchase.id;
                          const purchaseLabel = `${purchase.date} · ${purchase.shareCount} participaciones a ${purchase.purchasePrice}€`;

                          if (isEditingFundPurchase) {
                            return (
                              <li key={purchase.id}>
                                <form
                                  onSubmit={handleEditFundPurchase}
                                  aria-label={`Editar compra de ${fund.fund}: ${purchaseLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`fund-purchase-${purchase.id}-shareCount`}>Número de participaciones</label>
                                    <input
                                      id={`fund-purchase-${purchase.id}-shareCount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingFundPurchaseForm.shareCount}
                                      onChange={(e) =>
                                        setEditingFundPurchaseForm({ ...editingFundPurchaseForm, shareCount: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`fund-purchase-${purchase.id}-purchasePrice`}>Precio compra</label>
                                    <input
                                      id={`fund-purchase-${purchase.id}-purchasePrice`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingFundPurchaseForm.purchasePrice}
                                      onChange={(e) =>
                                        setEditingFundPurchaseForm({ ...editingFundPurchaseForm, purchasePrice: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`fund-purchase-${purchase.id}-date`}>Fecha de compra</label>
                                    <input
                                      id={`fund-purchase-${purchase.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingFundPurchaseForm.date}
                                      onChange={(e) => setEditingFundPurchaseForm({ ...editingFundPurchaseForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor compra:{' '}
                                    {formatCurrency(
                                      purchaseValue(
                                        editingFundPurchaseForm.purchasePrice ?? '',
                                        editingFundPurchaseForm.shareCount ?? '',
                                      ) || '0.00',
                                    )}
                                  </p>
                                  {editFundPurchaseError && <p role="alert">{editFundPurchaseError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingFundPurchase}>
                                    {isSavingFundPurchase ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingFundPurchase}
                                    onClick={() => setEditingFundPurchaseId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={purchase.id}>
                              <span>{purchase.date}</span>{' '}
                              <span>
                                {purchase.shareCount} participaciones @ {formatCurrency(purchase.purchasePrice)} ={' '}
                                {formatCurrency(purchaseValue(purchase.purchasePrice, purchase.shareCount))}
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar compra de ${fund.fund}: ${purchaseLabel}`}
                                onClick={() => startEditFundPurchase(purchase)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar compra de ${fund.fund}: ${purchaseLabel}`}
                                disabled={pendingDeleteFundPurchaseId === purchase.id}
                                onClick={() => void handleDeleteFundPurchase(purchase.id)}
                              >
                                {pendingDeleteFundPurchaseId === purchase.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateFundPurchase(fund.id, e)}
                      aria-label={`Añadir compra: ${fund.fund}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-fund-purchase-${fund.id}-shareCount`}>Número de participaciones</label>
                        <input
                          id={`new-fund-purchase-${fund.id}-shareCount`}
                          className="input"
                          inputMode="decimal"
                          value={newFundPurchaseForm.shareCount}
                          onChange={(e) => setNewFundPurchaseForm(fund.id, { ...newFundPurchaseForm, shareCount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-fund-purchase-${fund.id}-purchasePrice`}>Precio compra</label>
                        <input
                          id={`new-fund-purchase-${fund.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={newFundPurchaseForm.purchasePrice}
                          onChange={(e) => setNewFundPurchaseForm(fund.id, { ...newFundPurchaseForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-fund-purchase-${fund.id}-date`}>Fecha de compra</label>
                        <input
                          id={`new-fund-purchase-${fund.id}-date`}
                          type="date"
                          className="input"
                          value={newFundPurchaseForm.date}
                          onChange={(e) => setNewFundPurchaseForm(fund.id, { ...newFundPurchaseForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor compra:{' '}
                        {formatCurrency(
                          purchaseValue(newFundPurchaseForm.purchasePrice ?? '', newFundPurchaseForm.shareCount ?? '') || '0.00',
                        )}
                      </p>
                      {createFundPurchaseError && <p role="alert">{createFundPurchaseError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingFundPurchaseForFundId === fund.id}>
                        {creatingFundPurchaseForFundId === fund.id ? 'Añadiendo…' : 'Añadir compra'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de valoraciones ({fundValuationHistory.length})</summary>

                    {fundValuationHistory.length === 0 && <p>Todavía no hay ninguna valoración registrada en este fondo.</p>}

                    {fundValuationHistory.length > 0 && (
                      <ul aria-label={`Historial de valoraciones de ${fund.fund} · ${fund.custodyBank}`}>
                        {fundValuationHistory.map((valuation) => {
                          const isEditingFundValuation = editingFundValuationId === valuation.id;

                          if (isEditingFundValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditFundValuation}
                                  aria-label={`Editar valoración de ${fund.fund} del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`fund-valuation-${valuation.id}-pricePerShare`}>Precio por participación actual</label>
                                    <input
                                      id={`fund-valuation-${valuation.id}-pricePerShare`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingFundValuationForm.pricePerShare}
                                      onChange={(e) =>
                                        setEditingFundValuationForm({ ...editingFundValuationForm, pricePerShare: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`fund-valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`fund-valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingFundValuationForm.date}
                                      onChange={(e) => setEditingFundValuationForm({ ...editingFundValuationForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor total:{' '}
                                    {formatCurrency(
                                      currentValue(editingFundValuationForm.pricePerShare ?? '', totalShares(fundPurchaseHistory)) ||
                                        '0.00',
                                    )}
                                  </p>
                                  {editFundValuationError && <p role="alert">{editFundValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingFundValuation}>
                                    {isSavingFundValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingFundValuation}
                                    onClick={() => setEditingFundValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.pricePerShare)}/participación</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración de ${fund.fund} del ${valuation.date}`}
                                onClick={() => startEditFundValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración de ${fund.fund} del ${valuation.date}`}
                                disabled={pendingDeleteFundValuationId === valuation.id}
                                onClick={() => void handleDeleteFundValuation(valuation.id)}
                              >
                                {pendingDeleteFundValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateFundValuation(fund.id, e)}
                      aria-label={`Añadir valoración: ${fund.fund}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-fund-valuation-${fund.id}-pricePerShare`}>Precio por participación actual</label>
                        <input
                          id={`new-fund-valuation-${fund.id}-pricePerShare`}
                          className="input"
                          inputMode="decimal"
                          value={newFundValuationForm.pricePerShare}
                          onChange={(e) => setNewFundValuationForm(fund.id, { ...newFundValuationForm, pricePerShare: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-fund-valuation-${fund.id}-date`}>Fecha</label>
                        <input
                          id={`new-fund-valuation-${fund.id}-date`}
                          type="date"
                          className="input"
                          value={newFundValuationForm.date}
                          onChange={(e) => setNewFundValuationForm(fund.id, { ...newFundValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor total:{' '}
                        {formatCurrency(currentValue(newFundValuationForm.pricePerShare ?? '', totalShares(fundPurchaseHistory)) || '0.00')}
                      </p>
                      {createFundValuationError && <p role="alert">{createFundValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingFundValuationForFundId === fund.id}>
                        {creatingFundValuationForFundId === fund.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir fondo</h3>
        <form onSubmit={handleCreateFund} aria-label="Añadir fondo" noValidate>
          <div className="field">
            <label htmlFor="new-fund-custodyBank">Banco Custodia</label>
            <input
              id="new-fund-custodyBank"
              className="input"
              value={newFundForm.custodyBank}
              onChange={(e) => setNewFundForm({ ...newFundForm, custodyBank: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-fund-fund">Fondo</label>
            <input
              id="new-fund-fund"
              className="input"
              value={newFundForm.fund}
              onChange={(e) => setNewFundForm({ ...newFundForm, fund: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-fund-shareCount">Número de participaciones</label>
            <input
              id="new-fund-shareCount"
              className="input"
              inputMode="decimal"
              value={newFundForm.shareCount}
              onChange={(e) => setNewFundForm({ ...newFundForm, shareCount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-fund-purchasePrice">Precio compra</label>
            <input
              id="new-fund-purchasePrice"
              className="input"
              inputMode="decimal"
              value={newFundForm.purchasePrice}
              onChange={(e) => setNewFundForm({ ...newFundForm, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-fund-date">Fecha de compra</label>
            <input
              id="new-fund-date"
              type="date"
              className="input"
              value={newFundForm.date}
              onChange={(e) => setNewFundForm({ ...newFundForm, date: e.target.value })}
              required
            />
          </div>
          <p className="card-meta">Valor compra: {formatCurrency(purchaseValue(newFundForm.purchasePrice, newFundForm.shareCount) || '0.00')}</p>
          {createFundError && <p role="alert">{createFundError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingFund}>
            {isCreatingFund ? 'Creando…' : 'Añadir fondo'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>🪙 Cripto</h2>
        </summary>

        {cryptosLoadError && <p role="alert">{cryptosLoadError}</p>}
        {cryptoPurchasesLoadError && <p role="alert">{cryptoPurchasesLoadError}</p>}
        {cryptoValuationsLoadError && <p role="alert">{cryptoValuationsLoadError}</p>}
        {cryptoActionError && <p role="alert">{cryptoActionError}</p>}
        {cryptoPurchaseActionError && <p role="alert">{cryptoPurchaseActionError}</p>}
        {cryptoValuationActionError && <p role="alert">{cryptoValuationActionError}</p>}

        {cryptoList && cryptoList.length === 0 && <p>Todavía no tienes ninguna posición de cripto.</p>}

        {cryptoList && cryptoList.length > 0 && (
          <ul id="wealth-crypto-list" aria-label="Tus posiciones de cripto">
            {cryptoList.map((crypto) => {
              const isEditingCrypto = editingCryptoId === crypto.id;
              const cryptoOwnPurchases = (cryptoPurchaseList ?? []).filter((p) => p.cryptoId === crypto.id);
              const cryptoOwnValuations = (cryptoValuationList ?? []).filter((v) => v.cryptoId === crypto.id);
              const lastValuation = cryptoOwnValuations[0] ?? null; // ya viene ordenado por fecha descendente
              const newPurchaseForm = getNewCryptoPurchaseForm(crypto.id);
              const newValuationForm = getNewCryptoValuationForm(crypto.id);
              const gainLoss = lastValuation
                ? gainLossPercent(
                    currentValue(lastValuation.pricePerUnit, totalCryptoQuantity(cryptoOwnPurchases)),
                    totalCryptoCost(cryptoOwnPurchases),
                  )
                : null;

              if (isEditingCrypto) {
                return (
                  <li className="card elev-sm" key={crypto.id}>
                    <form onSubmit={handleEditCrypto} aria-label={`Editar posición: ${crypto.crypto}`} noValidate>
                      <div className="field">
                        <label htmlFor={`crypto-${crypto.id}-exchange`}>Exchange/Wallet</label>
                        <input
                          id={`crypto-${crypto.id}-exchange`}
                          className="input"
                          value={editingCryptoForm.exchange}
                          onChange={(e) => setEditingCryptoForm({ ...editingCryptoForm, exchange: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`crypto-${crypto.id}-crypto`}>Criptomoneda</label>
                        <input
                          id={`crypto-${crypto.id}-crypto`}
                          className="input"
                          value={editingCryptoForm.crypto}
                          onChange={(e) => setEditingCryptoForm({ ...editingCryptoForm, crypto: e.target.value })}
                          required
                        />
                      </div>
                      {editCryptoError && <p role="alert">{editCryptoError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingCrypto}>
                        {isSavingCrypto ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingCrypto}
                        onClick={() => setEditingCryptoId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={crypto.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">
                      {crypto.crypto} · {crypto.exchange}
                      {gainLoss !== null && (
                        <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          {gainLoss >= 0 ? '+' : ''}
                          {gainLoss.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">
                      {lastValuation
                        ? formatCurrency(currentValue(lastValuation.pricePerUnit, totalCryptoQuantity(cryptoOwnPurchases)))
                        : 'Sin valoración'}
                    </span>
                  </div>
                  <p className="card-meta">
                    {totalCryptoQuantity(cryptoOwnPurchases)} unidades · Coste total: {formatCurrency(totalCryptoCost(cryptoOwnPurchases))}
                    {lastValuation && (
                      <>
                        {' '}
                        · Precio actual: {formatCurrency(lastValuation.pricePerUnit)}/unidad · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar posición: ${crypto.crypto} · ${crypto.exchange}`}
                      onClick={() => startEditCrypto(crypto)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar posición: ${crypto.crypto} · ${crypto.exchange}`}
                      disabled={pendingDeleteCryptoId === crypto.id}
                      onClick={() => void handleDeleteCrypto(crypto.id)}
                    >
                      {pendingDeleteCryptoId === crypto.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial de compras ({cryptoOwnPurchases.length})</summary>

                    {cryptoOwnPurchases.length === 0 && <p>Todavía no hay ninguna compra registrada en esta posición.</p>}

                    {cryptoOwnPurchases.length > 0 && (
                      <ul aria-label={`Historial de compras de ${crypto.crypto} · ${crypto.exchange}`}>
                        {cryptoOwnPurchases.map((purchase) => {
                          const isEditingPurchase = editingCryptoPurchaseId === purchase.id;
                          const purchaseLabel = `${purchase.date} · ${purchase.quantity} unidades a ${purchase.purchasePrice}€`;

                          if (isEditingPurchase) {
                            return (
                              <li key={purchase.id}>
                                <form
                                  onSubmit={handleEditCryptoPurchase}
                                  aria-label={`Editar compra de ${crypto.crypto}: ${purchaseLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`crypto-purchase-${purchase.id}-quantity`}>Cantidad</label>
                                    <input
                                      id={`crypto-purchase-${purchase.id}-quantity`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingCryptoPurchaseForm.quantity}
                                      onChange={(e) =>
                                        setEditingCryptoPurchaseForm({ ...editingCryptoPurchaseForm, quantity: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`crypto-purchase-${purchase.id}-purchasePrice`}>Precio compra</label>
                                    <input
                                      id={`crypto-purchase-${purchase.id}-purchasePrice`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingCryptoPurchaseForm.purchasePrice}
                                      onChange={(e) =>
                                        setEditingCryptoPurchaseForm({ ...editingCryptoPurchaseForm, purchasePrice: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`crypto-purchase-${purchase.id}-date`}>Fecha de compra</label>
                                    <input
                                      id={`crypto-purchase-${purchase.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingCryptoPurchaseForm.date}
                                      onChange={(e) => setEditingCryptoPurchaseForm({ ...editingCryptoPurchaseForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor compra:{' '}
                                    {formatCurrency(
                                      purchaseValue(
                                        editingCryptoPurchaseForm.purchasePrice ?? '',
                                        editingCryptoPurchaseForm.quantity ?? '',
                                      ) || '0.00',
                                    )}
                                  </p>
                                  {editCryptoPurchaseError && <p role="alert">{editCryptoPurchaseError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingCryptoPurchase}>
                                    {isSavingCryptoPurchase ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingCryptoPurchase}
                                    onClick={() => setEditingCryptoPurchaseId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={purchase.id}>
                              <span>{purchase.date}</span>{' '}
                              <span>
                                {purchase.quantity} unidades @ {formatCurrency(purchase.purchasePrice)} ={' '}
                                {formatCurrency(purchaseValue(purchase.purchasePrice, purchase.quantity))}
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar compra de ${crypto.crypto}: ${purchaseLabel}`}
                                onClick={() => startEditCryptoPurchase(purchase)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar compra de ${crypto.crypto}: ${purchaseLabel}`}
                                disabled={pendingDeleteCryptoPurchaseId === purchase.id}
                                onClick={() => void handleDeleteCryptoPurchase(purchase.id)}
                              >
                                {pendingDeleteCryptoPurchaseId === purchase.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateCryptoPurchase(crypto.id, e)}
                      aria-label={`Añadir compra: ${crypto.crypto}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-crypto-purchase-${crypto.id}-quantity`}>Cantidad</label>
                        <input
                          id={`new-crypto-purchase-${crypto.id}-quantity`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.quantity}
                          onChange={(e) => setNewCryptoPurchaseForm(crypto.id, { ...newPurchaseForm, quantity: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-crypto-purchase-${crypto.id}-purchasePrice`}>Precio compra</label>
                        <input
                          id={`new-crypto-purchase-${crypto.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={newPurchaseForm.purchasePrice}
                          onChange={(e) => setNewCryptoPurchaseForm(crypto.id, { ...newPurchaseForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-crypto-purchase-${crypto.id}-date`}>Fecha de compra</label>
                        <input
                          id={`new-crypto-purchase-${crypto.id}-date`}
                          type="date"
                          className="input"
                          value={newPurchaseForm.date}
                          onChange={(e) => setNewCryptoPurchaseForm(crypto.id, { ...newPurchaseForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor compra:{' '}
                        {formatCurrency(purchaseValue(newPurchaseForm.purchasePrice ?? '', newPurchaseForm.quantity ?? '') || '0.00')}
                      </p>
                      {createCryptoPurchaseError && <p role="alert">{createCryptoPurchaseError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingCryptoPurchaseForCryptoId === crypto.id}>
                        {creatingCryptoPurchaseForCryptoId === crypto.id ? 'Añadiendo…' : 'Añadir compra'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de valoraciones ({cryptoOwnValuations.length})</summary>

                    {cryptoOwnValuations.length === 0 && <p>Todavía no hay ninguna valoración registrada en esta posición.</p>}

                    {cryptoOwnValuations.length > 0 && (
                      <ul aria-label={`Historial de valoraciones de ${crypto.crypto} · ${crypto.exchange}`}>
                        {cryptoOwnValuations.map((valuation) => {
                          const isEditingValuation = editingCryptoValuationId === valuation.id;

                          if (isEditingValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditCryptoValuation}
                                  aria-label={`Editar valoración de ${crypto.crypto} del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`crypto-valuation-${valuation.id}-pricePerUnit`}>Precio por unidad actual</label>
                                    <input
                                      id={`crypto-valuation-${valuation.id}-pricePerUnit`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingCryptoValuationForm.pricePerUnit}
                                      onChange={(e) =>
                                        setEditingCryptoValuationForm({ ...editingCryptoValuationForm, pricePerUnit: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`crypto-valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`crypto-valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingCryptoValuationForm.date}
                                      onChange={(e) =>
                                        setEditingCryptoValuationForm({ ...editingCryptoValuationForm, date: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Valor total:{' '}
                                    {formatCurrency(
                                      currentValue(editingCryptoValuationForm.pricePerUnit ?? '', totalCryptoQuantity(cryptoOwnPurchases)) ||
                                        '0.00',
                                    )}
                                  </p>
                                  {editCryptoValuationError && <p role="alert">{editCryptoValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingCryptoValuation}>
                                    {isSavingCryptoValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingCryptoValuation}
                                    onClick={() => setEditingCryptoValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.pricePerUnit)}/unidad</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración de ${crypto.crypto} del ${valuation.date}`}
                                onClick={() => startEditCryptoValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración de ${crypto.crypto} del ${valuation.date}`}
                                disabled={pendingDeleteCryptoValuationId === valuation.id}
                                onClick={() => void handleDeleteCryptoValuation(valuation.id)}
                              >
                                {pendingDeleteCryptoValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateCryptoValuation(crypto.id, e)}
                      aria-label={`Añadir valoración: ${crypto.crypto}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-crypto-valuation-${crypto.id}-pricePerUnit`}>Precio por unidad actual</label>
                        <input
                          id={`new-crypto-valuation-${crypto.id}-pricePerUnit`}
                          className="input"
                          inputMode="decimal"
                          value={newValuationForm.pricePerUnit}
                          onChange={(e) => setNewCryptoValuationForm(crypto.id, { ...newValuationForm, pricePerUnit: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-crypto-valuation-${crypto.id}-date`}>Fecha</label>
                        <input
                          id={`new-crypto-valuation-${crypto.id}-date`}
                          type="date"
                          className="input"
                          value={newValuationForm.date}
                          onChange={(e) => setNewCryptoValuationForm(crypto.id, { ...newValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor total:{' '}
                        {formatCurrency(
                          currentValue(newValuationForm.pricePerUnit ?? '', totalCryptoQuantity(cryptoOwnPurchases)) || '0.00',
                        )}
                      </p>
                      {createCryptoValuationError && <p role="alert">{createCryptoValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingCryptoValuationForCryptoId === crypto.id}>
                        {creatingCryptoValuationForCryptoId === crypto.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir posición</h3>
        <form onSubmit={handleCreateCrypto} aria-label="Añadir posición de cripto" noValidate>
          <div className="field">
            <label htmlFor="new-crypto-exchange">Exchange/Wallet</label>
            <input
              id="new-crypto-exchange"
              className="input"
              value={newCryptoForm.exchange}
              onChange={(e) => setNewCryptoForm({ ...newCryptoForm, exchange: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-crypto-crypto">Criptomoneda</label>
            <input
              id="new-crypto-crypto"
              className="input"
              value={newCryptoForm.crypto}
              onChange={(e) => setNewCryptoForm({ ...newCryptoForm, crypto: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-crypto-quantity">Cantidad</label>
            <input
              id="new-crypto-quantity"
              className="input"
              inputMode="decimal"
              value={newCryptoForm.quantity}
              onChange={(e) => setNewCryptoForm({ ...newCryptoForm, quantity: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-crypto-purchasePrice">Precio compra</label>
            <input
              id="new-crypto-purchasePrice"
              className="input"
              inputMode="decimal"
              value={newCryptoForm.purchasePrice}
              onChange={(e) => setNewCryptoForm({ ...newCryptoForm, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-crypto-date">Fecha de compra</label>
            <input
              id="new-crypto-date"
              type="date"
              className="input"
              value={newCryptoForm.date}
              onChange={(e) => setNewCryptoForm({ ...newCryptoForm, date: e.target.value })}
              required
            />
          </div>
          <p className="card-meta">
            Valor compra: {formatCurrency(purchaseValue(newCryptoForm.purchasePrice, newCryptoForm.quantity) || '0.00')}
          </p>
          {createCryptoError && <p role="alert">{createCryptoError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingCrypto}>
            {isCreatingCrypto ? 'Creando…' : 'Añadir posición'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>🚗 Vehículos</h2>
        </summary>

        {vehiclesLoadError && <p role="alert">{vehiclesLoadError}</p>}
        {vehicleValuationsLoadError && <p role="alert">{vehicleValuationsLoadError}</p>}
        {vehicleActionError && <p role="alert">{vehicleActionError}</p>}
        {vehicleValuationActionError && <p role="alert">{vehicleValuationActionError}</p>}

        {vehicleList && vehicleList.length === 0 && <p>Todavía no tienes ningún vehículo.</p>}

        {vehicleList && vehicleList.length > 0 && (
          <ul id="wealth-vehicle-list" aria-label="Tus vehículos">
            {vehicleList.map((vehicle) => {
              const isEditingVehicle = editingVehicleId === vehicle.id;
              const vehicleValuations = (vehicleValuationList ?? []).filter((v) => v.vehicleId === vehicle.id);
              const lastValuation = vehicleValuations[0] ?? null; // ya viene ordenado por fecha descendente
              const newValuationForm = getNewVehicleValuationForm(vehicle.id);
              const gainLoss = lastValuation ? gainLossPercent(lastValuation.value, vehicle.purchasePrice) : null;

              if (isEditingVehicle) {
                return (
                  <li className="card elev-sm" key={vehicle.id}>
                    <form onSubmit={handleEditVehicle} aria-label={`Editar vehículo: ${vehicleLabel(vehicle)}`} noValidate>
                      <div className="field">
                        <label htmlFor={`vehicle-${vehicle.id}-brandModel`}>Marca/Modelo</label>
                        <input
                          id={`vehicle-${vehicle.id}-brandModel`}
                          className="input"
                          value={editingVehicleForm.brandModel}
                          onChange={(e) => setEditingVehicleForm({ ...editingVehicleForm, brandModel: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`vehicle-${vehicle.id}-plate`}>Matrícula</label>
                        <input
                          id={`vehicle-${vehicle.id}-plate`}
                          className="input"
                          value={editingVehicleForm.plate}
                          onChange={(e) => setEditingVehicleForm({ ...editingVehicleForm, plate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`vehicle-${vehicle.id}-purchasePrice`}>Precio de compra</label>
                        <input
                          id={`vehicle-${vehicle.id}-purchasePrice`}
                          className="input"
                          inputMode="decimal"
                          value={editingVehicleForm.purchasePrice}
                          onChange={(e) => setEditingVehicleForm({ ...editingVehicleForm, purchasePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`vehicle-${vehicle.id}-purchaseDate`}>Fecha de compra</label>
                        <input
                          id={`vehicle-${vehicle.id}-purchaseDate`}
                          type="date"
                          className="input"
                          value={editingVehicleForm.purchaseDate}
                          onChange={(e) => setEditingVehicleForm({ ...editingVehicleForm, purchaseDate: e.target.value })}
                          required
                        />
                      </div>
                      {editVehicleError && <p role="alert">{editVehicleError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingVehicle}>
                        {isSavingVehicle ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingVehicle}
                        onClick={() => setEditingVehicleId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={vehicle.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">
                      {vehicleLabel(vehicle)}
                      {gainLoss !== null && (
                        <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          {gainLoss >= 0 ? '+' : ''}
                          {gainLoss.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">{lastValuation ? formatCurrency(lastValuation.value) : 'Sin valoración'}</span>
                  </div>
                  <p className="card-meta">
                    Precio de compra: {formatCurrency(vehicle.purchasePrice)} ({vehicle.purchaseDate})
                    {lastValuation && (
                      <>
                        {' '}
                        · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar vehículo: ${vehicleLabel(vehicle)}`}
                      onClick={() => startEditVehicle(vehicle)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar vehículo: ${vehicleLabel(vehicle)}`}
                      disabled={pendingDeleteVehicleId === vehicle.id}
                      onClick={() => void handleDeleteVehicle(vehicle.id)}
                    >
                      {pendingDeleteVehicleId === vehicle.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial ({vehicleValuations.length})</summary>

                    {vehicleValuations.length === 0 && <p>Todavía no hay ninguna valoración registrada de este vehículo.</p>}

                    {vehicleValuations.length > 0 && (
                      <ul aria-label={`Historial de ${vehicleLabel(vehicle)}`}>
                        {vehicleValuations.map((valuation) => {
                          const isEditingValuation = editingVehicleValuationId === valuation.id;

                          if (isEditingValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditVehicleValuation}
                                  aria-label={`Editar valoración del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`vehicle-valuation-${valuation.id}-value`}>Valor actual</label>
                                    <input
                                      id={`vehicle-valuation-${valuation.id}-value`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingVehicleValuationForm.value}
                                      onChange={(e) =>
                                        setEditingVehicleValuationForm({ ...editingVehicleValuationForm, value: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`vehicle-valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`vehicle-valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingVehicleValuationForm.date}
                                      onChange={(e) =>
                                        setEditingVehicleValuationForm({ ...editingVehicleValuationForm, date: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  {editVehicleValuationError && <p role="alert">{editVehicleValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingVehicleValuation}>
                                    {isSavingVehicleValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingVehicleValuation}
                                    onClick={() => setEditingVehicleValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.value)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración del ${valuation.date}`}
                                onClick={() => startEditVehicleValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración del ${valuation.date}`}
                                disabled={pendingDeleteVehicleValuationId === valuation.id}
                                onClick={() => void handleDeleteVehicleValuation(valuation.id)}
                              >
                                {pendingDeleteVehicleValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateVehicleValuation(vehicle.id, e)}
                      aria-label={`Añadir valoración: ${vehicleLabel(vehicle)}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-vehicle-valuation-${vehicle.id}-value`}>Valor actual</label>
                        <input
                          id={`new-vehicle-valuation-${vehicle.id}-value`}
                          className="input"
                          inputMode="decimal"
                          placeholder="p. ej. 12000.00"
                          value={newValuationForm.value}
                          onChange={(e) => setNewVehicleValuationForm(vehicle.id, { ...newValuationForm, value: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-vehicle-valuation-${vehicle.id}-date`}>Fecha</label>
                        <input
                          id={`new-vehicle-valuation-${vehicle.id}-date`}
                          type="date"
                          className="input"
                          value={newValuationForm.date}
                          onChange={(e) => setNewVehicleValuationForm(vehicle.id, { ...newValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createVehicleValuationError && <p role="alert">{createVehicleValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingVehicleValuationForVehicleId === vehicle.id}>
                        {creatingVehicleValuationForVehicleId === vehicle.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir vehículo</h3>
        <form onSubmit={handleCreateVehicle} aria-label="Añadir vehículo" noValidate>
          <div className="field">
            <label htmlFor="new-vehicle-brandModel">Marca/Modelo</label>
            <input
              id="new-vehicle-brandModel"
              className="input"
              value={newVehicleForm.brandModel}
              onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brandModel: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-vehicle-plate">Matrícula</label>
            <input
              id="new-vehicle-plate"
              className="input"
              value={newVehicleForm.plate}
              onChange={(e) => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-vehicle-purchasePrice">Precio de compra</label>
            <input
              id="new-vehicle-purchasePrice"
              className="input"
              inputMode="decimal"
              value={newVehicleForm.purchasePrice}
              onChange={(e) => setNewVehicleForm({ ...newVehicleForm, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-vehicle-purchaseDate">Fecha de compra</label>
            <input
              id="new-vehicle-purchaseDate"
              type="date"
              className="input"
              value={newVehicleForm.purchaseDate}
              onChange={(e) => setNewVehicleForm({ ...newVehicleForm, purchaseDate: e.target.value })}
              required
            />
          </div>
          {createVehicleError && <p role="alert">{createVehicleError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingVehicle}>
            {isCreatingVehicle ? 'Creando…' : 'Añadir vehículo'}
          </button>
        </form>
      </details>

      <details className="dashboard-section">
        <summary>
          <h2>👴 Fondo Pensiones</h2>
        </summary>

        {pensionPlansLoadError && <p role="alert">{pensionPlansLoadError}</p>}
        {pensionPlanContributionsLoadError && <p role="alert">{pensionPlanContributionsLoadError}</p>}
        {pensionPlanValuationsLoadError && <p role="alert">{pensionPlanValuationsLoadError}</p>}
        {pensionPlanActionError && <p role="alert">{pensionPlanActionError}</p>}
        {pensionPlanContributionActionError && <p role="alert">{pensionPlanContributionActionError}</p>}
        {pensionPlanValuationActionError && <p role="alert">{pensionPlanValuationActionError}</p>}

        {pensionPlanList && pensionPlanList.length === 0 && <p>Todavía no tienes ningún plan de pensiones.</p>}

        {pensionPlanList && pensionPlanList.length > 0 && (
          <ul id="wealth-pension-plan-list" aria-label="Tus planes de pensiones">
            {pensionPlanList.map((plan) => {
              const isEditingPlan = editingPensionPlanId === plan.id;
              const planContributions = (pensionPlanContributionList ?? []).filter((c) => c.pensionPlanId === plan.id);
              const planValuations = (pensionPlanValuationList ?? []).filter((v) => v.pensionPlanId === plan.id);
              const lastValuation = planValuations[0] ?? null; // ya viene ordenado por fecha descendente
              const newContributionForm = getNewPensionPlanContributionForm(plan.id);
              const newValuationForm = getNewPensionPlanValuationForm(plan.id);
              const contributed = totalContributions(planContributions);
              const gainLoss =
                lastValuation && planContributions.length > 0
                  ? gainLossPercent(lastValuation.value, contributed)
                  : null;

              if (isEditingPlan) {
                return (
                  <li className="card elev-sm" key={plan.id}>
                    <form onSubmit={handleEditPensionPlan} aria-label={`Editar plan: ${pensionPlanLabel(plan)}`} noValidate>
                      <div className="field">
                        <label htmlFor={`pension-plan-${plan.id}-managingEntity`}>Entidad Gestora</label>
                        <input
                          id={`pension-plan-${plan.id}-managingEntity`}
                          className="input"
                          value={editingPensionPlanForm.managingEntity}
                          onChange={(e) => setEditingPensionPlanForm({ ...editingPensionPlanForm, managingEntity: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`pension-plan-${plan.id}-plan`}>Plan</label>
                        <input
                          id={`pension-plan-${plan.id}-plan`}
                          className="input"
                          value={editingPensionPlanForm.plan}
                          onChange={(e) => setEditingPensionPlanForm({ ...editingPensionPlanForm, plan: e.target.value })}
                          required
                        />
                      </div>
                      {editPensionPlanError && <p role="alert">{editPensionPlanError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingPensionPlan}>
                        {isSavingPensionPlan ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingPensionPlan}
                        onClick={() => setEditingPensionPlanId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={plan.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">
                      {pensionPlanLabel(plan)}
                      {gainLoss !== null && (
                        <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          {gainLoss >= 0 ? '+' : ''}
                          {gainLoss.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">{lastValuation ? formatCurrency(lastValuation.value) : 'Sin valoración'}</span>
                  </div>
                  <p className="card-meta">
                    Total aportado: {formatCurrency(contributed)}
                    {lastValuation && (
                      <>
                        {' '}
                        · Última fecha: {lastValuation.date}
                      </>
                    )}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar plan: ${pensionPlanLabel(plan)}`}
                      onClick={() => startEditPensionPlan(plan)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar plan: ${pensionPlanLabel(plan)}`}
                      disabled={pendingDeletePensionPlanId === plan.id}
                      onClick={() => void handleDeletePensionPlan(plan.id)}
                    >
                      {pendingDeletePensionPlanId === plan.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial de aportaciones ({planContributions.length})</summary>

                    {planContributions.length === 0 && <p>Todavía no hay ninguna aportación registrada en este plan.</p>}

                    {planContributions.length > 0 && (
                      <ul aria-label={`Historial de aportaciones de ${pensionPlanLabel(plan)}`}>
                        {planContributions.map((contribution) => {
                          const isEditingContribution = editingPensionPlanContributionId === contribution.id;
                          const contributionLabel = `${contribution.date} · ${contribution.amount}€`;

                          if (isEditingContribution) {
                            return (
                              <li key={contribution.id}>
                                <form
                                  onSubmit={handleEditPensionPlanContribution}
                                  aria-label={`Editar aportación de ${pensionPlanLabel(plan)}: ${contributionLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`pension-plan-contribution-${contribution.id}-amount`}>Importe</label>
                                    <input
                                      id={`pension-plan-contribution-${contribution.id}-amount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPensionPlanContributionForm.amount}
                                      onChange={(e) =>
                                        setEditingPensionPlanContributionForm({
                                          ...editingPensionPlanContributionForm,
                                          amount: e.target.value,
                                        })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`pension-plan-contribution-${contribution.id}-date`}>Fecha de aportación</label>
                                    <input
                                      id={`pension-plan-contribution-${contribution.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingPensionPlanContributionForm.date}
                                      onChange={(e) =>
                                        setEditingPensionPlanContributionForm({
                                          ...editingPensionPlanContributionForm,
                                          date: e.target.value,
                                        })
                                      }
                                      required
                                    />
                                  </div>
                                  {editPensionPlanContributionError && <p role="alert">{editPensionPlanContributionError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingPensionPlanContribution}>
                                    {isSavingPensionPlanContribution ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingPensionPlanContribution}
                                    onClick={() => setEditingPensionPlanContributionId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={contribution.id}>
                              <span>{contribution.date}</span> <span>{formatCurrency(contribution.amount)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar aportación de ${pensionPlanLabel(plan)}: ${contributionLabel}`}
                                onClick={() => startEditPensionPlanContribution(contribution)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar aportación de ${pensionPlanLabel(plan)}: ${contributionLabel}`}
                                disabled={pendingDeletePensionPlanContributionId === contribution.id}
                                onClick={() => void handleDeletePensionPlanContribution(contribution.id)}
                              >
                                {pendingDeletePensionPlanContributionId === contribution.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreatePensionPlanContribution(plan.id, e)}
                      aria-label={`Añadir aportación: ${pensionPlanLabel(plan)}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-pension-plan-contribution-${plan.id}-amount`}>Importe</label>
                        <input
                          id={`new-pension-plan-contribution-${plan.id}-amount`}
                          className="input"
                          inputMode="decimal"
                          value={newContributionForm.amount}
                          onChange={(e) =>
                            setNewPensionPlanContributionForm(plan.id, { ...newContributionForm, amount: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-pension-plan-contribution-${plan.id}-date`}>Fecha de aportación</label>
                        <input
                          id={`new-pension-plan-contribution-${plan.id}-date`}
                          type="date"
                          className="input"
                          value={newContributionForm.date}
                          onChange={(e) => setNewPensionPlanContributionForm(plan.id, { ...newContributionForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createPensionPlanContributionError && <p role="alert">{createPensionPlanContributionError}</p>}
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={creatingPensionPlanContributionForPlanId === plan.id}
                      >
                        {creatingPensionPlanContributionForPlanId === plan.id ? 'Añadiendo…' : 'Añadir aportación'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de valoraciones ({planValuations.length})</summary>

                    {planValuations.length === 0 && <p>Todavía no hay ninguna valoración registrada en este plan.</p>}

                    {planValuations.length > 0 && (
                      <ul aria-label={`Historial de valoraciones de ${pensionPlanLabel(plan)}`}>
                        {planValuations.map((valuation) => {
                          const isEditingValuation = editingPensionPlanValuationId === valuation.id;

                          if (isEditingValuation) {
                            return (
                              <li key={valuation.id}>
                                <form
                                  onSubmit={handleEditPensionPlanValuation}
                                  aria-label={`Editar valoración de ${pensionPlanLabel(plan)} del ${valuation.date}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`pension-plan-valuation-${valuation.id}-value`}>Valor total actual</label>
                                    <input
                                      id={`pension-plan-valuation-${valuation.id}-value`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingPensionPlanValuationForm.value}
                                      onChange={(e) =>
                                        setEditingPensionPlanValuationForm({ ...editingPensionPlanValuationForm, value: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`pension-plan-valuation-${valuation.id}-date`}>Fecha</label>
                                    <input
                                      id={`pension-plan-valuation-${valuation.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingPensionPlanValuationForm.date}
                                      onChange={(e) =>
                                        setEditingPensionPlanValuationForm({ ...editingPensionPlanValuationForm, date: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  {editPensionPlanValuationError && <p role="alert">{editPensionPlanValuationError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingPensionPlanValuation}>
                                    {isSavingPensionPlanValuation ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingPensionPlanValuation}
                                    onClick={() => setEditingPensionPlanValuationId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={valuation.id}>
                              <span>{valuation.date}</span> <span>{formatCurrency(valuation.value)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar valoración de ${pensionPlanLabel(plan)} del ${valuation.date}`}
                                onClick={() => startEditPensionPlanValuation(valuation)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar valoración de ${pensionPlanLabel(plan)} del ${valuation.date}`}
                                disabled={pendingDeletePensionPlanValuationId === valuation.id}
                                onClick={() => void handleDeletePensionPlanValuation(valuation.id)}
                              >
                                {pendingDeletePensionPlanValuationId === valuation.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreatePensionPlanValuation(plan.id, e)}
                      aria-label={`Añadir valoración: ${pensionPlanLabel(plan)}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-pension-plan-valuation-${plan.id}-value`}>Valor total actual</label>
                        <input
                          id={`new-pension-plan-valuation-${plan.id}-value`}
                          className="input"
                          inputMode="decimal"
                          placeholder="p. ej. 1950.00"
                          value={newValuationForm.value}
                          onChange={(e) => setNewPensionPlanValuationForm(plan.id, { ...newValuationForm, value: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-pension-plan-valuation-${plan.id}-date`}>Fecha</label>
                        <input
                          id={`new-pension-plan-valuation-${plan.id}-date`}
                          type="date"
                          className="input"
                          value={newValuationForm.date}
                          onChange={(e) => setNewPensionPlanValuationForm(plan.id, { ...newValuationForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createPensionPlanValuationError && <p role="alert">{createPensionPlanValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingPensionPlanValuationForPlanId === plan.id}>
                        {creatingPensionPlanValuationForPlanId === plan.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Añadir plan</h3>
        <form onSubmit={handleCreatePensionPlan} aria-label="Añadir plan de pensiones" noValidate>
          <div className="field">
            <label htmlFor="new-pension-plan-managingEntity">Entidad Gestora</label>
            <input
              id="new-pension-plan-managingEntity"
              className="input"
              value={newPensionPlanForm.managingEntity}
              onChange={(e) => setNewPensionPlanForm({ ...newPensionPlanForm, managingEntity: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-pension-plan-plan">Plan</label>
            <input
              id="new-pension-plan-plan"
              className="input"
              value={newPensionPlanForm.plan}
              onChange={(e) => setNewPensionPlanForm({ ...newPensionPlanForm, plan: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-pension-plan-amount">Importe</label>
            <input
              id="new-pension-plan-amount"
              className="input"
              inputMode="decimal"
              value={newPensionPlanForm.amount}
              onChange={(e) => setNewPensionPlanForm({ ...newPensionPlanForm, amount: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-pension-plan-date">Fecha de aportación</label>
            <input
              id="new-pension-plan-date"
              type="date"
              className="input"
              value={newPensionPlanForm.date}
              onChange={(e) => setNewPensionPlanForm({ ...newPensionPlanForm, date: e.target.value })}
              required
            />
          </div>
          {createPensionPlanError && <p role="alert">{createPensionPlanError}</p>}
          <button type="submit" className="btn btn-primary" disabled={isCreatingPensionPlan}>
            {isCreatingPensionPlan ? 'Creando…' : 'Añadir plan'}
          </button>
        </form>
      </details>

      {PLACEHOLDER_SECTIONS.map((section) => (
        <details className="dashboard-section" key={section.label}>
          <summary>
            <h2>
              {section.icon} {section.label}
            </h2>
          </summary>
          <p>Próximamente.</p>
        </details>
      ))}
    </main>
  );
}
