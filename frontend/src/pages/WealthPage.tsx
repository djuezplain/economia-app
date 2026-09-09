import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../hooks/useConnectivity';
import { useOpenSectionFromHash } from '../hooks/useOpenSectionFromHash';
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
import { createStockSale, deleteStockSale, listStockSales, updateStockSale } from '../api/stock-sales';
import type { StockSale, UpdateStockSaleInput } from '../api/stock-sales';
import {
  createStockValuation,
  deleteStockValuation,
  listStockValuations,
  updateStockValuation,
} from '../api/stock-valuations';
import type { StockValuation, UpdateStockValuationInput } from '../api/stock-valuations';
import {
  createStockDividend,
  deleteStockDividend,
  listStockDividends,
  updateStockDividend,
} from '../api/stock-dividends';
import type { StockDividend, UpdateStockDividendInput } from '../api/stock-dividends';
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
import { createFundDividend, deleteFundDividend, listFundDividends, updateFundDividend } from '../api/fund-dividends';
import type { FundDividend, UpdateFundDividendInput } from '../api/fund-dividends';
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
import { createCashHolding, deleteCashHolding, listCashHoldings, updateCashHolding } from '../api/cash-holdings';
import type { CashHolding, CashHoldingInput } from '../api/cash-holdings';
import { createCashBalance, deleteCashBalance, listCashBalances, updateCashBalance } from '../api/cash-balances';
import type { CashBalance, UpdateCashBalanceInput } from '../api/cash-balances';
import { ApiError } from '../api/client';
import { formatCurrency, formatDate } from './home-shared';
import {
  isValidCustomRange,
  liquidityRatioSeries,
  resolveRange,
  wealthEvolutionByCategorySeries,
  wealthEvolutionSeries,
} from './wealth-evolution.calculations';
import type { CustomRange, WealthEvolutionRangeMode } from './wealth-evolution.calculations';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Spec 027: mismos tokens de estilo que `DashboardPage.tsx` (`CHART_TICK_STYLE`/
// `CHART_TOOLTIP_STYLE`), duplicados aquí en vez de extraer un módulo
// compartido — no hay todavía una tercera consumidora (plan.md §3).
const WEALTH_CHART_TICK_STYLE = { fontFamily: 'var(--font-body)', fontSize: 12, fill: 'var(--text)' };
const WEALTH_CHART_TOOLTIP_STYLE = { fontFamily: 'var(--font-body)', fontSize: 13 };
const COLOR_WEALTH_TOTAL = 'var(--accent-300)';

const RANGE_MODE_OPTIONS: Array<{ value: WealthEvolutionRangeMode; label: string }> = [
  { value: 'last12Months', label: 'Últimos 12 meses' },
  { value: 'currentYear', label: 'Año actual' },
  { value: 'allTime', label: 'Todo el histórico' },
  { value: 'custom', label: 'Rango personalizado' },
];

const EVOLUTION_VIEW_OPTIONS: Array<{ value: 'total' | 'byCategory' | 'liquidity'; label: string }> = [
  { value: 'total', label: 'Total' },
  { value: 'byCategory', label: 'Por categoría' },
  { value: 'liquidity', label: 'Liquidez' },
];

// Spec 028: paleta categórica de las 7 categorías de patrimonio (index.css) — orden y color fijos,
// reutilizados tal cual en la vista "Por categoría" (H1) y en "Composición actual" (H3) para que
// cada categoría tenga siempre el mismo color en toda la sección (spec.md decisión de negocio).
const WEALTH_CATEGORIES: Array<{
  key: 'bankAccounts' | 'stocks' | 'funds' | 'cryptos' | 'vehicles' | 'pensionPlans' | 'cash';
  label: string;
  color: string;
}> = [
  { key: 'bankAccounts', label: 'Cuentas Bancarias', color: 'var(--wealth-cat-bank)' },
  { key: 'stocks', label: 'Acciones', color: 'var(--wealth-cat-stocks)' },
  { key: 'funds', label: 'Fondos Inversión', color: 'var(--wealth-cat-funds)' },
  { key: 'cryptos', label: 'Cripto', color: 'var(--wealth-cat-crypto)' },
  { key: 'vehicles', label: 'Vehículos', color: 'var(--wealth-cat-vehicles)' },
  { key: 'pensionPlans', label: 'Fondo Pensiones', color: 'var(--wealth-cat-pension)' },
  { key: 'cash', label: 'Efectivo', color: 'var(--wealth-cat-cash)' },
];

const EMPTY_ACCOUNT_FORM: BankAccountInput = { bank: '', accountNumber: '', alias: '' };
const EMPTY_BALANCE_FORM: UpdateBankAccountBalanceInput = { euros: '', date: todayIso() };
const EMPTY_STOCK_FORM: StockInput = { custodyBank: '', stock: '' };
const EMPTY_PURCHASE_FORM: UpdateStockPurchaseInput = { shareCount: '', purchasePrice: '', date: todayIso() };
const EMPTY_STOCK_SALE_FORM: UpdateStockSaleInput = { shareCount: '', salePrice: '', date: todayIso() };
const EMPTY_VALUATION_FORM: UpdateStockValuationInput = { pricePerShare: '', date: todayIso() };
// H1 criterio 1 (spec 029): 19% de retención por defecto, precargado en el formulario.
const EMPTY_STOCK_DIVIDEND_FORM: UpdateStockDividendInput = { netAmount: '', retentionPercent: '19', date: todayIso() };
const EMPTY_FUND_FORM: FundInput = { custodyBank: '', fund: '' };
const EMPTY_FUND_PURCHASE_FORM: UpdateFundPurchaseInput = { shareCount: '', purchasePrice: '', date: todayIso() };
const EMPTY_FUND_VALUATION_FORM: UpdateFundValuationInput = { pricePerShare: '', date: todayIso() };
const EMPTY_FUND_DIVIDEND_FORM: UpdateFundDividendInput = { netAmount: '', retentionPercent: '19', date: todayIso() };
const EMPTY_CRYPTO_FORM: CryptoInput = { exchange: '', crypto: '' };
const EMPTY_CRYPTO_PURCHASE_FORM: UpdateCryptoPurchaseInput = { quantity: '', purchasePrice: '', date: todayIso() };
const EMPTY_CRYPTO_VALUATION_FORM: UpdateCryptoValuationInput = { pricePerUnit: '', date: todayIso() };
const EMPTY_VEHICLE_FORM: VehicleInput = { brandModel: '', plate: '', purchasePrice: '', purchaseDate: todayIso() };
const EMPTY_VEHICLE_VALUATION_FORM: UpdateVehicleValuationInput = { value: '', date: todayIso() };
const EMPTY_PENSION_PLAN_FORM: PensionPlanInput = { managingEntity: '', plan: '' };
const EMPTY_PENSION_PLAN_CONTRIBUTION_FORM: UpdatePensionPlanContributionInput = { amount: '', date: todayIso() };
const EMPTY_PENSION_PLAN_VALUATION_FORM: UpdatePensionPlanValuationInput = { value: '', date: todayIso() };
const EMPTY_CASH_HOLDING_FORM: CashHoldingInput = { location: '' };
const EMPTY_CASH_BALANCE_FORM: UpdateCashBalanceInput = { amount: '', date: todayIso() };

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

function stockSaleFormFromEntity(sale: StockSale): UpdateStockSaleInput {
  return { shareCount: sale.shareCount, salePrice: sale.salePrice, date: sale.date };
}

function valuationFormFromEntity(valuation: StockValuation): UpdateStockValuationInput {
  return { pricePerShare: valuation.pricePerShare, date: valuation.date };
}

function stockDividendFormFromEntity(dividend: StockDividend): UpdateStockDividendInput {
  return { netAmount: dividend.netAmount, retentionPercent: dividend.retentionPercent, date: dividend.date };
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

function fundDividendFormFromEntity(dividend: FundDividend): UpdateFundDividendInput {
  return { netAmount: dividend.netAmount, retentionPercent: dividend.retentionPercent, date: dividend.date };
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

function cashHoldingFormFromEntity(holding: CashHolding): CashHoldingInput {
  return { location: holding.location };
}

function cashBalanceFormFromEntity(balance: CashBalance): UpdateCashBalanceInput {
  return { amount: balance.amount, date: balance.date };
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

/** H2 criterio 1/2 (spec 031): simula FIFO sobre TODOS los movimientos (compras y ventas) de una
 *  posición de Acciones, ordenados cronológicamente (fecha; en caso de empate, compras antes que
 *  ventas — H1 criterio 2, mismo día). Devuelve lo que queda en cartera (cantidad y coste FIFO) y
 *  la ganancia/pérdida de cada venta individual, indexada por su id — calculado, nunca guardado,
 *  igual que el resto de esta página. `totalShares`/`totalCost` no se tocan: siguen siendo
 *  compras-brutas tal cual, para Fondos/Cripto (spec.md §2, "solo Acciones"). */
function fifoPositionState(
  purchases: Array<{ id: string; date: string; shareCount: string; purchasePrice: string; createdAt: string }>,
  sales: Array<{ id: string; date: string; shareCount: string; salePrice: string; createdAt: string }>,
): { heldShares: string; heldCost: string; realizedGainLossBySaleId: Record<string, string> } {
  const events = [
    ...purchases.map((p) => ({
      type: 'buy' as const,
      date: p.date,
      createdAt: p.createdAt,
      id: p.id,
      qty: parseFloat(p.shareCount),
      price: parseFloat(p.purchasePrice),
    })),
    ...sales.map((s) => ({
      type: 'sell' as const,
      date: s.date,
      createdAt: s.createdAt,
      id: s.id,
      qty: parseFloat(s.shareCount),
      price: parseFloat(s.salePrice),
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Empate de fecha: compras antes que ventas (H1 criterio 2 de spec.md); dentro del mismo tipo,
    // por `createdAt` (orden real en que se registraron) — NO por el orden del array de entrada:
    // `purchases`/`sales` llegan ya ordenados por fecha DESCENDENTE (H2 de spec 020, "de la más
    // reciente a la más antigua", para mostrarlos en la UI), así que usar ese orden tal cual como
    // desempate de `Array.prototype.sort` (estable) invertía silenciosamente el FIFO en compras del
    // mismo día — bug real, encontrado probando esta spec manualmente antes de darla por cerrada.
    if (a.type !== b.type) return a.type === 'buy' ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  const lots: Array<{ remaining: number; price: number }> = [];
  const realizedGainLossBySaleId: Record<string, string> = {};

  for (const event of events) {
    if (event.type === 'buy') {
      lots.push({ remaining: event.qty, price: event.price });
      continue;
    }
    let toConsume = event.qty;
    let costBasis = 0;
    while (toConsume > 0 && lots.length > 0) {
      const lot = lots[0];
      const consumed = Math.min(lot.remaining, toConsume);
      costBasis += consumed * lot.price;
      lot.remaining -= consumed;
      toConsume -= consumed;
      if (lot.remaining <= 0) lots.shift();
    }
    // toConsume > 0 aquí solo puede pasar con datos inconsistentes (p. ej. se borró una compra
    // después de registrar la venta, sin pasar por la validación del backend) — el coste de lo no
    // cubierto se trata como 0, degradando con gracia en vez de lanzar un error de renderizado.
    realizedGainLossBySaleId[event.id] = (event.qty * event.price - costBasis).toFixed(2);
  }

  return {
    heldShares: lots.reduce((sum, lot) => sum + lot.remaining, 0).toFixed(8),
    heldCost: lots.reduce((sum, lot) => sum + lot.remaining * lot.price, 0).toFixed(2),
    realizedGainLossBySaleId,
  };
}

/** Una posición de Acciones está "cerrada" cuando se ha comprado alguna vez y, tras aplicar FIFO a
 *  compras y ventas, no queda ninguna acción en cartera (se ha vendido todo). Sin ninguna compra
 *  todavía no cuenta como cerrada — es simplemente una posición sin abrir. */
function isStockPositionClosed(purchases: StockPurchase[], sales: StockSale[]): boolean {
  return purchases.length > 0 && parseFloat(fifoPositionState(purchases, sales).heldShares) === 0;
}

/** H2 criterio 4 (spec 031): total de ganancia/pérdida realizada de una posición — suma de
 *  `realizedGainLossBySaleId` de su propio `fifoPositionState`. */
function totalRealizedGainLoss(fifoState: { realizedGainLossBySaleId: Record<string, string> }): string {
  return Object.values(fifoState.realizedGainLossBySaleId)
    .reduce((sum, v) => sum + parseFloat(v), 0)
    .toFixed(2);
}

/** Años (más reciente primero) en los que hay al menos una venta de acciones registrada —
 *  opciones del selector de "Cálculo de impuestos". */
function stockSaleYears(sales: StockSale[]): string[] {
  const years = new Set(sales.map((sale) => sale.date.slice(0, 4)));
  return Array.from(years).sort((a, b) => (a < b ? 1 : -1));
}

/** Ganancia/pérdida patrimonial realizada por venta de acciones en un año natural concreto, sumando
 *  (por cada posición, vía su propio `fifoPositionState`) el resultado FIFO de las ventas de ese año
 *  — mismo criterio de cálculo que `totalRealizedGainLoss`, pero acotado a `year` y agregado sobre
 *  todas las posiciones (necesario para la declaración de la renta, que es por ejercicio fiscal). */
function realizedGainLossForYear(stocks: Stock[], purchases: StockPurchase[], sales: StockSale[], year: string): string {
  return stocks
    .reduce((sum, stock) => {
      const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
      const stockSales = sales.filter((s) => s.stockId === stock.id);
      const { realizedGainLossBySaleId } = fifoPositionState(stockPurchases, stockSales);
      const yearSales = stockSales.filter((s) => s.date.slice(0, 4) === year);
      return sum + yearSales.reduce((acc, sale) => acc + parseFloat(realizedGainLossBySaleId[sale.id] ?? '0'), 0);
    }, 0)
    .toFixed(2);
}

/** Tramos de tributación de las ganancias patrimoniales (venta de acciones) según la normativa
 *  vigente en el ejercicio 2026: hasta 6.000 € al 19%, de 6.000,01 a 50.000 € al 21%, de 50.000,01 a
 *  200.000 € al 23% y el resto al 26%. `upTo` es el límite superior de cada tramo (acumulado, no el
 *  tamaño del tramo). */
const STOCK_CAPITAL_GAINS_TAX_BRACKETS = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: Infinity, rate: 0.26 },
];

/** Aplica los tramos progresivos de `STOCK_CAPITAL_GAINS_TAX_BRACKETS` a una base imponible ya neta
 *  (tras compensar pérdidas de otros ejercicios, ver `simulateLossCompensationForYear`), repartiéndola
 *  tramo a tramo (cada € tributa solo al tipo de su propio tramo, no al tipo marginal aplicado a todo
 *  el importe). Una base de 0 o negativa no genera impuesto. */
function calculateStockCapitalGainsTax(netTaxableAmount: number): {
  breakdown: Array<{ from: number; to: number; rate: number; taxableAmount: number; tax: number }>;
  totalTax: number;
} {
  const breakdown: Array<{ from: number; to: number; rate: number; taxableAmount: number; tax: number }> = [];
  if (netTaxableAmount <= 0) return { breakdown, totalTax: 0 };

  let remaining = netTaxableAmount;
  let previousLimit = 0;
  for (const bracket of STOCK_CAPITAL_GAINS_TAX_BRACKETS) {
    if (remaining <= 0) break;
    const taxableAmount = Math.min(remaining, bracket.upTo - previousLimit);
    breakdown.push({ from: previousLimit, to: bracket.upTo, rate: bracket.rate, taxableAmount, tax: taxableAmount * bracket.rate });
    remaining -= taxableAmount;
    previousLimit = bracket.upTo;
  }

  return { breakdown, totalTax: breakdown.reduce((sum, tramo) => sum + tramo.tax, 0) };
}

/** Compensación de pérdidas patrimoniales (art. 49 LIRPF): la pérdida de un ejercicio que no se
 *  compensa con ganancias del mismo año puede compensarse con ganancias de los 4 ejercicios
 *  SIGUIENTES; pasado ese plazo, la parte no usada caduca. Simula año a año, en orden cronológico
 *  desde el primero con ventas hasta `targetYear` (incluido), un "pool" de pérdidas pendientes por
 *  año de origen — cada año con ganancia consume primero las pérdidas más antiguas del pool (las que
 *  antes caducan), nunca pérdidas de años posteriores. Devuelve el detalle de `targetYear`: su
 *  ganancia/pérdida bruta, qué pérdidas de qué años se han usado para compensarla, la base imponible
 *  resultante (nunca negativa), las pérdidas que hayan caducado justo al llegar a este año sin
 *  haberse podido usar, y las que quedan pendientes de compensar en ejercicios futuros. */
function simulateLossCompensationForYear(
  yearlyGainLoss: Array<{ year: string; amount: number }>,
  targetYear: string,
): {
  grossAmount: number;
  compensatedLosses: Array<{ year: string; amount: number }>;
  netTaxableAmount: number;
  expiredLosses: Array<{ year: string; amount: number }>;
  pendingLossCarryforward: Array<{ year: string; amount: number; expiresAfterYear: string }>;
} {
  const yearsUpToTarget = yearlyGainLoss.filter((y) => y.year <= targetYear);
  // Defensivo: si el año pedido no tiene ventas (fuera del rango normal de uso, el selector de la UI
  // solo ofrece años con ventas), se procesa igualmente con ganancia/pérdida bruta 0 en vez de heredar
  // por error el resultado del último año anterior con ventas.
  if (!yearsUpToTarget.some((y) => y.year === targetYear)) yearsUpToTarget.push({ year: targetYear, amount: 0 });
  yearsUpToTarget.sort((a, b) => (a.year < b.year ? -1 : a.year > b.year ? 1 : 0));

  const pool: Array<{ year: string; remaining: number }> = [];
  let grossAmount = 0;
  let compensatedLosses: Array<{ year: string; amount: number }> = [];
  let netTaxableAmount = 0;
  let expiredLosses: Array<{ year: string; amount: number }> = [];

  for (const { year, amount } of yearsUpToTarget) {
    expiredLosses = [];
    for (let i = pool.length - 1; i >= 0; i--) {
      if (parseInt(year, 10) - parseInt(pool[i].year, 10) > 4) {
        expiredLosses.unshift({ year: pool[i].year, amount: pool[i].remaining });
        pool.splice(i, 1);
      }
    }

    grossAmount = amount;
    compensatedLosses = [];
    netTaxableAmount = 0;
    if (amount > 0) {
      let remainingGain = amount;
      for (const lot of pool) {
        if (remainingGain <= 0) break;
        const used = Math.min(lot.remaining, remainingGain);
        lot.remaining -= used;
        remainingGain -= used;
        compensatedLosses.push({ year: lot.year, amount: used });
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].remaining <= 0) pool.splice(i, 1);
      }
      netTaxableAmount = remainingGain;
    } else if (amount < 0) {
      pool.push({ year, remaining: -amount });
    }
  }

  const pendingLossCarryforward = pool.map((lot) => ({
    year: lot.year,
    amount: lot.remaining,
    expiresAfterYear: String(parseInt(lot.year, 10) + 4),
  }));

  return { grossAmount, compensatedLosses, netTaxableAmount, expiredLosses, pendingLossCarryforward };
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

/** H5 (spec 028): "coste de compra" de la categoría Vehículos para el gráfico de rentabilidad —
 *  suma de `purchasePrice` de todos los vehículos, mismo papel que `totalCost`/`totalCryptoCost`
 *  pero sin cantidad que multiplicar (un vehículo no tiene "cantidad", igual que `vehiclesTotal`). */
function totalVehiclePurchasePrice(vehicles: Vehicle[]): string {
  return vehicles.reduce((sum, v) => sum + parseFloat(v.purchasePrice), 0).toFixed(2);
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
function stocksTotal(stocks: Stock[], purchases: StockPurchase[], sales: StockSale[], valuations: StockValuation[]): string {
  return stocks
    .reduce((sum, stock) => {
      const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
      const stockSales = sales.filter((s) => s.stockId === stock.id);
      const lastValuation = valuations.find((v) => v.stockId === stock.id); // ya ordenado por fecha descendente
      if (!lastValuation) return sum;
      // spec 031 H3 criterio 5: el valor actual parte de las acciones EN CARTERA (tras ventas), no
      // del total histórico comprado — `fifoPositionState`, no `totalShares(stockPurchases)`.
      const { heldShares } = fifoPositionState(stockPurchases, stockSales);
      return sum + parseFloat(currentValue(lastValuation.pricePerShare, heldShares));
    }, 0)
    .toFixed(2);
}

/** H3 criterio 5 (spec 031): "coste de compra" agregado de Acciones para spec 028 H4/H5 y spec 030
 *  — suma del `heldCost` (coste FIFO de lo que queda en cartera) de cada posición, sustituyendo a
 *  `totalCost(purchases)` que sumaba el coste de TODO lo comprado alguna vez. */
function stocksHeldCost(stocks: Stock[], purchases: StockPurchase[], sales: StockSale[]): string {
  return stocks
    .reduce((sum, stock) => {
      const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
      const stockSales = sales.filter((s) => s.stockId === stock.id);
      return sum + parseFloat(fifoPositionState(stockPurchases, stockSales).heldCost);
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

/** H1 criterio 3 (spec 029): Bruto = Neto ÷ (1 − %Retención ÷ 100) — calculado, nunca guardado.
 *  Mismo criterio que `purchaseValue`/`currentValue`. Genérica para acciones y fondos. */
function grossDividend(netAmount: string, retentionPercent: string): string {
  const net = parseFloat(netAmount);
  const retention = parseFloat(retentionPercent);
  if (Number.isNaN(net) || Number.isNaN(retention)) return '';
  return (net / (1 - retention / 100)).toFixed(2);
}

/** H2/H3 (spec 029): total neto cobrado en dividendos — de una sola posición o de toda la
 *  cartera según qué lista se le pase. Tipo estructural, mismo criterio que `totalShares`. */
function totalDividends(dividends: Array<{ netAmount: string }>): string {
  return dividends.reduce((sum, d) => sum + parseFloat(d.netAmount), 0).toFixed(2);
}

/** H3 (spec 029): sumando "Acciones" de la tarjeta "💰 Dividendos cobrados" — dividendos de
 *  todas las acciones propias del usuario (filtra por `stockId` perteneciente a `stocks`,
 *  igual que `stocksTotal` filtra compras/valoraciones por posición). */
function stockDividendsTotal(stocks: Stock[], dividends: StockDividend[]): string {
  const stockIds = new Set(stocks.map((s) => s.id));
  return totalDividends(dividends.filter((d) => stockIds.has(d.stockId)));
}

/** H3 (spec 029): sumando "Fondos Inversión" de la tarjeta "💰 Dividendos cobrados" — mismo
 *  criterio que `stockDividendsTotal`. */
function fundDividendsTotal(funds: Fund[], dividends: FundDividend[]): string {
  const fundIds = new Set(funds.map((f) => f.id));
  return totalDividends(dividends.filter((d) => fundIds.has(d.fundId)));
}

/** H1 criterio 3 (spec 030): total de dividendos brutos de una lista — suma el bruto de cada
 *  dividendo individual (`grossDividend` por dividendo, no el bruto de la suma de netos), porque
 *  cada uno puede tener una retención distinta. */
function totalGrossDividends(dividends: Array<{ netAmount: string; retentionPercent: string }>): string {
  return dividends.reduce((sum, d) => sum + parseFloat(grossDividend(d.netAmount, d.retentionPercent) || '0'), 0).toFixed(2);
}

/** H2 (spec 030, agregado): total bruto de dividendos de todas las acciones/fondos del usuario —
 *  mismo criterio de filtrado por posición propia que `stockDividendsTotal`/`fundDividendsTotal`. */
function stockGrossDividendsTotal(stocks: Stock[], dividends: StockDividend[]): string {
  const stockIds = new Set(stocks.map((s) => s.id));
  return totalGrossDividends(dividends.filter((d) => stockIds.has(d.stockId)));
}

function fundGrossDividendsTotal(funds: Fund[], dividends: FundDividend[]): string {
  const fundIds = new Set(funds.map((f) => f.id));
  return totalGrossDividends(dividends.filter((d) => fundIds.has(d.fundId)));
}

/** H1 criterio 2/3 (spec 030): mismo `gainLossPercent` ya existente, pero sumando un importe de
 *  dividendos al valor actual antes de comparar con el coste — reutilizado tal cual, sin duplicar
 *  su lógica de `null` (coste 0, importes inválidos). */
function gainLossPercentWithDividends(currentVal: string, cost: string, dividendsTotal: string): number | null {
  const value = parseFloat(currentVal);
  const dividends = parseFloat(dividendsTotal);
  if (Number.isNaN(value) || Number.isNaN(dividends)) return null;
  return gainLossPercent((value + dividends).toFixed(2), cost);
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

/** H3 (spec 025): séptimo y último sumando de la tarjeta "Total" — mismo criterio que
 *  `vehiclesTotal`/`bankAccountsTotal` (último importe conocido de cada ubicación, o 0 si
 *  no tiene ninguna entrada todavía). */
function cashTotal(holdings: CashHolding[], balances: CashBalance[]): string {
  return holdings
    .reduce((sum, holding) => {
      const lastBalance = balances.find((b) => b.cashHoldingId === holding.id); // ya ordenado por fecha descendente
      return sum + (lastBalance ? parseFloat(lastBalance.amount) : 0);
    }, 0)
    .toFixed(2);
}

/** Las 7 categorías de spec 018 quedan implementadas tras spec 025 — sin ninguna pendiente. */
const PLACEHOLDER_SECTIONS: Array<{ icon: string; label: string }> = [];

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
  useOpenSectionFromHash(!isAuthLoading && isAuthenticated && isOnline);

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

  const [stockSaleList, setStockSaleList] = useState<StockSale[] | null>(null);
  const [stockSalesLoadError, setStockSalesLoadError] = useState<string | null>(null);
  const [newStockSaleForms, setNewStockSaleForms] = useState<Record<string, UpdateStockSaleInput>>({});
  const [createStockSaleError, setCreateStockSaleError] = useState<string | null>(null);
  const [creatingStockSaleForStockId, setCreatingStockSaleForStockId] = useState<string | null>(null);
  const [editingStockSaleId, setEditingStockSaleId] = useState<string | null>(null);
  const [editingStockSaleForm, setEditingStockSaleForm] = useState<UpdateStockSaleInput>(EMPTY_STOCK_SALE_FORM);
  const [editStockSaleError, setEditStockSaleError] = useState<string | null>(null);
  const [isSavingStockSale, setIsSavingStockSale] = useState(false);
  const [pendingDeleteStockSaleId, setPendingDeleteStockSaleId] = useState<string | null>(null);
  const [stockSaleActionError, setStockSaleActionError] = useState<string | null>(null);

  // Año seleccionado en "Cálculo de impuestos" — arranca en el año actual; si no hay ventas ese año,
  // el propio bloque de la sección lo sustituye por el año más reciente con ventas disponible.
  const [taxYear, setTaxYear] = useState<string>(() => String(new Date().getFullYear()));

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

  const [stockDividendList, setStockDividendList] = useState<StockDividend[] | null>(null);
  const [stockDividendsLoadError, setStockDividendsLoadError] = useState<string | null>(null);
  const [newStockDividendForms, setNewStockDividendForms] = useState<Record<string, UpdateStockDividendInput>>({});
  const [createStockDividendError, setCreateStockDividendError] = useState<string | null>(null);
  const [creatingStockDividendForStockId, setCreatingStockDividendForStockId] = useState<string | null>(null);
  const [editingStockDividendId, setEditingStockDividendId] = useState<string | null>(null);
  const [editingStockDividendForm, setEditingStockDividendForm] = useState<UpdateStockDividendInput>(EMPTY_STOCK_DIVIDEND_FORM);
  const [editStockDividendError, setEditStockDividendError] = useState<string | null>(null);
  const [isSavingStockDividend, setIsSavingStockDividend] = useState(false);
  const [pendingDeleteStockDividendId, setPendingDeleteStockDividendId] = useState<string | null>(null);
  const [stockDividendActionError, setStockDividendActionError] = useState<string | null>(null);

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

  const [fundDividendList, setFundDividendList] = useState<FundDividend[] | null>(null);
  const [fundDividendsLoadError, setFundDividendsLoadError] = useState<string | null>(null);
  const [newFundDividendForms, setNewFundDividendForms] = useState<Record<string, UpdateFundDividendInput>>({});
  const [createFundDividendError, setCreateFundDividendError] = useState<string | null>(null);
  const [creatingFundDividendForFundId, setCreatingFundDividendForFundId] = useState<string | null>(null);
  const [editingFundDividendId, setEditingFundDividendId] = useState<string | null>(null);
  const [editingFundDividendForm, setEditingFundDividendForm] = useState<UpdateFundDividendInput>(EMPTY_FUND_DIVIDEND_FORM);
  const [editFundDividendError, setEditFundDividendError] = useState<string | null>(null);
  const [isSavingFundDividend, setIsSavingFundDividend] = useState(false);
  const [pendingDeleteFundDividendId, setPendingDeleteFundDividendId] = useState<string | null>(null);
  const [fundDividendActionError, setFundDividendActionError] = useState<string | null>(null);

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

  const [cashHoldingList, setCashHoldingList] = useState<CashHolding[] | null>(null);
  const [cashHoldingsLoadError, setCashHoldingsLoadError] = useState<string | null>(null);
  const [newCashHoldingForm, setNewCashHoldingForm] = useState<CashHoldingInput>(EMPTY_CASH_HOLDING_FORM);
  const [createCashHoldingError, setCreateCashHoldingError] = useState<string | null>(null);
  const [isCreatingCashHolding, setIsCreatingCashHolding] = useState(false);
  const [editingCashHoldingId, setEditingCashHoldingId] = useState<string | null>(null);
  const [editingCashHoldingForm, setEditingCashHoldingForm] = useState<CashHoldingInput>(EMPTY_CASH_HOLDING_FORM);
  const [editCashHoldingError, setEditCashHoldingError] = useState<string | null>(null);
  const [isSavingCashHolding, setIsSavingCashHolding] = useState(false);
  const [pendingDeleteCashHoldingId, setPendingDeleteCashHoldingId] = useState<string | null>(null);
  const [cashHoldingActionError, setCashHoldingActionError] = useState<string | null>(null);

  const [cashBalanceList, setCashBalanceList] = useState<CashBalance[] | null>(null);
  const [cashBalancesLoadError, setCashBalancesLoadError] = useState<string | null>(null);
  const [newCashBalanceForms, setNewCashBalanceForms] = useState<Record<string, UpdateCashBalanceInput>>({});
  const [createCashBalanceError, setCreateCashBalanceError] = useState<string | null>(null);
  const [creatingCashBalanceForHoldingId, setCreatingCashBalanceForHoldingId] = useState<string | null>(null);
  const [editingCashBalanceId, setEditingCashBalanceId] = useState<string | null>(null);
  const [editingCashBalanceForm, setEditingCashBalanceForm] = useState<UpdateCashBalanceInput>(EMPTY_CASH_BALANCE_FORM);
  const [editCashBalanceError, setEditCashBalanceError] = useState<string | null>(null);
  const [isSavingCashBalance, setIsSavingCashBalance] = useState(false);
  const [pendingDeleteCashBalanceId, setPendingDeleteCashBalanceId] = useState<string | null>(null);
  const [cashBalanceActionError, setCashBalanceActionError] = useState<string | null>(null);

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

  async function reloadStockSales() {
    setStockSaleList(await listStockSales());
  }

  async function reloadValuations() {
    setValuations(await listStockValuations());
  }

  async function reloadStockDividends() {
    setStockDividendList(await listStockDividends());
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

  async function reloadFundDividends() {
    setFundDividendList(await listFundDividends());
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

  async function reloadCashHoldings() {
    setCashHoldingList(await listCashHoldings());
  }

  async function reloadCashBalances() {
    setCashBalanceList(await listCashBalances());
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
        await reloadStockSales();
      } catch (err) {
        if (!cancelled) setStockSalesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de ventas.');
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
        await reloadStockDividends();
      } catch (err) {
        if (!cancelled) setStockDividendsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de dividendos.');
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
        await reloadFundDividends();
      } catch (err) {
        if (!cancelled) setFundDividendsLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de dividendos.');
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

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        await reloadCashHoldings();
      } catch (err) {
        if (!cancelled) setCashHoldingsLoadError(err instanceof ApiError ? err.message : 'No se han podido cargar las ubicaciones de efectivo.');
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
        await reloadCashBalances();
      } catch (err) {
        if (!cancelled) setCashBalancesLoadError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial de efectivo.');
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
      await Promise.all([reloadStocks(), reloadPurchases(), reloadStockSales(), reloadValuations(), reloadStockDividends()]);
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

  function getNewStockSaleForm(stockId: string): UpdateStockSaleInput {
    return newStockSaleForms[stockId] ?? { shareCount: '', salePrice: '', date: todayIso() };
  }

  function setNewStockSaleForm(stockId: string, form: UpdateStockSaleInput) {
    setNewStockSaleForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreateStockSale(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStockSaleError(null);
    setCreatingStockSaleForStockId(stockId);
    try {
      const form = getNewStockSaleForm(stockId);
      await createStockSale({ stockId, shareCount: form.shareCount ?? '', salePrice: form.salePrice ?? '', date: form.date ?? todayIso() });
      setNewStockSaleForm(stockId, { shareCount: '', salePrice: '', date: todayIso() });
      await reloadStockSales();
    } catch (err) {
      setCreateStockSaleError(err instanceof ApiError ? err.message : 'No se ha podido añadir la venta.');
    } finally {
      setCreatingStockSaleForStockId(null);
    }
  }

  function startEditStockSale(sale: StockSale) {
    setEditStockSaleError(null);
    setEditingStockSaleId(sale.id);
    setEditingStockSaleForm(stockSaleFormFromEntity(sale));
  }

  async function handleEditStockSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStockSaleId) return;
    setEditStockSaleError(null);
    setIsSavingStockSale(true);
    try {
      await updateStockSale(editingStockSaleId, editingStockSaleForm);
      setEditingStockSaleId(null);
      await reloadStockSales();
    } catch (err) {
      setEditStockSaleError(err instanceof ApiError ? err.message : 'No se ha podido guardar la venta.');
    } finally {
      setIsSavingStockSale(false);
    }
  }

  async function handleDeleteStockSale(id: string) {
    setStockSaleActionError(null);
    setPendingDeleteStockSaleId(id);
    try {
      await deleteStockSale(id);
      await reloadStockSales();
    } catch (err) {
      setStockSaleActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la venta.');
    } finally {
      setPendingDeleteStockSaleId(null);
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

  function getNewStockDividendForm(stockId: string): UpdateStockDividendInput {
    return newStockDividendForms[stockId] ?? { netAmount: '', retentionPercent: '19', date: todayIso() };
  }

  function setNewStockDividendForm(stockId: string, form: UpdateStockDividendInput) {
    setNewStockDividendForms((prev) => ({ ...prev, [stockId]: form }));
  }

  async function handleCreateStockDividend(stockId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStockDividendError(null);
    setCreatingStockDividendForStockId(stockId);
    try {
      const form = getNewStockDividendForm(stockId);
      await createStockDividend({
        stockId,
        netAmount: form.netAmount ?? '',
        retentionPercent: form.retentionPercent,
        date: form.date ?? todayIso(),
      });
      setNewStockDividendForm(stockId, { netAmount: '', retentionPercent: '19', date: todayIso() });
      await reloadStockDividends();
    } catch (err) {
      setCreateStockDividendError(err instanceof ApiError ? err.message : 'No se ha podido añadir el dividendo.');
    } finally {
      setCreatingStockDividendForStockId(null);
    }
  }

  function startEditStockDividend(dividend: StockDividend) {
    setEditStockDividendError(null);
    setEditingStockDividendId(dividend.id);
    setEditingStockDividendForm(stockDividendFormFromEntity(dividend));
  }

  async function handleEditStockDividend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStockDividendId) return;
    setEditStockDividendError(null);
    setIsSavingStockDividend(true);
    try {
      await updateStockDividend(editingStockDividendId, editingStockDividendForm);
      setEditingStockDividendId(null);
      await reloadStockDividends();
    } catch (err) {
      setEditStockDividendError(err instanceof ApiError ? err.message : 'No se ha podido guardar el dividendo.');
    } finally {
      setIsSavingStockDividend(false);
    }
  }

  async function handleDeleteStockDividend(id: string) {
    setStockDividendActionError(null);
    setPendingDeleteStockDividendId(id);
    try {
      await deleteStockDividend(id);
      await reloadStockDividends();
    } catch (err) {
      setStockDividendActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el dividendo.');
    } finally {
      setPendingDeleteStockDividendId(null);
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
      await Promise.all([reloadFunds(), reloadFundPurchases(), reloadFundValuations(), reloadFundDividends()]);
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

  function getNewFundDividendForm(fundId: string): UpdateFundDividendInput {
    return newFundDividendForms[fundId] ?? { netAmount: '', retentionPercent: '19', date: todayIso() };
  }

  function setNewFundDividendForm(fundId: string, form: UpdateFundDividendInput) {
    setNewFundDividendForms((prev) => ({ ...prev, [fundId]: form }));
  }

  async function handleCreateFundDividend(fundId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateFundDividendError(null);
    setCreatingFundDividendForFundId(fundId);
    try {
      const form = getNewFundDividendForm(fundId);
      await createFundDividend({
        fundId,
        netAmount: form.netAmount ?? '',
        retentionPercent: form.retentionPercent,
        date: form.date ?? todayIso(),
      });
      setNewFundDividendForm(fundId, { netAmount: '', retentionPercent: '19', date: todayIso() });
      await reloadFundDividends();
    } catch (err) {
      setCreateFundDividendError(err instanceof ApiError ? err.message : 'No se ha podido añadir el dividendo.');
    } finally {
      setCreatingFundDividendForFundId(null);
    }
  }

  function startEditFundDividend(dividend: FundDividend) {
    setEditFundDividendError(null);
    setEditingFundDividendId(dividend.id);
    setEditingFundDividendForm(fundDividendFormFromEntity(dividend));
  }

  async function handleEditFundDividend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFundDividendId) return;
    setEditFundDividendError(null);
    setIsSavingFundDividend(true);
    try {
      await updateFundDividend(editingFundDividendId, editingFundDividendForm);
      setEditingFundDividendId(null);
      await reloadFundDividends();
    } catch (err) {
      setEditFundDividendError(err instanceof ApiError ? err.message : 'No se ha podido guardar el dividendo.');
    } finally {
      setIsSavingFundDividend(false);
    }
  }

  async function handleDeleteFundDividend(id: string) {
    setFundDividendActionError(null);
    setPendingDeleteFundDividendId(id);
    try {
      await deleteFundDividend(id);
      await reloadFundDividends();
    } catch (err) {
      setFundDividendActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el dividendo.');
    } finally {
      setPendingDeleteFundDividendId(null);
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

  async function handleCreateCashHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateCashHoldingError(null);
    setIsCreatingCashHolding(true);
    try {
      await createCashHolding(newCashHoldingForm);
      setNewCashHoldingForm(EMPTY_CASH_HOLDING_FORM);
      await reloadCashHoldings();
    } catch (err) {
      setCreateCashHoldingError(err instanceof ApiError ? err.message : 'No se ha podido crear la ubicación.');
    } finally {
      setIsCreatingCashHolding(false);
    }
  }

  function startEditCashHolding(holding: CashHolding) {
    setEditCashHoldingError(null);
    setEditingCashHoldingId(holding.id);
    setEditingCashHoldingForm(cashHoldingFormFromEntity(holding));
  }

  async function handleEditCashHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCashHoldingId) return;
    setEditCashHoldingError(null);
    setIsSavingCashHolding(true);
    try {
      await updateCashHolding(editingCashHoldingId, editingCashHoldingForm);
      setEditingCashHoldingId(null);
      await reloadCashHoldings();
    } catch (err) {
      setEditCashHoldingError(err instanceof ApiError ? err.message : 'No se ha podido guardar la ubicación.');
    } finally {
      setIsSavingCashHolding(false);
    }
  }

  async function handleDeleteCashHolding(id: string) {
    setCashHoldingActionError(null);
    setPendingDeleteCashHoldingId(id);
    try {
      await deleteCashHolding(id);
      await Promise.all([reloadCashHoldings(), reloadCashBalances()]);
    } catch (err) {
      setCashHoldingActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar la ubicación.');
    } finally {
      setPendingDeleteCashHoldingId(null);
    }
  }

  function getNewCashBalanceForm(holdingId: string): UpdateCashBalanceInput {
    return newCashBalanceForms[holdingId] ?? { amount: '', date: todayIso() };
  }

  function setNewCashBalanceForm(holdingId: string, form: UpdateCashBalanceInput) {
    setNewCashBalanceForms((prev) => ({ ...prev, [holdingId]: form }));
  }

  async function handleCreateCashBalance(holdingId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateCashBalanceError(null);
    setCreatingCashBalanceForHoldingId(holdingId);
    try {
      const form = getNewCashBalanceForm(holdingId);
      await createCashBalance({ cashHoldingId: holdingId, amount: form.amount ?? '', date: form.date ?? todayIso() });
      setNewCashBalanceForm(holdingId, { amount: '', date: todayIso() });
      await reloadCashBalances();
    } catch (err) {
      setCreateCashBalanceError(err instanceof ApiError ? err.message : 'No se ha podido añadir el importe.');
    } finally {
      setCreatingCashBalanceForHoldingId(null);
    }
  }

  function startEditCashBalance(balance: CashBalance) {
    setEditCashBalanceError(null);
    setEditingCashBalanceId(balance.id);
    setEditingCashBalanceForm(cashBalanceFormFromEntity(balance));
  }

  async function handleEditCashBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCashBalanceId) return;
    setEditCashBalanceError(null);
    setIsSavingCashBalance(true);
    try {
      await updateCashBalance(editingCashBalanceId, editingCashBalanceForm);
      setEditingCashBalanceId(null);
      await reloadCashBalances();
    } catch (err) {
      setEditCashBalanceError(err instanceof ApiError ? err.message : 'No se ha podido guardar el importe.');
    } finally {
      setIsSavingCashBalance(false);
    }
  }

  async function handleDeleteCashBalance(id: string) {
    setCashBalanceActionError(null);
    setPendingDeleteCashBalanceId(id);
    try {
      await deleteCashBalance(id);
      await reloadCashBalances();
    } catch (err) {
      setCashBalanceActionError(err instanceof ApiError ? err.message : 'No se ha podido eliminar el importe.');
    } finally {
      setPendingDeleteCashBalanceId(null);
    }
  }

  // Spec 027 (Evolución del Patrimonio): estado del selector de rango (H2). `confirmedCustomRange`
  // guarda el último rango personalizado VÁLIDO — si el usuario deja los inputs en un estado
  // inválido, el gráfico se queda con el último rango válido en vez de desaparecer (H2 criterio 3).
  // Declarados junto al resto de hooks, antes de los `return` condicionales de más abajo (sesión/
  // conectividad) — los hooks de React no pueden depender de una rama condicional.
  const [rangeMode, setRangeMode] = useState<WealthEvolutionRangeMode>('last12Months');
  // Spec 028 H1/H2: 3 vistas de la misma serie/rango — no triplica el selector de Periodo.
  const [evolutionView, setEvolutionView] = useState<'total' | 'byCategory' | 'liquidity'>('total');
  const [customStart, setCustomStart] = useState(todayIso());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [confirmedCustomRange, setConfirmedCustomRange] = useState<CustomRange>({ start: todayIso(), end: todayIso() });

  function handleCustomRangeChange(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    if (isValidCustomRange(start, end, new Date())) {
      setConfirmedCustomRange({ start, end });
    }
  }

  const customRangeInvalid = rangeMode === 'custom' && !isValidCustomRange(customStart, customEnd, new Date());

  // Todo el histórico de las 7 categorías, tal cual ya lo carga esta página (plan.md §0) —
  // mismos datos que alimentan `bankAccountsTotal`/`stocksTotal`/etc., con una fecha de más.
  const wealthEvolutionData = useMemo(
    () => ({
      bankAccounts: accounts ?? [],
      bankAccountBalances: balances ?? [],
      stocks: stockList ?? [],
      stockPurchases: purchases ?? [],
      stockValuations: valuations ?? [],
      funds: fundList ?? [],
      fundPurchases: fundPurchases ?? [],
      fundValuations: fundValuations ?? [],
      cryptos: cryptoList ?? [],
      cryptoPurchases: cryptoPurchaseList ?? [],
      cryptoValuations: cryptoValuationList ?? [],
      vehicles: vehicleList ?? [],
      vehicleValuations: vehicleValuationList ?? [],
      pensionPlans: pensionPlanList ?? [],
      pensionPlanValuations: pensionPlanValuationList ?? [],
      cashHoldings: cashHoldingList ?? [],
      cashBalances: cashBalanceList ?? [],
    }),
    [
      accounts,
      balances,
      stockList,
      purchases,
      valuations,
      fundList,
      fundPurchases,
      fundValuations,
      cryptoList,
      cryptoPurchaseList,
      cryptoValuationList,
      vehicleList,
      vehicleValuationList,
      pensionPlanList,
      pensionPlanValuationList,
      cashHoldingList,
      cashBalanceList,
    ],
  );

  const wealthEvolutionRange = useMemo(
    () => resolveRange(rangeMode, rangeMode === 'custom' ? confirmedCustomRange : null, wealthEvolutionData, new Date()),
    [rangeMode, confirmedCustomRange, wealthEvolutionData],
  );

  const wealthEvolutionPoints = useMemo(
    () =>
      wealthEvolutionRange
        ? wealthEvolutionSeries(wealthEvolutionData, wealthEvolutionRange.start, wealthEvolutionRange.end)
        : [],
    [wealthEvolutionData, wealthEvolutionRange],
  );

  // Spec 028 H1: misma serie de semanas que `wealthEvolutionPoints`, desglosada por categoría en
  // vez de sumada — para la vista "Por categoría" (área apilada).
  const wealthEvolutionByCategoryPoints = useMemo(
    () =>
      wealthEvolutionRange
        ? wealthEvolutionByCategorySeries(wealthEvolutionData, wealthEvolutionRange.start, wealthEvolutionRange.end)
        : [],
    [wealthEvolutionData, wealthEvolutionRange],
  );

  // Spec 028 H2: mismo rango, % de liquidez semana a semana — para la vista "Liquidez".
  const liquidityPoints = useMemo(
    () =>
      wealthEvolutionRange ? liquidityRatioSeries(wealthEvolutionData, wealthEvolutionRange.start, wealthEvolutionRange.end) : [],
    [wealthEvolutionData, wealthEvolutionRange],
  );

  // H2 criterio 4 (spec 027): ni el gráfico ni un rango sin ningún dato real deben verse como un
  // gráfico vacío sin explicación — se trata igual un rango sin ningún punto que uno donde todos
  // los puntos dan 0. Las 3 vistas comparten el mismo rango/datos subyacentes (spec 028 §3), así
  // que un único chequeo sobre el total basta para las 3 (si el total es 0 en todas las semanas,
  // cada categoría y el ratio de liquidez también lo son).
  const hasWealthEvolutionData = wealthEvolutionPoints.some((point) => point.total > 0);

  // H1 criterio 2 (spec 028): una categoría sin ninguna entrada en todo el rango elegido no
  // aparece en el área apilada ni en la leyenda/tabla de la vista "Por categoría".
  const activeWealthCategories = useMemo(
    () => WEALTH_CATEGORIES.filter((category) => wealthEvolutionByCategoryPoints.some((point) => point[category.key] > 0)),
    [wealthEvolutionByCategoryPoints],
  );

  // Spec 028 H3: foto de "hoy" de las 7 categorías (mismos `*Total` que la tarjeta "Total"), sin
  // selector de rango. `row` lleva las 7 claves siempre (para el `stackId` del gráfico); `rows`
  // es el subconjunto con subtotal > 0 (H3 criterio 3 — leyenda/tabla/gráfico solo muestran esas).
  const compositionData = useMemo(() => {
    const row: Record<(typeof WEALTH_CATEGORIES)[number]['key'], number> & { name: string } = {
      name: 'Patrimonio',
      bankAccounts: parseFloat(bankAccountsTotal(accounts ?? [], balances ?? [])),
      stocks: parseFloat(stocksTotal(stockList ?? [], purchases ?? [], stockSaleList ?? [], valuations ?? [])),
      funds: parseFloat(fundsTotal(fundList ?? [], fundPurchases ?? [], fundValuations ?? [])),
      cryptos: parseFloat(cryptosTotal(cryptoList ?? [], cryptoPurchaseList ?? [], cryptoValuationList ?? [])),
      vehicles: parseFloat(vehiclesTotal(vehicleList ?? [], vehicleValuationList ?? [])),
      pensionPlans: parseFloat(pensionPlansTotal(pensionPlanList ?? [], pensionPlanValuationList ?? [])),
      cash: parseFloat(cashTotal(cashHoldingList ?? [], cashBalanceList ?? [])),
    };
    const rows = WEALTH_CATEGORIES.map((category) => ({ ...category, value: row[category.key] })).filter((r) => r.value > 0);
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    return { row, rows, total };
  }, [
    accounts,
    balances,
    stockList,
    purchases,
    stockSaleList,
    valuations,
    fundList,
    fundPurchases,
    fundValuations,
    cryptoList,
    cryptoPurchaseList,
    cryptoValuationList,
    vehicleList,
    vehicleValuationList,
    pensionPlanList,
    pensionPlanValuationList,
    cashHoldingList,
    cashBalanceList,
  ]);

  // Spec 028 H4: foto de "hoy" — Acciones/Fondos/Cripto/Fondo Pensiones son las únicas categorías
  // con historial de aportación/compra (spec.md decisión de negocio). Una categoría sin ninguna
  // posición (aportado y valor actual ambos 0) no aparece (H4 criterio 3).
  const contributionVsValueData = useMemo(() => {
    const rows = [
      {
        category: 'Acciones',
        // spec 031 H3 criterio 5: coste de lo que queda en cartera (tras ventas), no de todo lo
        // comprado alguna vez — `stocksHeldCost`, no `totalCost(purchases)`.
        aportado: parseFloat(stocksHeldCost(stockList ?? [], purchases ?? [], stockSaleList ?? [])),
        valorActual: parseFloat(stocksTotal(stockList ?? [], purchases ?? [], stockSaleList ?? [], valuations ?? [])),
      },
      {
        category: 'Fondos Inversión',
        aportado: parseFloat(totalCost(fundPurchases ?? [])),
        valorActual: parseFloat(fundsTotal(fundList ?? [], fundPurchases ?? [], fundValuations ?? [])),
      },
      {
        category: 'Cripto',
        aportado: parseFloat(totalCryptoCost(cryptoPurchaseList ?? [])),
        valorActual: parseFloat(cryptosTotal(cryptoList ?? [], cryptoPurchaseList ?? [], cryptoValuationList ?? [])),
      },
      {
        category: 'Fondo Pensiones',
        aportado: parseFloat(totalContributions(pensionPlanContributionList ?? [])),
        valorActual: parseFloat(pensionPlansTotal(pensionPlanList ?? [], pensionPlanValuationList ?? [])),
      },
    ].filter((row) => row.aportado > 0 || row.valorActual > 0);
    return {
      rows,
      totalAportado: rows.reduce((sum, row) => sum + row.aportado, 0),
      totalValorActual: rows.reduce((sum, row) => sum + row.valorActual, 0),
    };
  }, [
    purchases,
    stockList,
    stockSaleList,
    valuations,
    fundPurchases,
    fundList,
    fundValuations,
    cryptoPurchaseList,
    cryptoList,
    cryptoValuationList,
    pensionPlanContributionList,
    pensionPlanList,
    pensionPlanValuationList,
  ]);

  // Spec 028 H5: foto de "hoy" — mismo % que ya usa cada posición individual (`gainLossPercent`),
  // agregado a nivel de categoría completa. Cuentas Bancarias/Efectivo quedan fuera (sin coste de
  // compra, H5 criterio 3); una categoría sin posiciones o con coste 0 no muestra barra (criterio 2).
  // Spec 030 H2: Acciones y Fondos Inversión añaden hasta dos filas más (con dividendos netos/brutos)
  // cuando la categoría tiene al menos un euro de dividendos cobrados — `pushCategoryRows` centraliza
  // ese criterio para no repetirlo 5 veces; Cripto/Vehículos/Fondo Pensiones le pasan '0.00' de
  // dividendos, así que nunca añaden filas extra (mismo resultado que antes de spec 030).
  const profitabilityData = useMemo(() => {
    function pushCategoryRows(
      rows: Array<{ category: string; pct: number }>,
      label: string,
      currentVal: string,
      cost: string,
      netDividends: string,
      grossDividends: string,
    ) {
      const pct = gainLossPercent(currentVal, cost);
      if (pct === null) return;
      rows.push({ category: label, pct });
      if (parseFloat(netDividends) > 0) {
        const pctNet = gainLossPercentWithDividends(currentVal, cost, netDividends);
        const pctGross = gainLossPercentWithDividends(currentVal, cost, grossDividends);
        if (pctNet !== null) rows.push({ category: `${label} (con dividendos netos)`, pct: pctNet });
        if (pctGross !== null) rows.push({ category: `${label} (con dividendos brutos)`, pct: pctGross });
      }
    }

    const rows: Array<{ category: string; pct: number }> = [];
    pushCategoryRows(
      rows,
      'Acciones',
      stocksTotal(stockList ?? [], purchases ?? [], stockSaleList ?? [], valuations ?? []),
      // spec 031 H3 criterio 5: coste de lo que queda en cartera, no `totalCost(purchases)` (todo lo comprado).
      stocksHeldCost(stockList ?? [], purchases ?? [], stockSaleList ?? []),
      stockDividendsTotal(stockList ?? [], stockDividendList ?? []),
      stockGrossDividendsTotal(stockList ?? [], stockDividendList ?? []),
    );
    pushCategoryRows(
      rows,
      'Fondos Inversión',
      fundsTotal(fundList ?? [], fundPurchases ?? [], fundValuations ?? []),
      totalCost(fundPurchases ?? []),
      fundDividendsTotal(fundList ?? [], fundDividendList ?? []),
      fundGrossDividendsTotal(fundList ?? [], fundDividendList ?? []),
    );
    pushCategoryRows(
      rows,
      'Cripto',
      cryptosTotal(cryptoList ?? [], cryptoPurchaseList ?? [], cryptoValuationList ?? []),
      totalCryptoCost(cryptoPurchaseList ?? []),
      '0.00',
      '0.00',
    );
    pushCategoryRows(
      rows,
      'Vehículos',
      vehiclesTotal(vehicleList ?? [], vehicleValuationList ?? []),
      totalVehiclePurchasePrice(vehicleList ?? []),
      '0.00',
      '0.00',
    );
    pushCategoryRows(
      rows,
      'Fondo Pensiones',
      pensionPlansTotal(pensionPlanList ?? [], pensionPlanValuationList ?? []),
      totalContributions(pensionPlanContributionList ?? []),
      '0.00',
      '0.00',
    );
    return rows;
  }, [
    stockList,
    purchases,
    stockSaleList,
    valuations,
    stockDividendList,
    fundList,
    fundPurchases,
    fundValuations,
    fundDividendList,
    cryptoList,
    cryptoPurchaseList,
    cryptoValuationList,
    vehicleList,
    vehicleValuationList,
    pensionPlanList,
    pensionPlanContributionList,
    pensionPlanValuationList,
  ]);

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
    stockSaleList !== null &&
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
    pensionPlanValuationList !== null &&
    cashHoldingList !== null &&
    cashBalanceList !== null;

  // H3 (spec 029): tarjeta aparte de "Total" — depende solo de las listas que necesita, no de
  // `canShowTotal` (evita esperar a categorías que nada tienen que ver, p. ej. Efectivo).
  const canShowDividendsTotal = stockList !== null && stockDividendList !== null && fundList !== null && fundDividendList !== null;

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
                parseFloat(stocksTotal(stockList, purchases, stockSaleList, valuations)) +
                parseFloat(fundsTotal(fundList, fundPurchases, fundValuations)) +
                parseFloat(cryptosTotal(cryptoList, cryptoPurchaseList, cryptoValuationList)) +
                parseFloat(vehiclesTotal(vehicleList, vehicleValuationList)) +
                parseFloat(pensionPlansTotal(pensionPlanList, pensionPlanValuationList)) +
                parseFloat(cashTotal(cashHoldingList, cashBalanceList))
              ).toFixed(2),
            )}
          </span>
          <p className="card-meta">
            Cuentas Bancarias: {formatCurrency(bankAccountsTotal(accounts, balances))} · Acciones:{' '}
            {formatCurrency(stocksTotal(stockList, purchases, stockSaleList, valuations))} · Fondos Inversión:{' '}
            {formatCurrency(fundsTotal(fundList, fundPurchases, fundValuations))} · Cripto:{' '}
            {formatCurrency(cryptosTotal(cryptoList, cryptoPurchaseList, cryptoValuationList))} · Vehículos:{' '}
            {formatCurrency(vehiclesTotal(vehicleList, vehicleValuationList))} · Fondo Pensiones:{' '}
            {formatCurrency(pensionPlansTotal(pensionPlanList, pensionPlanValuationList))} · Efectivo:{' '}
            {formatCurrency(cashTotal(cashHoldingList, cashBalanceList))}
          </p>
        </div>
      )}

      {canShowDividendsTotal && (
        <div className="card elev-sm" id="wealth-dividends-summary">
          <span className="card-title">💰 Dividendos cobrados</span>
          <span className="card-amount">
            {formatCurrency(
              (
                parseFloat(stockDividendsTotal(stockList, stockDividendList)) + parseFloat(fundDividendsTotal(fundList, fundDividendList))
              ).toFixed(2),
            )}
          </span>
          <p className="card-meta">
            Acciones: {formatCurrency(stockDividendsTotal(stockList, stockDividendList))} · Fondos Inversión:{' '}
            {formatCurrency(fundDividendsTotal(fundList, fundDividendList))}
          </p>
        </div>
      )}

      {canShowTotal && compositionData.rows.length > 0 && (
        <div className="card elev-sm" id="wealth-composition">
          <span className="card-title">Composición actual</span>
          <div style={{ width: '100%', height: 140 }}>
            <ResponsiveContainer>
              <BarChart data={[compositionData.row]} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" tickFormatter={(value: number) => formatCurrency(value.toFixed(2))} tick={WEALTH_CHART_TICK_STYLE} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  contentStyle={WEALTH_CHART_TOOLTIP_STYLE}
                  formatter={(value) => formatCurrency(Number(value).toFixed(2))}
                />
                <Legend wrapperStyle={WEALTH_CHART_TOOLTIP_STYLE} />
                {compositionData.rows.map((row) => (
                  <Bar key={row.key} dataKey={row.key} name={row.label} stackId="composition" fill={row.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="table">
            <caption>Composición actual (tabla)</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Importe</th>
                <th scope="col">%</th>
              </tr>
            </thead>
            <tbody>
              {compositionData.rows.map((row) => (
                <tr key={row.key}>
                  <td data-label="Categoría">{row.label}</td>
                  <td data-label="Importe">{formatCurrency(row.value.toFixed(2))}</td>
                  <td data-label="%">{((row.value / compositionData.total) * 100).toFixed(1)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canShowTotal && contributionVsValueData.rows.length > 0 && (
        <div className="card elev-sm" id="wealth-contribution-vs-value">
          <span className="card-title">Aportado vs. valor actual</span>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={contributionVsValueData.rows} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={WEALTH_CHART_TICK_STYLE} />
                <YAxis tickFormatter={(value: number) => formatCurrency(value.toFixed(2))} tick={WEALTH_CHART_TICK_STYLE} />
                <Tooltip
                  contentStyle={WEALTH_CHART_TOOLTIP_STYLE}
                  formatter={(value) => formatCurrency(Number(value).toFixed(2))}
                />
                <Legend wrapperStyle={WEALTH_CHART_TOOLTIP_STYLE} />
                <Bar dataKey="aportado" name="Aportado" fill="var(--neutral-500)" />
                <Bar dataKey="valorActual" name="Valor actual" fill="var(--accent-500)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="table">
            <caption>Aportado vs. valor actual (tabla)</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Aportado</th>
                <th scope="col">Valor actual</th>
              </tr>
            </thead>
            <tbody>
              {contributionVsValueData.rows.map((row) => (
                <tr key={row.category}>
                  <td data-label="Categoría">{row.category}</td>
                  <td data-label="Aportado">{formatCurrency(row.aportado.toFixed(2))}</td>
                  <td data-label="Valor actual">{formatCurrency(row.valorActual.toFixed(2))}</td>
                </tr>
              ))}
              <tr>
                <td data-label="Categoría">
                  <strong>Total</strong>
                </td>
                <td data-label="Aportado">
                  <strong>{formatCurrency(contributionVsValueData.totalAportado.toFixed(2))}</strong>
                </td>
                <td data-label="Valor actual">
                  <strong>{formatCurrency(contributionVsValueData.totalValorActual.toFixed(2))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canShowTotal && profitabilityData.length > 0 && (
        <div className="card elev-sm" id="wealth-profitability">
          <span className="card-title">Rentabilidad por categoría</span>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={profitabilityData} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={WEALTH_CHART_TICK_STYLE} />
                <YAxis
                  domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]}
                  tickFormatter={(value: number) => `${value.toFixed(0)} %`}
                  tick={WEALTH_CHART_TICK_STYLE}
                />
                <Tooltip contentStyle={WEALTH_CHART_TOOLTIP_STYLE} formatter={(value) => `${Number(value).toFixed(1)} %`} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Bar dataKey="pct" name="Rentabilidad">
                  {profitabilityData.map((row) => (
                    <Cell key={row.category} fill={row.pct >= 0 ? 'var(--status-green)' : 'var(--status-red)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="table">
            <caption>Rentabilidad por categoría (tabla)</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Rentabilidad</th>
              </tr>
            </thead>
            <tbody>
              {profitabilityData.map((row) => (
                <tr key={row.category}>
                  <td data-label="Categoría">{row.category}</td>
                  <td data-label="Rentabilidad">
                    {row.pct >= 0 ? '+' : ''}
                    {row.pct.toFixed(1)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canShowTotal && (
        <div className="card elev-sm" id="wealth-evolution">
          <span className="card-title">Evolución del patrimonio</span>

          <div className="field">
            <label htmlFor="wealth-evolution-range">Periodo</label>
            <select
              id="wealth-evolution-range"
              className="input"
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as WealthEvolutionRangeMode)}
            >
              {RANGE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="wealth-evolution-view">Vista</label>
            <select
              id="wealth-evolution-view"
              className="input"
              value={evolutionView}
              onChange={(e) => setEvolutionView(e.target.value as 'total' | 'byCategory' | 'liquidity')}
            >
              {EVOLUTION_VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {rangeMode === 'custom' && (
            <>
              <div className="field">
                <label htmlFor="wealth-evolution-custom-start">Desde</label>
                <input
                  id="wealth-evolution-custom-start"
                  type="date"
                  className="input"
                  value={customStart}
                  onChange={(e) => handleCustomRangeChange(e.target.value, customEnd)}
                />
              </div>
              <div className="field">
                <label htmlFor="wealth-evolution-custom-end">Hasta</label>
                <input
                  id="wealth-evolution-custom-end"
                  type="date"
                  className="input"
                  value={customEnd}
                  onChange={(e) => handleCustomRangeChange(customStart, e.target.value)}
                />
              </div>
              {customRangeInvalid && (
                <p role="alert">La fecha de fin no puede ser anterior a la de inicio, ni posterior a hoy.</p>
              )}
            </>
          )}

          {hasWealthEvolutionData && evolutionView === 'total' && (
            <>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={wealthEvolutionPoints} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekEnding" tickFormatter={formatDate} tick={WEALTH_CHART_TICK_STYLE} />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value.toFixed(2))} tick={WEALTH_CHART_TICK_STYLE} />
                    <Tooltip
                      contentStyle={WEALTH_CHART_TOOLTIP_STYLE}
                      labelFormatter={(label) => formatDate(String(label))}
                      formatter={(value) => [formatCurrency(Number(value).toFixed(2)), 'Patrimonio total']}
                    />
                    <Line type="monotone" dataKey="total" name="Patrimonio total" stroke={COLOR_WEALTH_TOTAL} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Mismo criterio que "Evolución mensual" en DashboardPage.tsx: tabla accesible con
                  los mismos datos que el gráfico, no solo un SVG que un lector de pantalla no puede leer. */}
              <table className="table">
                <caption>Evolución del patrimonio (tabla)</caption>
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    <th scope="col">Patrimonio total</th>
                  </tr>
                </thead>
                <tbody>
                  {wealthEvolutionPoints.map((point) => (
                    <tr key={point.weekEnding}>
                      <td data-label="Semana">{point.weekEnding}</td>
                      <td data-label="Patrimonio total">{formatCurrency(point.total.toFixed(2))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {hasWealthEvolutionData && evolutionView === 'byCategory' && (
            <>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <AreaChart data={wealthEvolutionByCategoryPoints} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekEnding" tickFormatter={formatDate} tick={WEALTH_CHART_TICK_STYLE} />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value.toFixed(2))} tick={WEALTH_CHART_TICK_STYLE} />
                    <Tooltip
                      contentStyle={WEALTH_CHART_TOOLTIP_STYLE}
                      labelFormatter={(label) => formatDate(String(label))}
                      formatter={(value) => formatCurrency(Number(value).toFixed(2))}
                    />
                    <Legend wrapperStyle={WEALTH_CHART_TOOLTIP_STYLE} />
                    {activeWealthCategories.map((category) => (
                      <Area
                        key={category.key}
                        type="monotone"
                        dataKey={category.key}
                        name={category.label}
                        stackId="wealth-by-category"
                        stroke={category.color}
                        fill={category.color}
                        fillOpacity={0.85}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <table className="table">
                <caption>Composición del patrimonio por semana (tabla)</caption>
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    {activeWealthCategories.map((category) => (
                      <th scope="col" key={category.key}>
                        {category.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wealthEvolutionByCategoryPoints.map((point) => (
                    <tr key={point.weekEnding}>
                      <td data-label="Semana">{point.weekEnding}</td>
                      {activeWealthCategories.map((category) => (
                        <td data-label={category.label} key={category.key}>
                          {formatCurrency(point[category.key].toFixed(2))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {hasWealthEvolutionData && evolutionView === 'liquidity' && (
            <>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={liquidityPoints} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekEnding" tickFormatter={formatDate} tick={WEALTH_CHART_TICK_STYLE} />
                    <YAxis tickFormatter={(value: number) => `${value.toFixed(0)} %`} tick={WEALTH_CHART_TICK_STYLE} />
                    <Tooltip
                      contentStyle={WEALTH_CHART_TOOLTIP_STYLE}
                      labelFormatter={(label) => formatDate(String(label))}
                      formatter={(value) => [`${Number(value).toFixed(1)} %`, 'Liquidez']}
                    />
                    <Line
                      type="monotone"
                      dataKey="ratioPercent"
                      name="Liquidez"
                      stroke={COLOR_WEALTH_TOTAL}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table className="table">
                <caption>Liquidez del patrimonio por semana (tabla)</caption>
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    <th scope="col">% líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidityPoints.map((point) => (
                    <tr key={point.weekEnding}>
                      <td data-label="Semana">{point.weekEnding}</td>
                      <td data-label="% líquido">{point.ratioPercent === null ? 'N/D' : `${point.ratioPercent.toFixed(1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {!hasWealthEvolutionData && <p>No hay datos de patrimonio en este periodo.</p>}
        </div>
      )}

      <details className="dashboard-section" id="wealth-cuentas-bancarias">
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

        <details className="dashboard-section">
          <summary>
            <h3>Añadir cuenta</h3>
          </summary>
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
      </details>

      <details className="dashboard-section" id="wealth-acciones">
        <summary>
          <h2>📈 Acciones</h2>
        </summary>

        {stocksLoadError && <p role="alert">{stocksLoadError}</p>}
        {purchasesLoadError && <p role="alert">{purchasesLoadError}</p>}
        {stockSalesLoadError && <p role="alert">{stockSalesLoadError}</p>}
        {valuationsLoadError && <p role="alert">{valuationsLoadError}</p>}
        {stockDividendsLoadError && <p role="alert">{stockDividendsLoadError}</p>}
        {stockActionError && <p role="alert">{stockActionError}</p>}
        {purchaseActionError && <p role="alert">{purchaseActionError}</p>}
        {stockSaleActionError && <p role="alert">{stockSaleActionError}</p>}
        {valuationActionError && <p role="alert">{valuationActionError}</p>}
        {stockDividendActionError && <p role="alert">{stockDividendActionError}</p>}

        {stockList && stockList.length === 0 && <p>Todavía no tienes ninguna acción.</p>}

        {stockList &&
          stockList.length > 0 &&
          (() => {
            // Distingue las posiciones abiertas (todavía con acciones en cartera) de las cerradas
            // (se compró y ya se vendió todo) — ver `isStockPositionClosed`.
            const openStockList = stockList.filter(
              (stock) =>
                !isStockPositionClosed(
                  (purchases ?? []).filter((p) => p.stockId === stock.id),
                  (stockSaleList ?? []).filter((s) => s.stockId === stock.id),
                ),
            );
            const closedStockList = stockList.filter((stock) =>
              isStockPositionClosed(
                (purchases ?? []).filter((p) => p.stockId === stock.id),
                (stockSaleList ?? []).filter((s) => s.stockId === stock.id),
              ),
            );

            const renderStockCard = (stock: Stock) => {
              const isEditingStock = editingStockId === stock.id;
              const stockPurchases = (purchases ?? []).filter((p) => p.stockId === stock.id);
              const stockSalesForThisStock = (stockSaleList ?? []).filter((s) => s.stockId === stock.id);
              const stockValuations = (valuations ?? []).filter((v) => v.stockId === stock.id);
              const stockDividendHistory = (stockDividendList ?? []).filter((d) => d.stockId === stock.id);
              const lastValuation = stockValuations[0] ?? null; // `valuations` ya viene ordenado por fecha descendente
              const newPurchaseForm = getNewPurchaseForm(stock.id);
              const newStockSaleForm = getNewStockSaleForm(stock.id);
              const newValuationForm = getNewValuationForm(stock.id);
              const newStockDividendForm = getNewStockDividendForm(stock.id);
              // spec 031 H3: "en cartera" (compras − ventas, FIFO), no el total histórico comprado —
              // sustituye a `totalShares(stockPurchases)`/`totalCost(stockPurchases)` en toda la tarjeta.
              const fifoState = fifoPositionState(stockPurchases, stockSalesForThisStock);
              const realizedGainLoss = totalRealizedGainLoss(fifoState);
              const gainLoss = lastValuation
                ? gainLossPercent(currentValue(lastValuation.pricePerShare, fifoState.heldShares), fifoState.heldCost)
                : null;
              // H1 (spec 030): mismo % que `gainLoss`, sumando los dividendos cobrados (netos/brutos)
              // al valor actual antes de comparar con el coste. `null` si `gainLoss` también lo es
              // (coste 0 o sin valoración) — `gainLossPercentWithDividends` hereda ese mismo criterio.
              const gainLossNet = lastValuation
                ? gainLossPercentWithDividends(
                    currentValue(lastValuation.pricePerShare, fifoState.heldShares),
                    fifoState.heldCost,
                    totalDividends(stockDividendHistory),
                  )
                : null;
              const gainLossGross = lastValuation
                ? gainLossPercentWithDividends(
                    currentValue(lastValuation.pricePerShare, fifoState.heldShares),
                    fifoState.heldCost,
                    totalGrossDividends(stockDividendHistory),
                  )
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
                      {stockDividendHistory.length > 0 && gainLossNet !== null && (
                        <span style={{ color: gainLossNet >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          · neto {gainLossNet >= 0 ? '+' : ''}
                          {gainLossNet.toFixed(2)}%
                        </span>
                      )}
                      {stockDividendHistory.length > 0 && gainLossGross !== null && (
                        <span style={{ color: gainLossGross >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          · bruto {gainLossGross >= 0 ? '+' : ''}
                          {gainLossGross.toFixed(2)}%
                        </span>
                      )}
                    </span>
                    <span className="card-amount">
                      {lastValuation ? formatCurrency(currentValue(lastValuation.pricePerShare, fifoState.heldShares)) : 'Sin valoración'}
                    </span>
                  </div>
                  <p className="card-meta">
                    {fifoState.heldShares} acciones en cartera · Coste total: {formatCurrency(fifoState.heldCost)}
                    {lastValuation && (
                      <>
                        {' '}
                        · Precio actual: {formatCurrency(lastValuation.pricePerShare)}/acción · Última fecha: {lastValuation.date}
                      </>
                    )}
                    {' · Dividendos cobrados: '}
                    {stockDividendHistory.length > 0 ? formatCurrency(totalDividends(stockDividendHistory)) : 'Sin dividendos'}
                    {' · Ganancia/pérdida realizada: '}
                    {stockSalesForThisStock.length > 0 ? formatCurrency(realizedGainLoss) : 'Sin ventas'}
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
                                    {formatCurrency(currentValue(editingValuationForm.pricePerShare ?? '', fifoState.heldShares) || '0.00')}
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
                        {formatCurrency(currentValue(newValuationForm.pricePerShare ?? '', fifoState.heldShares) || '0.00')}
                      </p>
                      {createValuationError && <p role="alert">{createValuationError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingValuationForStockId === stock.id}>
                        {creatingValuationForStockId === stock.id ? 'Añadiendo…' : 'Añadir valoración'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de dividendos ({stockDividendHistory.length})</summary>

                    {stockDividendHistory.length === 0 && <p>Todavía no hay ningún dividendo registrado en esta acción.</p>}

                    {stockDividendHistory.length > 0 && (
                      <ul aria-label={`Historial de dividendos de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockDividendHistory.map((dividend) => {
                          const isEditingDividend = editingStockDividendId === dividend.id;
                          const dividendLabel = `${dividend.date} · ${dividend.netAmount}€ netos`;

                          if (isEditingDividend) {
                            return (
                              <li key={dividend.id}>
                                <form
                                  onSubmit={handleEditStockDividend}
                                  aria-label={`Editar dividendo de ${stock.stock}: ${dividendLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`stock-dividend-${dividend.id}-netAmount`}>Importe neto</label>
                                    <input
                                      id={`stock-dividend-${dividend.id}-netAmount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingStockDividendForm.netAmount}
                                      onChange={(e) =>
                                        setEditingStockDividendForm({ ...editingStockDividendForm, netAmount: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`stock-dividend-${dividend.id}-retentionPercent`}>% Retención</label>
                                    <input
                                      id={`stock-dividend-${dividend.id}-retentionPercent`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingStockDividendForm.retentionPercent}
                                      onChange={(e) =>
                                        setEditingStockDividendForm({ ...editingStockDividendForm, retentionPercent: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`stock-dividend-${dividend.id}-date`}>Fecha</label>
                                    <input
                                      id={`stock-dividend-${dividend.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingStockDividendForm.date}
                                      onChange={(e) => setEditingStockDividendForm({ ...editingStockDividendForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Importe bruto:{' '}
                                    {formatCurrency(
                                      grossDividend(
                                        editingStockDividendForm.netAmount ?? '',
                                        editingStockDividendForm.retentionPercent ?? '',
                                      ) || '0.00',
                                    )}
                                  </p>
                                  {editStockDividendError && <p role="alert">{editStockDividendError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingStockDividend}>
                                    {isSavingStockDividend ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingStockDividend}
                                    onClick={() => setEditingStockDividendId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={dividend.id}>
                              <span>{dividend.date}</span>{' '}
                              <span>
                                Neto: {formatCurrency(dividend.netAmount)} · Bruto:{' '}
                                {formatCurrency(grossDividend(dividend.netAmount, dividend.retentionPercent))} ({dividend.retentionPercent}
                                % retención)
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar dividendo de ${stock.stock}: ${dividendLabel}`}
                                onClick={() => startEditStockDividend(dividend)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar dividendo de ${stock.stock}: ${dividendLabel}`}
                                disabled={pendingDeleteStockDividendId === dividend.id}
                                onClick={() => void handleDeleteStockDividend(dividend.id)}
                              >
                                {pendingDeleteStockDividendId === dividend.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateStockDividend(stock.id, e)}
                      aria-label={`Añadir dividendo: ${stock.stock}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-stock-dividend-${stock.id}-netAmount`}>Importe neto</label>
                        <input
                          id={`new-stock-dividend-${stock.id}-netAmount`}
                          className="input"
                          inputMode="decimal"
                          value={newStockDividendForm.netAmount}
                          onChange={(e) => setNewStockDividendForm(stock.id, { ...newStockDividendForm, netAmount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-stock-dividend-${stock.id}-retentionPercent`}>% Retención</label>
                        <input
                          id={`new-stock-dividend-${stock.id}-retentionPercent`}
                          className="input"
                          inputMode="decimal"
                          value={newStockDividendForm.retentionPercent}
                          onChange={(e) =>
                            setNewStockDividendForm(stock.id, { ...newStockDividendForm, retentionPercent: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-stock-dividend-${stock.id}-date`}>Fecha</label>
                        <input
                          id={`new-stock-dividend-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newStockDividendForm.date}
                          onChange={(e) => setNewStockDividendForm(stock.id, { ...newStockDividendForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Importe bruto:{' '}
                        {formatCurrency(
                          grossDividend(newStockDividendForm.netAmount ?? '', newStockDividendForm.retentionPercent ?? '') || '0.00',
                        )}
                      </p>
                      {createStockDividendError && <p role="alert">{createStockDividendError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingStockDividendForStockId === stock.id}>
                        {creatingStockDividendForStockId === stock.id ? 'Añadiendo…' : 'Añadir dividendo'}
                      </button>
                    </form>
                  </details>

                  <details>
                    <summary>Historial de ventas ({stockSalesForThisStock.length})</summary>

                    {stockSalesForThisStock.length === 0 && <p>Todavía no hay ninguna venta registrada en esta acción.</p>}

                    {stockSalesForThisStock.length > 0 && (
                      <ul aria-label={`Historial de ventas de ${stock.stock} · ${stock.custodyBank}`}>
                        {stockSalesForThisStock.map((sale) => {
                          const isEditingSale = editingStockSaleId === sale.id;
                          const saleLabel = `${sale.date} · ${sale.shareCount} acciones a ${sale.salePrice}€`;
                          const saleGainLoss = fifoState.realizedGainLossBySaleId[sale.id];

                          if (isEditingSale) {
                            return (
                              <li key={sale.id}>
                                <form onSubmit={handleEditStockSale} aria-label={`Editar venta de ${stock.stock}: ${saleLabel}`} noValidate>
                                  <div className="field">
                                    <label htmlFor={`stock-sale-${sale.id}-shareCount`}>Número acciones vendidas</label>
                                    <input
                                      id={`stock-sale-${sale.id}-shareCount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingStockSaleForm.shareCount}
                                      onChange={(e) => setEditingStockSaleForm({ ...editingStockSaleForm, shareCount: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`stock-sale-${sale.id}-salePrice`}>Precio de venta</label>
                                    <input
                                      id={`stock-sale-${sale.id}-salePrice`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingStockSaleForm.salePrice}
                                      onChange={(e) => setEditingStockSaleForm({ ...editingStockSaleForm, salePrice: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`stock-sale-${sale.id}-date`}>Fecha de venta</label>
                                    <input
                                      id={`stock-sale-${sale.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingStockSaleForm.date}
                                      onChange={(e) => setEditingStockSaleForm({ ...editingStockSaleForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  {editStockSaleError && <p role="alert">{editStockSaleError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingStockSale}>
                                    {isSavingStockSale ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingStockSale}
                                    onClick={() => setEditingStockSaleId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={sale.id}>
                              <span>{sale.date}</span>{' '}
                              <span>
                                {sale.shareCount} acciones @ {formatCurrency(sale.salePrice)} ={' '}
                                {formatCurrency(purchaseValue(sale.salePrice, sale.shareCount))}
                              </span>{' '}
                              <span style={{ color: parseFloat(saleGainLoss) >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                                {parseFloat(saleGainLoss) >= 0 ? '+' : ''}
                                {formatCurrency(saleGainLoss)}
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar venta de ${stock.stock}: ${saleLabel}`}
                                onClick={() => startEditStockSale(sale)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar venta de ${stock.stock}: ${saleLabel}`}
                                disabled={pendingDeleteStockSaleId === sale.id}
                                onClick={() => void handleDeleteStockSale(sale.id)}
                              >
                                {pendingDeleteStockSaleId === sale.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form onSubmit={(e) => void handleCreateStockSale(stock.id, e)} aria-label={`Añadir venta: ${stock.stock}`} noValidate>
                      <div className="field">
                        <label htmlFor={`new-stock-sale-${stock.id}-shareCount`}>Número acciones vendidas</label>
                        <input
                          id={`new-stock-sale-${stock.id}-shareCount`}
                          className="input"
                          inputMode="decimal"
                          value={newStockSaleForm.shareCount}
                          onChange={(e) => setNewStockSaleForm(stock.id, { ...newStockSaleForm, shareCount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-stock-sale-${stock.id}-salePrice`}>Precio de venta</label>
                        <input
                          id={`new-stock-sale-${stock.id}-salePrice`}
                          className="input"
                          inputMode="decimal"
                          value={newStockSaleForm.salePrice}
                          onChange={(e) => setNewStockSaleForm(stock.id, { ...newStockSaleForm, salePrice: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-stock-sale-${stock.id}-date`}>Fecha de venta</label>
                        <input
                          id={`new-stock-sale-${stock.id}-date`}
                          type="date"
                          className="input"
                          value={newStockSaleForm.date}
                          onChange={(e) => setNewStockSaleForm(stock.id, { ...newStockSaleForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Valor de venta:{' '}
                        {formatCurrency(purchaseValue(newStockSaleForm.salePrice ?? '', newStockSaleForm.shareCount ?? '') || '0.00')}
                      </p>
                      {createStockSaleError && <p role="alert">{createStockSaleError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingStockSaleForStockId === stock.id}>
                        {creatingStockSaleForStockId === stock.id ? 'Añadiendo…' : 'Añadir venta'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            };

            return (
              <>
                {openStockList.length === 0 && <p>No tienes ninguna posición abierta.</p>}

                {openStockList.length > 0 && (
                  <ul id="wealth-stock-list" aria-label="Tus acciones abiertas">
                    {openStockList.map(renderStockCard)}
                  </ul>
                )}

                {closedStockList.length > 0 && (
                  <details>
                    <summary>Posiciones cerradas ({closedStockList.length})</summary>
                    <ul aria-label="Tus acciones cerradas">{closedStockList.map(renderStockCard)}</ul>
                  </details>
                )}
              </>
            );
          })()}

        <details className="dashboard-section">
          <summary>
            <h3>Añadir acción</h3>
          </summary>
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

        <details className="dashboard-section" id="wealth-acciones-impuestos">
          <summary>
            <h3>🧮 Cálculo de impuestos</h3>
          </summary>
          {(() => {
            const years = stockSaleYears(stockSaleList ?? []);
            const selectedYear = years.includes(taxYear) ? taxYear : (years[0] ?? taxYear);
            const yearlyGainLoss = years.map((year) => ({
              year,
              amount: parseFloat(realizedGainLossForYear(stockList ?? [], purchases ?? [], stockSaleList ?? [], year)),
            }));
            const compensation = simulateLossCompensationForYear(yearlyGainLoss, selectedYear);
            const { breakdown, totalTax } = calculateStockCapitalGainsTax(compensation.netTaxableAmount);

            return (
              <>
                <p className="card-meta">
                  Impuesto estimado en la declaración de la renta sobre la ganancia patrimonial realizada por venta de
                  acciones (FIFO), según los tramos vigentes en la normativa del ejercicio 2026. Las pérdidas se
                  compensan con ganancias de los 4 ejercicios siguientes (art. 49 LIRPF); pasado ese plazo, la parte
                  no usada caduca.
                </p>

                <div className="field">
                  <label htmlFor="tax-calc-year">Año</label>
                  <select id="tax-calc-year" className="input" value={selectedYear} onChange={(e) => setTaxYear(e.target.value)}>
                    {(years.length > 0 ? years : [selectedYear]).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="card-meta">
                  Ganancia/pérdida patrimonial bruta realizada en {selectedYear}:{' '}
                  {formatCurrency(compensation.grossAmount.toFixed(2))}
                </p>

                {compensation.compensatedLosses.length > 0 && (
                  <>
                    <p className="card-meta">Compensada con pérdidas de ejercicios anteriores:</p>
                    <ul>
                      {compensation.compensatedLosses.map((loss) => (
                        <li key={loss.year}>
                          {loss.year}: {formatCurrency(loss.amount.toFixed(2))}
                        </li>
                      ))}
                    </ul>
                    <p className="card-meta">
                      Base imponible tras compensar: {formatCurrency(compensation.netTaxableAmount.toFixed(2))}
                    </p>
                  </>
                )}

                {compensation.expiredLosses.length > 0 && (
                  <p role="alert">
                    Han caducado sin compensar (más de 4 ejercicios sin ganancias suficientes):{' '}
                    {`${compensation.expiredLosses
                      .map((loss) => `${loss.year}: ${formatCurrency(loss.amount.toFixed(2))}`)
                      .join(', ')}.`}
                  </p>
                )}

                {compensation.netTaxableAmount > 0 ? (
                  <>
                    <table className="table">
                      <caption>Desglose por tramos</caption>
                      <thead>
                        <tr>
                          <th scope="col">Tramo</th>
                          <th scope="col">Tipo</th>
                          <th scope="col">Base</th>
                          <th scope="col">Cuota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((tramo) => (
                          <tr key={tramo.from}>
                            <td data-label="Tramo">
                              {formatCurrency(tramo.from.toFixed(2))} –{' '}
                              {tramo.to === Infinity ? 'en adelante' : formatCurrency(tramo.to.toFixed(2))}
                            </td>
                            <td data-label="Tipo">{(tramo.rate * 100).toFixed(0)} %</td>
                            <td data-label="Base">{formatCurrency(tramo.taxableAmount.toFixed(2))}</td>
                            <td data-label="Cuota">{formatCurrency(tramo.tax.toFixed(2))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="card-title">Total a pagar: {formatCurrency(totalTax.toFixed(2))}</p>
                  </>
                ) : compensation.grossAmount < 0 ? (
                  <p>
                    No hay impuesto a pagar. Esta pérdida se podrá compensar con ganancias de los próximos 4
                    ejercicios (hasta {String(parseInt(selectedYear, 10) + 4)}).
                  </p>
                ) : compensation.compensatedLosses.length > 0 ? (
                  <p>
                    La ganancia se ha compensado en su totalidad con pérdidas de ejercicios anteriores; no hay
                    impuesto a pagar.
                  </p>
                ) : (
                  <p>No hay ganancia patrimonial sujeta a impuesto en este ejercicio.</p>
                )}

                {compensation.pendingLossCarryforward.length > 0 && (
                  <>
                    <p className="card-meta">Pérdidas pendientes de compensar en ejercicios futuros:</p>
                    <ul>
                      {compensation.pendingLossCarryforward.map((loss) => (
                        <li key={loss.year}>
                          {loss.year}: {formatCurrency(loss.amount.toFixed(2))} (caduca tras {loss.expiresAfterYear})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            );
          })()}
        </details>
      </details>

      <details className="dashboard-section" id="wealth-fondos-inversion">
        <summary>
          <h2>💹 Fondos Inversión</h2>
        </summary>

        {fundsLoadError && <p role="alert">{fundsLoadError}</p>}
        {fundPurchasesLoadError && <p role="alert">{fundPurchasesLoadError}</p>}
        {fundValuationsLoadError && <p role="alert">{fundValuationsLoadError}</p>}
        {fundDividendsLoadError && <p role="alert">{fundDividendsLoadError}</p>}
        {fundActionError && <p role="alert">{fundActionError}</p>}
        {fundPurchaseActionError && <p role="alert">{fundPurchaseActionError}</p>}
        {fundValuationActionError && <p role="alert">{fundValuationActionError}</p>}
        {fundDividendActionError && <p role="alert">{fundDividendActionError}</p>}

        {fundList && fundList.length === 0 && <p>Todavía no tienes ningún fondo de inversión.</p>}

        {fundList && fundList.length > 0 && (
          <ul id="wealth-fund-list" aria-label="Tus fondos de inversión">
            {fundList.map((fund) => {
              const isEditingFund = editingFundId === fund.id;
              const fundPurchaseHistory = (fundPurchases ?? []).filter((p) => p.fundId === fund.id);
              const fundValuationHistory = (fundValuations ?? []).filter((v) => v.fundId === fund.id);
              const fundDividendHistory = (fundDividendList ?? []).filter((d) => d.fundId === fund.id);
              const lastValuation = fundValuationHistory[0] ?? null; // `fundValuations` ya viene ordenado por fecha descendente
              const newFundPurchaseForm = getNewFundPurchaseForm(fund.id);
              const newFundValuationForm = getNewFundValuationForm(fund.id);
              const newFundDividendForm = getNewFundDividendForm(fund.id);
              const gainLoss = lastValuation
                ? gainLossPercent(
                    currentValue(lastValuation.pricePerShare, totalShares(fundPurchaseHistory)),
                    totalCost(fundPurchaseHistory),
                  )
                : null;
              // H1 (spec 030): mismo criterio que en Acciones — ver comentario junto a `gainLossNet` allí.
              const gainLossNet = lastValuation
                ? gainLossPercentWithDividends(
                    currentValue(lastValuation.pricePerShare, totalShares(fundPurchaseHistory)),
                    totalCost(fundPurchaseHistory),
                    totalDividends(fundDividendHistory),
                  )
                : null;
              const gainLossGross = lastValuation
                ? gainLossPercentWithDividends(
                    currentValue(lastValuation.pricePerShare, totalShares(fundPurchaseHistory)),
                    totalCost(fundPurchaseHistory),
                    totalGrossDividends(fundDividendHistory),
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
                      {fundDividendHistory.length > 0 && gainLossNet !== null && (
                        <span style={{ color: gainLossNet >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          · neto {gainLossNet >= 0 ? '+' : ''}
                          {gainLossNet.toFixed(2)}%
                        </span>
                      )}
                      {fundDividendHistory.length > 0 && gainLossGross !== null && (
                        <span style={{ color: gainLossGross >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
                          {' '}
                          · bruto {gainLossGross >= 0 ? '+' : ''}
                          {gainLossGross.toFixed(2)}%
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
                    {' · Dividendos cobrados: '}
                    {fundDividendHistory.length > 0 ? formatCurrency(totalDividends(fundDividendHistory)) : 'Sin dividendos'}
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

                  <details>
                    <summary>Historial de dividendos ({fundDividendHistory.length})</summary>

                    {fundDividendHistory.length === 0 && <p>Todavía no hay ningún dividendo registrado en este fondo.</p>}

                    {fundDividendHistory.length > 0 && (
                      <ul aria-label={`Historial de dividendos de ${fund.fund} · ${fund.custodyBank}`}>
                        {fundDividendHistory.map((dividend) => {
                          const isEditingDividend = editingFundDividendId === dividend.id;
                          const dividendLabel = `${dividend.date} · ${dividend.netAmount}€ netos`;

                          if (isEditingDividend) {
                            return (
                              <li key={dividend.id}>
                                <form
                                  onSubmit={handleEditFundDividend}
                                  aria-label={`Editar dividendo de ${fund.fund}: ${dividendLabel}`}
                                  noValidate
                                >
                                  <div className="field">
                                    <label htmlFor={`fund-dividend-${dividend.id}-netAmount`}>Importe neto</label>
                                    <input
                                      id={`fund-dividend-${dividend.id}-netAmount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingFundDividendForm.netAmount}
                                      onChange={(e) =>
                                        setEditingFundDividendForm({ ...editingFundDividendForm, netAmount: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`fund-dividend-${dividend.id}-retentionPercent`}>% Retención</label>
                                    <input
                                      id={`fund-dividend-${dividend.id}-retentionPercent`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingFundDividendForm.retentionPercent}
                                      onChange={(e) =>
                                        setEditingFundDividendForm({ ...editingFundDividendForm, retentionPercent: e.target.value })
                                      }
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`fund-dividend-${dividend.id}-date`}>Fecha</label>
                                    <input
                                      id={`fund-dividend-${dividend.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingFundDividendForm.date}
                                      onChange={(e) => setEditingFundDividendForm({ ...editingFundDividendForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <p className="card-meta">
                                    Importe bruto:{' '}
                                    {formatCurrency(
                                      grossDividend(
                                        editingFundDividendForm.netAmount ?? '',
                                        editingFundDividendForm.retentionPercent ?? '',
                                      ) || '0.00',
                                    )}
                                  </p>
                                  {editFundDividendError && <p role="alert">{editFundDividendError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingFundDividend}>
                                    {isSavingFundDividend ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingFundDividend}
                                    onClick={() => setEditingFundDividendId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={dividend.id}>
                              <span>{dividend.date}</span>{' '}
                              <span>
                                Neto: {formatCurrency(dividend.netAmount)} · Bruto:{' '}
                                {formatCurrency(grossDividend(dividend.netAmount, dividend.retentionPercent))} ({dividend.retentionPercent}
                                % retención)
                              </span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar dividendo de ${fund.fund}: ${dividendLabel}`}
                                onClick={() => startEditFundDividend(dividend)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar dividendo de ${fund.fund}: ${dividendLabel}`}
                                disabled={pendingDeleteFundDividendId === dividend.id}
                                onClick={() => void handleDeleteFundDividend(dividend.id)}
                              >
                                {pendingDeleteFundDividendId === dividend.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateFundDividend(fund.id, e)}
                      aria-label={`Añadir dividendo: ${fund.fund}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-fund-dividend-${fund.id}-netAmount`}>Importe neto</label>
                        <input
                          id={`new-fund-dividend-${fund.id}-netAmount`}
                          className="input"
                          inputMode="decimal"
                          value={newFundDividendForm.netAmount}
                          onChange={(e) => setNewFundDividendForm(fund.id, { ...newFundDividendForm, netAmount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-fund-dividend-${fund.id}-retentionPercent`}>% Retención</label>
                        <input
                          id={`new-fund-dividend-${fund.id}-retentionPercent`}
                          className="input"
                          inputMode="decimal"
                          value={newFundDividendForm.retentionPercent}
                          onChange={(e) =>
                            setNewFundDividendForm(fund.id, { ...newFundDividendForm, retentionPercent: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-fund-dividend-${fund.id}-date`}>Fecha</label>
                        <input
                          id={`new-fund-dividend-${fund.id}-date`}
                          type="date"
                          className="input"
                          value={newFundDividendForm.date}
                          onChange={(e) => setNewFundDividendForm(fund.id, { ...newFundDividendForm, date: e.target.value })}
                          required
                        />
                      </div>
                      <p className="card-meta">
                        Importe bruto:{' '}
                        {formatCurrency(
                          grossDividend(newFundDividendForm.netAmount ?? '', newFundDividendForm.retentionPercent ?? '') || '0.00',
                        )}
                      </p>
                      {createFundDividendError && <p role="alert">{createFundDividendError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingFundDividendForFundId === fund.id}>
                        {creatingFundDividendForFundId === fund.id ? 'Añadiendo…' : 'Añadir dividendo'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <details className="dashboard-section">
          <summary>
            <h3>Añadir fondo</h3>
          </summary>
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
      </details>

      <details className="dashboard-section" id="wealth-cripto">
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

        <details className="dashboard-section">
          <summary>
            <h3>Añadir posición</h3>
          </summary>
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
      </details>

      <details className="dashboard-section" id="wealth-vehiculos">
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

        <details className="dashboard-section">
          <summary>
            <h3>Añadir vehículo</h3>
          </summary>
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
      </details>

      <details className="dashboard-section" id="wealth-fondo-pensiones">
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

        <details className="dashboard-section">
          <summary>
            <h3>Añadir plan</h3>
          </summary>
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
      </details>

      <details className="dashboard-section" id="wealth-efectivo">
        <summary>
          <h2>💵 Efectivo</h2>
        </summary>

        {cashHoldingsLoadError && <p role="alert">{cashHoldingsLoadError}</p>}
        {cashBalancesLoadError && <p role="alert">{cashBalancesLoadError}</p>}
        {cashHoldingActionError && <p role="alert">{cashHoldingActionError}</p>}
        {cashBalanceActionError && <p role="alert">{cashBalanceActionError}</p>}

        {cashHoldingList && cashHoldingList.length === 0 && <p>Todavía no tienes ninguna ubicación de efectivo.</p>}

        {cashHoldingList && cashHoldingList.length > 0 && (
          <ul id="wealth-cash-holding-list" aria-label="Tus ubicaciones de efectivo">
            {cashHoldingList.map((holding) => {
              const isEditingHolding = editingCashHoldingId === holding.id;
              const holdingBalances = (cashBalanceList ?? []).filter((b) => b.cashHoldingId === holding.id);
              const lastBalance = holdingBalances[0] ?? null; // ya viene ordenado por fecha descendente
              const newBalanceForm = getNewCashBalanceForm(holding.id);

              if (isEditingHolding) {
                return (
                  <li className="card elev-sm" key={holding.id}>
                    <form onSubmit={handleEditCashHolding} aria-label={`Editar ubicación: ${holding.location}`} noValidate>
                      <div className="field">
                        <label htmlFor={`cash-holding-${holding.id}-location`}>Ubicación</label>
                        <input
                          id={`cash-holding-${holding.id}-location`}
                          className="input"
                          value={editingCashHoldingForm.location}
                          onChange={(e) => setEditingCashHoldingForm({ ...editingCashHoldingForm, location: e.target.value })}
                          required
                        />
                      </div>
                      {editCashHoldingError && <p role="alert">{editCashHoldingError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={isSavingCashHolding}>
                        {isSavingCashHolding ? 'Guardando…' : 'Guardar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isSavingCashHolding}
                        onClick={() => setEditingCashHoldingId(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li className="card elev-sm" key={holding.id}>
                  <div className="wealth-item-header">
                    <span className="card-title">{holding.location}</span>
                    <span className="card-amount">{lastBalance ? formatCurrency(lastBalance.amount) : 'Sin importe'}</span>
                  </div>
                  {lastBalance && <p className="card-meta">Última fecha: {lastBalance.date}</p>}
                  <div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      aria-label={`Editar ubicación: ${holding.location}`}
                      onClick={() => startEditCashHolding(holding)}
                    >
                      Editar
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Eliminar ubicación: ${holding.location}`}
                      disabled={pendingDeleteCashHoldingId === holding.id}
                      onClick={() => void handleDeleteCashHolding(holding.id)}
                    >
                      {pendingDeleteCashHoldingId === holding.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  <details>
                    <summary>Historial ({holdingBalances.length})</summary>

                    {holdingBalances.length === 0 && <p>Todavía no hay ningún importe registrado en esta ubicación.</p>}

                    {holdingBalances.length > 0 && (
                      <ul aria-label={`Historial de ${holding.location}`}>
                        {holdingBalances.map((balance) => {
                          const isEditingBalance = editingCashBalanceId === balance.id;

                          if (isEditingBalance) {
                            return (
                              <li key={balance.id}>
                                <form onSubmit={handleEditCashBalance} aria-label={`Editar importe del ${balance.date}`} noValidate>
                                  <div className="field">
                                    <label htmlFor={`cash-balance-${balance.id}-amount`}>Importe</label>
                                    <input
                                      id={`cash-balance-${balance.id}-amount`}
                                      className="input"
                                      inputMode="decimal"
                                      value={editingCashBalanceForm.amount}
                                      onChange={(e) => setEditingCashBalanceForm({ ...editingCashBalanceForm, amount: e.target.value })}
                                      required
                                    />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`cash-balance-${balance.id}-date`}>Fecha</label>
                                    <input
                                      id={`cash-balance-${balance.id}-date`}
                                      type="date"
                                      className="input"
                                      value={editingCashBalanceForm.date}
                                      onChange={(e) => setEditingCashBalanceForm({ ...editingCashBalanceForm, date: e.target.value })}
                                      required
                                    />
                                  </div>
                                  {editCashBalanceError && <p role="alert">{editCashBalanceError}</p>}
                                  <button type="submit" className="btn btn-primary" disabled={isSavingCashBalance}>
                                    {isSavingCashBalance ? 'Guardando…' : 'Guardar'}
                                  </button>{' '}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={isSavingCashBalance}
                                    onClick={() => setEditingCashBalanceId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </li>
                            );
                          }

                          return (
                            <li key={balance.id}>
                              <span>{balance.date}</span> <span>{formatCurrency(balance.amount)}</span>{' '}
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Editar importe del ${balance.date}`}
                                onClick={() => startEditCashBalance(balance)}
                              >
                                Editar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn btn-ghost"
                                aria-label={`Eliminar importe del ${balance.date}`}
                                disabled={pendingDeleteCashBalanceId === balance.id}
                                onClick={() => void handleDeleteCashBalance(balance.id)}
                              >
                                {pendingDeleteCashBalanceId === balance.id ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(e) => void handleCreateCashBalance(holding.id, e)}
                      aria-label={`Añadir importe: ${holding.location}`}
                      noValidate
                    >
                      <div className="field">
                        <label htmlFor={`new-cash-balance-${holding.id}-amount`}>Importe</label>
                        <input
                          id={`new-cash-balance-${holding.id}-amount`}
                          className="input"
                          inputMode="decimal"
                          placeholder="p. ej. 200.00"
                          value={newBalanceForm.amount}
                          onChange={(e) => setNewCashBalanceForm(holding.id, { ...newBalanceForm, amount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`new-cash-balance-${holding.id}-date`}>Fecha</label>
                        <input
                          id={`new-cash-balance-${holding.id}-date`}
                          type="date"
                          className="input"
                          value={newBalanceForm.date}
                          onChange={(e) => setNewCashBalanceForm(holding.id, { ...newBalanceForm, date: e.target.value })}
                          required
                        />
                      </div>
                      {createCashBalanceError && <p role="alert">{createCashBalanceError}</p>}
                      <button type="submit" className="btn btn-primary" disabled={creatingCashBalanceForHoldingId === holding.id}>
                        {creatingCashBalanceForHoldingId === holding.id ? 'Añadiendo…' : 'Añadir importe'}
                      </button>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <details className="dashboard-section">
          <summary>
            <h3>Añadir ubicación</h3>
          </summary>
          <form onSubmit={handleCreateCashHolding} aria-label="Añadir ubicación de efectivo" noValidate>
            <div className="field">
              <label htmlFor="new-cash-holding-location">Ubicación</label>
              <input
                id="new-cash-holding-location"
                className="input"
                placeholder="p. ej. Cartera"
                value={newCashHoldingForm.location}
                onChange={(e) => setNewCashHoldingForm({ ...newCashHoldingForm, location: e.target.value })}
                required
              />
            </div>
            {createCashHoldingError && <p role="alert">{createCashHoldingError}</p>}
            <button type="submit" className="btn btn-primary" disabled={isCreatingCashHolding}>
              {isCreatingCashHolding ? 'Creando…' : 'Añadir ubicación'}
            </button>
          </form>
        </details>
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
