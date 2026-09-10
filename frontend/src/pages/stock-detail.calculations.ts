// Spec 031 (venta de acciones), página de detalle de una acción: cálculos propios de
// `StockDetailPage.tsx` — combinar el historial en una única línea de tiempo y derivar
// las estadísticas del resumen. Los cálculos de posición en sí (FIFO, ganancia/pérdida,
// dividendos) viven en `stock-shared.ts`, compartidos con `WealthPage.tsx`; este fichero
// solo los combina para la vista de detalle, siguiendo el mismo patrón que
// `wealth-evolution.calculations.ts` junto a `WealthPage.tsx`.
import type { StockPurchase } from '../api/stock-purchases';
import type { StockSale } from '../api/stock-sales';
import type { StockValuation } from '../api/stock-valuations';
import type { StockDividend } from '../api/stock-dividends';
import { currentValue, fifoPositionState, gainLossPercent, grossDividend, totalDividends, totalGrossDividends, totalRealizedGainLoss } from './stock-shared';

export type StockOperation =
  | { kind: 'purchase'; id: string; date: string; createdAt: string; shareCount: string; price: string; amount: string }
  | { kind: 'sale'; id: string; date: string; createdAt: string; shareCount: string; price: string; amount: string; realizedGainLoss: string }
  | { kind: 'dividend'; id: string; date: string; createdAt: string; netAmount: string; grossAmount: string }
  | { kind: 'valuation'; id: string; date: string; createdAt: string; pricePerShare: string };

/** Historial unificado de todas las operaciones de una posición (compras, ventas,
 *  dividendos y valoraciones) para la tabla de "Operaciones" de la página de detalle —
 *  más reciente primero (fecha; en caso de empate, `createdAt` descendente), igual que
 *  el resto de historiales de esta app. La ganancia/pérdida de cada venta viene del mismo
 *  `fifoPositionState` que ya usa `WealthPage.tsx`, no se recalcula con otro criterio. */
export function stockOperationsTimeline(
  purchases: StockPurchase[],
  sales: StockSale[],
  dividends: StockDividend[],
  valuations: StockValuation[],
): StockOperation[] {
  const { realizedGainLossBySaleId } = fifoPositionState(purchases, sales);

  const rows: StockOperation[] = [
    ...purchases.map((p) => ({
      kind: 'purchase' as const,
      id: p.id,
      date: p.date,
      createdAt: p.createdAt,
      shareCount: p.shareCount,
      price: p.purchasePrice,
      amount: (parseFloat(p.shareCount) * parseFloat(p.purchasePrice)).toFixed(2),
    })),
    ...sales.map((s) => ({
      kind: 'sale' as const,
      id: s.id,
      date: s.date,
      createdAt: s.createdAt,
      shareCount: s.shareCount,
      price: s.salePrice,
      amount: (parseFloat(s.shareCount) * parseFloat(s.salePrice)).toFixed(2),
      realizedGainLoss: realizedGainLossBySaleId[s.id] ?? '0.00',
    })),
    ...dividends.map((d) => ({
      kind: 'dividend' as const,
      id: d.id,
      date: d.date,
      createdAt: d.createdAt,
      netAmount: d.netAmount,
      grossAmount: grossDividend(d.netAmount, d.retentionPercent) || d.netAmount,
    })),
    ...valuations.map((v) => ({
      kind: 'valuation' as const,
      id: v.id,
      date: v.date,
      createdAt: v.createdAt,
      pricePerShare: v.pricePerShare,
    })),
  ];

  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

export interface CashFlow {
  date: string;
  amount: number;
}

/** TIR (tasa interna de retorno anualizada, método XIRR): la tasa `r` que hace que la suma de
 *  todos los flujos de caja, descontados a día de hoy con interés compuesto diario, sea 0 —
 *  a diferencia de `totalReturnPercent` (acumulado, sin tener en cuenta cuándo se puso o sacó
 *  cada euro), esto sí es comparable entre posiciones con distinta antigüedad. Resuelto por
 *  bisección (no Newton-Raphson): más lento pero no diverge con los flujos irregulares que puede
 *  tener una posición real (varias compras y ventas parciales en fechas cualquiera). `null` sin
 *  al menos un flujo negativo y uno positivo (p. ej. solo compras, sin valoración todavía) — no
 *  hay tasa que resuelva la ecuación. */
export function xirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;
  if (!cashFlows.some((cf) => cf.amount > 0) || !cashFlows.some((cf) => cf.amount < 0)) return null;

  const t0 = cashFlows.reduce((min, cf) => (cf.date < min ? cf.date : min), cashFlows[0].date);
  const tMax = cashFlows.reduce((max, cf) => (cf.date > max ? cf.date : max), cashFlows[0].date);
  // Todos los flujos el mismo día (p. ej. una compra y su venta el mismo día): sin tiempo
  // transcurrido no hay una tasa ANUAL que tenga sentido — cualquier `r` cumple la ecuación por
  // igual (`npv` es constante, no una curva con un único cruce por 0).
  if (t0 === tMax) return null;
  const yearsSince = (date: string) => (new Date(date).getTime() - new Date(t0).getTime()) / (1000 * 60 * 60 * 24 * 365);
  const npv = (rate: number) => cashFlows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, yearsSince(cf.date)), 0);

  let low = -0.999;
  let high = 10;
  let npvLow = npv(low);
  let npvHigh = npv(high);
  let expandAttempts = 0;
  while (npvLow * npvHigh > 0 && expandAttempts < 50) {
    high *= 2;
    npvHigh = npv(high);
    expandAttempts++;
  }
  if (npvLow * npvHigh > 0 || Number.isNaN(npvLow) || Number.isNaN(npvHigh)) return null;

  let mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    const npvMid = npv(mid);
    if (Math.abs(npvMid) < 0.01) break;
    if ((npvMid > 0) === (npvLow > 0)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }
  return mid * 100;
}

