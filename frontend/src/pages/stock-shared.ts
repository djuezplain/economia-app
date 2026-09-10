// Cálculos de posición (compras/ventas/dividendos) compartidos entre `WealthPage.tsx`
// (tarjeta de cada acción) y `StockDetailPage.tsx` (página de detalle de una acción,
// spec 031 h). Genéricos sobre compras/ventas con forma `{ shareCount, purchasePrice }`
// tal cual `WealthPage.tsx` los usaba también para Fondos Inversión antes de esta
// extracción — mismo criterio, solo movidos de fichero.
import type { Stock } from '../api/stocks';
import type { StockPurchase } from '../api/stock-purchases';
import type { StockSale } from '../api/stock-sales';
import type { StockValuation } from '../api/stock-valuations';

/** H2 criterio 3 (spec 020): calculado, nunca guardado — ver `wealth.calculations.ts` en el backend. */
export function purchaseValue(purchasePrice: string, shareCount: string): string {
  const price = parseFloat(purchasePrice);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** H3 criterio 1/3 (spec 020, revisión §3.ter): valor actual de la posición = precio por
 *  acción de la valoración más reciente × nº total de acciones — calculado, nunca guardado. */
export function currentValue(pricePerShare: string, shareCount: string): string {
  const price = parseFloat(pricePerShare);
  const shares = parseFloat(shareCount);
  if (Number.isNaN(price) || Number.isNaN(shares)) return '';
  return (price * shares).toFixed(2);
}

/** % de ganancia o pérdida = (Valor actual − Coste total) / Coste total × 100 — calculado,
 *  nunca guardado. `null` sin coste (ninguna compra todavía): no hay base sobre la que calcular un %. */
export function gainLossPercent(currentVal: string, cost: string): number | null {
  const value = parseFloat(currentVal);
  const costNum = parseFloat(cost);
  if (Number.isNaN(value) || Number.isNaN(costNum) || costNum === 0) return null;
  return ((value - costNum) / costNum) * 100;
}

/** H1 criterio 2/3 (spec 030): mismo `gainLossPercent` ya existente, pero sumando un importe de
 *  dividendos al valor actual antes de comparar con el coste — reutilizado tal cual, sin duplicar
 *  su lógica de `null` (coste 0, importes inválidos). */
export function gainLossPercentWithDividends(currentVal: string, cost: string, dividendsTotal: string): number | null {
  const value = parseFloat(currentVal);
  const dividends = parseFloat(dividendsTotal);
  if (Number.isNaN(value) || Number.isNaN(dividends)) return null;
  return gainLossPercent((value + dividends).toFixed(2), cost);
}

/** H2/H3 (spec 029): total neto cobrado en dividendos — de una sola posición o de toda la
 *  cartera según qué lista se le pase. Tipo estructural, mismo criterio que `totalShares`. */
export function totalDividends(dividends: Array<{ netAmount: string }>): string {
  return dividends.reduce((sum, d) => sum + parseFloat(d.netAmount), 0).toFixed(2);
}

/** H1 criterio 3 (spec 029): Bruto = Neto ÷ (1 − %Retención ÷ 100) — calculado, nunca guardado.
 *  Mismo criterio que `purchaseValue`/`currentValue`. Genérica para acciones y fondos. */
export function grossDividend(netAmount: string, retentionPercent: string): string {
  const net = parseFloat(netAmount);
  const retention = parseFloat(retentionPercent);
  if (Number.isNaN(net) || Number.isNaN(retention)) return '';
  return (net / (1 - retention / 100)).toFixed(2);
}

/** H1 criterio 3 (spec 030): total de dividendos brutos de una lista — suma el bruto de cada
 *  dividendo individual (`grossDividend` por dividendo, no el bruto de la suma de netos), porque
 *  cada uno puede tener una retención distinta. */
export function totalGrossDividends(dividends: Array<{ netAmount: string; retentionPercent: string }>): string {
  return dividends.reduce((sum, d) => sum + parseFloat(grossDividend(d.netAmount, d.retentionPercent) || '0'), 0).toFixed(2);
}

/** H2 criterio 1/2 (spec 031): simula FIFO sobre TODOS los movimientos (compras y ventas) de una
 *  posición de Acciones, ordenados cronológicamente (fecha; en caso de empate, compras antes que
 *  ventas — H1 criterio 2, mismo día). Devuelve lo que queda en cartera (cantidad y coste FIFO) y
 *  la ganancia/pérdida de cada venta individual, indexada por su id — calculado, nunca guardado,
 *  igual que el resto de esta página. `totalShares`/`totalCost` no se tocan: siguen siendo
 *  compras-brutas tal cual, para Fondos/Cripto (spec.md §2, "solo Acciones"). */
export function fifoPositionState(
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
export function isStockPositionClosed(
  purchases: Array<{ id: string; date: string; shareCount: string; purchasePrice: string; createdAt: string }>,
  sales: Array<{ id: string; date: string; shareCount: string; salePrice: string; createdAt: string }>,
): boolean {
  return purchases.length > 0 && parseFloat(fifoPositionState(purchases, sales).heldShares) === 0;
}

/** H2 criterio 4 (spec 031): total de ganancia/pérdida realizada de una posición — suma de
 *  `realizedGainLossBySaleId` de su propio `fifoPositionState`. */
export function totalRealizedGainLoss(fifoState: { realizedGainLossBySaleId: Record<string, string> }): string {
  return Object.values(fifoState.realizedGainLossBySaleId)
    .reduce((sum, v) => sum + parseFloat(v), 0)
    .toFixed(2);
}

/** Resumen (parte superior de la página): sumatorio del valor actual de cada acción — mismo
 *  criterio que `currentValue`. Una acción sin ninguna valoración aún contribuye 0, mismo
 *  criterio que "Sin valoración" en su propia tarjeta. También usado por `StockDetailPage.tsx`
 *  para calcular el peso de una posición sobre el total de Acciones (spec 031 h). `valuations`
 *  debe venir ya ordenado por fecha descendente (como llega de la API): `.find` se queda con la
 *  primera de cada posición. */
export function stocksTotal(stocks: Stock[], purchases: StockPurchase[], sales: StockSale[], valuations: StockValuation[]): string {
  return stocks
    .reduce((sum, stock) => {
      const stockPurchases = purchases.filter((p) => p.stockId === stock.id);
      const stockSales = sales.filter((s) => s.stockId === stock.id);
      const lastValuation = valuations.find((v) => v.stockId === stock.id);
      if (!lastValuation) return sum;
      const { heldShares } = fifoPositionState(stockPurchases, stockSales);
      return sum + parseFloat(currentValue(lastValuation.pricePerShare, heldShares));
    }, 0)
    .toFixed(2);
}
