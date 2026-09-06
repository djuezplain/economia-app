import type { BankAccount } from '../api/bank-accounts';
import type { BankAccountBalance } from '../api/bank-account-balances';
import type { Stock } from '../api/stocks';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockValuation } from '../api/stock-valuations';
import type { Fund } from '../api/funds';
import type { FundPurchase } from '../api/fund-purchases';
import type { FundValuation } from '../api/fund-valuations';
import type { Crypto } from '../api/cryptos';
import type { CryptoPurchase } from '../api/crypto-purchases';
import type { CryptoValuation } from '../api/crypto-valuations';
import type { Vehicle } from '../api/vehicles';
import type { VehicleValuation } from '../api/vehicle-valuations';
import type { PensionPlan } from '../api/pension-plans';
import type { PensionPlanValuation } from '../api/pension-plan-valuations';
import type { CashHolding } from '../api/cash-holdings';
import type { CashBalance } from '../api/cash-balances';

/** spec 027, plan.md §1: todo el histórico de las 7 categorías, tal cual lo carga `WealthPage.tsx`
 *  (cada lista de historial ya viene ordenada por fecha descendente). */
export interface AllWealthData {
  bankAccounts: BankAccount[];
  bankAccountBalances: BankAccountBalance[];
  stocks: Stock[];
  stockPurchases: StockPurchase[];
  stockValuations: StockValuation[];
  funds: Fund[];
  fundPurchases: FundPurchase[];
  fundValuations: FundValuation[];
  cryptos: Crypto[];
  cryptoPurchases: CryptoPurchase[];
  cryptoValuations: CryptoValuation[];
  vehicles: Vehicle[];
  vehicleValuations: VehicleValuation[];
  pensionPlans: PensionPlan[];
  pensionPlanValuations: PensionPlanValuation[];
  cashHoldings: CashHolding[];
  cashBalances: CashBalance[];
}

export interface WealthEvolutionPoint {
  weekEnding: string;
  total: number;
}

/** Primera entrada de `items` (ya ordenados por fecha descendente) con `date <= asOf` —
 *  "último valor conocido a fecha `asOf`" (plan.md §1). */
function lastAsOf<T extends { date: string }>(items: T[], asOf: string): T | undefined {
  return items.find((item) => item.date <= asOf);
}

/** H1 criterio 1/2 (spec.md): sumatorio del último saldo conocido de cada cuenta a fecha `asOf`.
 *  Una cuenta sin ningún saldo con `date <= asOf` todavía no contribuye (H1 criterio 3). */
export function bankAccountsValueAsOf(accounts: BankAccount[], balances: BankAccountBalance[], asOf: string): number {
  return accounts.reduce((sum, account) => {
    const last = lastAsOf(
      balances.filter((b) => b.bankAccountId === account.id),
      asOf,
    );
    return sum + (last ? parseFloat(last.euros) : 0);
  }, 0);
}

/** H1 criterio 1/2 (spec.md): a diferencia de la tarjeta "Total" (siempre "hoy"), aquí solo
 *  cuentan las compras con `date <= asOf` — una compra posterior a esa fecha no puede formar
 *  parte todavía del nº de acciones de esa semana (plan.md §1). */
export function stocksValueAsOf(stocks: Stock[], purchases: StockPurchase[], valuations: StockValuation[], asOf: string): number {
  return stocks.reduce((sum, stock) => {
    const shares = purchases
      .filter((p) => p.stockId === stock.id && p.date <= asOf)
      .reduce((s, p) => s + parseFloat(p.shareCount), 0);
    if (shares === 0) return sum;
    const lastValuation = lastAsOf(
      valuations.filter((v) => v.stockId === stock.id),
      asOf,
    );
    if (!lastValuation) return sum;
    return sum + parseFloat(lastValuation.pricePerShare) * shares;
  }, 0);
}