/** Flujos de caja de una posición para `xirr`: compras en negativo (dinero que sale del bolsillo),
 *  ventas y dividendos netos en positivo (dinero que entra), y un último flujo positivo con el
 *  valor actual de lo que queda en cartera a fecha `asOf` — como si se vendiera todo hoy mismo. Sin
 *  esa valoración final (o sin nada en cartera) la TIR solo tendría en cuenta el dinero ya
 *  recuperado, no lo que queda invertido. */
export function stockCashFlows(
  purchases: StockPurchase[],
  sales: StockSale[],
  dividends: StockDividend[],
  currentValueOfHeld: string | null,
  heldShares: string,
  asOf: string,
): CashFlow[] {
  const flows: CashFlow[] = [
    ...purchases.map((p) => ({ date: p.date, amount: -parseFloat(p.shareCount) * parseFloat(p.purchasePrice) })),
    ...sales.map((s) => ({ date: s.date, amount: parseFloat(s.shareCount) * parseFloat(s.salePrice) })),
    ...dividends.map((d) => ({ date: d.date, amount: parseFloat(d.netAmount) })),
  ];
  if (currentValueOfHeld !== null && parseFloat(heldShares) > 0) {
    flows.push({ date: asOf, amount: parseFloat(currentValueOfHeld) });
  }
  return flows;
}

/** Ganancia/pérdida realizada (FIFO) que esta posición aporta a cada año natural en el que tuvo
 *  alguna venta — más reciente primero. Mismo cálculo por venta que `stockOperationsTimeline`,
 *  agregado por año para el aviso de "impacto fiscal" de la página de detalle (spec 031 h): la
 *  base imponible real de un año concreto es la suma de TODAS las posiciones de ese ejercicio
 *  (con compensación de pérdidas de años anteriores incluida) — eso solo puede verse en el
 *  "Cálculo de impuestos" de Patrimonio, no aquí, con una sola posición. */
export function stockRealizedGainLossByYear(purchases: StockPurchase[], sales: StockSale[]): Array<{ year: string; amount: string }> {
  const { realizedGainLossBySaleId } = fifoPositionState(purchases, sales);
  const byYear = new Map<string, number>();
  for (const sale of sales) {
    const year = sale.date.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + parseFloat(realizedGainLossBySaleId[sale.id] ?? '0'));
  }
  return Array.from(byYear.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, amount]) => ({ year, amount: amount.toFixed(2) }));
}

export interface StockDetailStats {
  heldShares: string;
  heldCost: string;
  currentValue: string | null;
  unrealizedGainLossAmount: string | null;
  unrealizedGainLossPercent: number | null;
  realizedGainLoss: string;
  dividendsNet: string;
  dividendsGross: string;
  totalReturnAmount: string | null;
  totalReturnPercent: number | null;
  annualizedReturnPercent: number | null;
  averageHeldPurchasePrice: string | null;
  totalPurchasedCost: string;
  totalSharesPurchased: string;
  totalSharesSold: string;
  purchaseCount: number;
  saleCount: number;
  dividendCount: number;
  valuationCount: number;
  firstPurchaseDate: string | null;
  lastOperationDate: string | null;
  lastValuationDate: string | null;
  lastValuationPrice: string | null;
}

/** Resumen de estadísticas de una posición para las tarjetas de la página de detalle.
 *  `totalReturnPercent` es la rentabilidad acumulada (realizada + no realizada + dividendos
 *  netos, sobre el total histórico invertido); `annualizedReturnPercent` es la TIR (`xirr`) de
 *  los mismos flujos de caja, comparable entre posiciones con distinta antigüedad. `asOf` es la
 *  fecha de "hoy" (aislada del reloj del sistema, igual que `asOf` en `wealth-evolution.calculations.ts`
 *  junto a `WealthPage.tsx`) — el flujo final de la TIR (valor de lo que queda en cartera) se
 *  descuenta desde ella. */
export function stockDetailStats(
  purchases: StockPurchase[],
  sales: StockSale[],
  dividends: StockDividend[],
  valuations: StockValuation[],
  asOf: string,
): StockDetailStats {
  const fifoState = fifoPositionState(purchases, sales);
  const heldShares = parseFloat(fifoState.heldShares);
  const heldCost = parseFloat(fifoState.heldCost);

  const lastValuation = [...valuations].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0] ?? null;
  const currentVal = lastValuation ? currentValue(lastValuation.pricePerShare, fifoState.heldShares) : null;
  const unrealizedGainLossAmount = currentVal !== null ? (parseFloat(currentVal) - heldCost).toFixed(2) : null;
  const unrealizedGainLossPercent = currentVal !== null ? gainLossPercent(currentVal, fifoState.heldCost) : null;

  const realizedGainLoss = totalRealizedGainLoss(fifoState);
  const dividendsNet = totalDividends(dividends);
  const dividendsGross = totalGrossDividends(dividends);

  const totalPurchasedCost = purchases.reduce((sum, p) => sum + parseFloat(p.shareCount) * parseFloat(p.purchasePrice), 0).toFixed(2);
  const totalSharesPurchased = purchases.reduce((sum, p) => sum + parseFloat(p.shareCount), 0).toFixed(8);
  const totalSharesSold = sales.reduce((sum, s) => sum + parseFloat(s.shareCount), 0).toFixed(8);

  const totalPurchasedCostNum = parseFloat(totalPurchasedCost);
  const totalReturnAmount =
    totalPurchasedCostNum > 0
      ? (
          parseFloat(realizedGainLoss) +
          (unrealizedGainLossAmount !== null ? parseFloat(unrealizedGainLossAmount) : 0) +
          parseFloat(dividendsNet)
        ).toFixed(2)
      : null;
  const totalReturnPercent = totalReturnAmount !== null ? (parseFloat(totalReturnAmount) / totalPurchasedCostNum) * 100 : null;
  const annualizedReturnPercent = xirr(stockCashFlows(purchases, sales, dividends, currentVal, fifoState.heldShares, asOf));

  const averageHeldPurchasePrice = heldShares > 0 ? (heldCost / heldShares).toFixed(4) : null;

  const allOperationDates = [...purchases.map((p) => p.date), ...sales.map((s) => s.date), ...dividends.map((d) => d.date)];
  const firstPurchaseDate =
    purchases.length > 0 ? purchases.reduce((min, p) => (p.date < min ? p.date : min), purchases[0].date) : null;
  const lastOperationDate =
    allOperationDates.length > 0 ? allOperationDates.reduce((max, date) => (date > max ? date : max), allOperationDates[0]) : null;

  return {
    heldShares: fifoState.heldShares,
    heldCost: fifoState.heldCost,
    currentValue: currentVal,
    unrealizedGainLossAmount,
    unrealizedGainLossPercent,
    realizedGainLoss,
    dividendsNet,
    dividendsGross,
    totalReturnAmount,
    totalReturnPercent,
    annualizedReturnPercent,
    averageHeldPurchasePrice,
    totalPurchasedCost,
    totalSharesPurchased,
    totalSharesSold,
    purchaseCount: purchases.length,
    saleCount: sales.length,
    dividendCount: dividends.length,
    valuationCount: valuations.length,
    firstPurchaseDate,
    lastOperationDate,
    lastValuationDate: lastValuation?.date ?? null,
    lastValuationPrice: lastValuation?.pricePerShare ?? null,
  };
}