/** Mismo cálculo que `stocksValueAsOf` (spec 021, mismo modelo que spec 020). */
export function fundsValueAsOf(funds: Fund[], purchases: FundPurchase[], valuations: FundValuation[], asOf: string): number {
  return funds.reduce((sum, fund) => {
    const shares = purchases
      .filter((p) => p.fundId === fund.id && p.date <= asOf)
      .reduce((s, p) => s + parseFloat(p.shareCount), 0);
    if (shares === 0) return sum;
    const lastValuation = lastAsOf(
      valuations.filter((v) => v.fundId === fund.id),
      asOf,
    );
    if (!lastValuation) return sum;
    return sum + parseFloat(lastValuation.pricePerShare) * shares;
  }, 0);
}

/** Mismo cálculo que `stocksValueAsOf`, sobre `quantity`/`pricePerUnit` (spec 022). */
export function cryptosValueAsOf(cryptos: Crypto[], purchases: CryptoPurchase[], valuations: CryptoValuation[], asOf: string): number {
  return cryptos.reduce((sum, crypto) => {
    const quantity = purchases
      .filter((p) => p.cryptoId === crypto.id && p.date <= asOf)
      .reduce((s, p) => s + parseFloat(p.quantity), 0);
    if (quantity === 0) return sum;
    const lastValuation = lastAsOf(
      valuations.filter((v) => v.cryptoId === crypto.id),
      asOf,
    );
    if (!lastValuation) return sum;
    return sum + parseFloat(lastValuation.pricePerUnit) * quantity;
  }, 0);
}

/** H1 criterio 1/2 (spec.md): último valor conocido de cada vehículo a fecha `asOf` — sin
 *  cantidad que multiplicar (mismo criterio que `vehiclesTotal` en `WealthPage.tsx`). */
export function vehiclesValueAsOf(vehicles: Vehicle[], valuations: VehicleValuation[], asOf: string): number {
  return vehicles.reduce((sum, vehicle) => {
    const last = lastAsOf(
      valuations.filter((v) => v.vehicleId === vehicle.id),
      asOf,
    );
    return sum + (last ? parseFloat(last.value) : 0);
  }, 0);
}

/** Mismo cálculo que `vehiclesValueAsOf` (spec 024). */
export function pensionPlansValueAsOf(plans: PensionPlan[], valuations: PensionPlanValuation[], asOf: string): number {
  return plans.reduce((sum, plan) => {
    const last = lastAsOf(
      valuations.filter((v) => v.pensionPlanId === plan.id),
      asOf,
    );
    return sum + (last ? parseFloat(last.value) : 0);
  }, 0);
}

/** Mismo cálculo que `vehiclesValueAsOf` (spec 025). */
export function cashValueAsOf(holdings: CashHolding[], balances: CashBalance[], asOf: string): number {
  return holdings.reduce((sum, holding) => {
    const last = lastAsOf(
      balances.filter((b) => b.cashHoldingId === holding.id),
      asOf,
    );
    return sum + (last ? parseFloat(last.amount) : 0);
  }, 0);
}

/** H1 (spec.md): suma de las 7 categorías a fecha `asOf`. */
export function totalWealthAsOf(data: AllWealthData, asOf: string): number {
  return (
    bankAccountsValueAsOf(data.bankAccounts, data.bankAccountBalances, asOf) +
    stocksValueAsOf(data.stocks, data.stockPurchases, data.stockValuations, asOf) +
    fundsValueAsOf(data.funds, data.fundPurchases, data.fundValuations, asOf) +
    cryptosValueAsOf(data.cryptos, data.cryptoPurchases, data.cryptoValuations, asOf) +
    vehiclesValueAsOf(data.vehicles, data.vehicleValuations, asOf) +
    pensionPlansValueAsOf(data.pensionPlans, data.pensionPlanValuations, asOf) +
    cashValueAsOf(data.cashHoldings, data.cashBalances, asOf)
  );
}

/** Fecha (YYYY-MM-DD) del dato más antiguo de cualquier categoría, o `null` si el usuario no
 *  tiene ninguna entrada en ninguna categoría todavía — usado por el modo "Todo el histórico"
 *  (plan.md §2) y para no generar puntos anteriores al primer dato real (plan.md §1). Solo mira
 *  los históricos que participan en `totalWealthAsOf` (saldos/valoraciones) — las compras por sí
 *  solas no hacen que una posición contribuya nada mientras no tenga ninguna valoración. */
export function earliestDataDate(data: AllWealthData): string | null {
  const dates = [
    ...data.bankAccountBalances.map((b) => b.date),
    ...data.stockValuations.map((v) => v.date),
    ...data.fundValuations.map((v) => v.date),
    ...data.cryptoValuations.map((v) => v.date),
    ...data.vehicleValuations.map((v) => v.date),
    ...data.pensionPlanValuations.map((v) => v.date),
    ...data.cashBalances.map((b) => b.date),
  ];
  return dates.reduce<string | null>((min, date) => (min === null || date < min ? date : min), null);
}

function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** H1 criterio 1 (spec.md): un punto por semana ISO (domingo). Siempre incluye `end` como último
 *  punto aunque no sea domingo (plan.md), para que el gráfico nunca se quede varios días por
 *  detrás de la fecha elegida como fin de rango (p. ej. "hoy" entre semana). */
export function weekEndingDates(start: string, end: string): string[] {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (startDate > endDate) return [];

  const firstSunday = new Date(startDate);
  const daysUntilSunday = (7 - firstSunday.getUTCDay()) % 7;
  firstSunday.setUTCDate(firstSunday.getUTCDate() + daysUntilSunday);

  const dates: string[] = [];
  let cursor = firstSunday;
  while (cursor <= endDate) {
    dates.push(toIsoDate(cursor));
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 7);
    cursor = next;
  }

  const endIso = toIsoDate(endDate);
  if (dates.length === 0 || dates[dates.length - 1] !== endIso) {
    dates.push(endIso);
  }
  return dates;
}

/** H1 (spec.md): la serie completa a pintar en el gráfico. No genera puntos anteriores al primer
 *  dato real del usuario (`earliestDataDate`), aunque `start` sea anterior — evita una fila inicial
 *  de "0" sin sentido en el modo "Todo el histórico". Vacía si el usuario no tiene ningún dato. */
export function wealthEvolutionSeries(data: AllWealthData, start: string, end: string): WealthEvolutionPoint[] {
  const earliest = earliestDataDate(data);
  if (earliest === null) return [];
  const effectiveStart = earliest > start ? earliest : start;
  return weekEndingDates(effectiveStart, end).map((weekEnding) => ({
    weekEnding,
    total: totalWealthAsOf(data, weekEnding),
  }));
}

export type WealthEvolutionRangeMode = 'last12Months' | 'currentYear' | 'allTime' | 'custom';

export interface CustomRange {
  start: string;
  end: string;
}

/** H2 criterio 3 (spec.md): fin no anterior a inicio, fin no posterior a hoy. */
export function isValidCustomRange(start: string, end: string, now: Date): boolean {
  return end >= start && end <= toIsoDate(now);
}

/** H2 (spec.md): resuelve el rango de fechas a mostrar según el modo elegido. `null` cuando no hay
 *  nada que mostrar: "Todo el histórico" sin ningún dato, o un rango personalizado inválido/incompleto —
 *  el componente muestra entonces el estado vacío de H2 criterio 4 sin llegar a pintar el gráfico. */
export function resolveRange(
  mode: WealthEvolutionRangeMode,
  custom: CustomRange | null,
  data: AllWealthData,
  now: Date,
): { start: string; end: string } | null {
  const end = toIsoDate(now);

  if (mode === 'last12Months') {
    const start = toIsoDate(new Date(now.getTime() - 52 * 7 * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  if (mode === 'currentYear') {
    return { start: `${end.slice(0, 4)}-01-01`, end };
  }

  if (mode === 'allTime') {
    const earliest = earliestDataDate(data);
    return earliest === null ? null : { start: earliest, end };
  }

  // custom
  if (!custom || !isValidCustomRange(custom.start, custom.end, now)) return null;
  return { start: custom.start, end: custom.end };
}
