// Cálculos de posición (compras/ventas) de Fondos Inversión, compartidos entre
// `WealthPage.tsx` y cualquier otra vista de un fondo. Spec 044, plan.md §4:
// mismo contenido que `stock-shared.ts` (spec 031), duplicado a propósito en
// vez de generalizado sobre una entidad "posición" común — mismo criterio de
// "no abstracción prematura" que ya sigue el resto de la app (stocks/funds/
// cryptos duplican esquema y servicios en vez de compartirlos).
import type { Fund } from '../api/funds';
import type { FundPurchase } from '../api/fund-purchases';
import type { FundSale } from '../api/fund-sales';
import type { FundValuation } from '../api/fund-valuations';
import { currentValue } from './stock-shared';

/** H2 criterio 1/2 (spec 044): simula FIFO sobre TODOS los movimientos (compras y ventas) de un
 *  fondo, ordenados cronológicamente (fecha; en caso de empate, compras antes que ventas — H1
 *  criterio 2, mismo día). Devuelve lo que queda en cartera (cantidad y coste FIFO) y la
 *  ganancia/pérdida de cada venta individual, indexada por su id — calculado, nunca guardado.
 *  Idéntica a `fifoPositionState` de `stock-shared.ts` (spec 031); ver ese fichero para el
 *  historial de la corrección del desempate por `createdAt`. */
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

/** Un fondo está "cerrado" cuando se ha comprado alguna vez y, tras aplicar FIFO a compras y
 *  ventas, no quedan participaciones en cartera (se ha vendido todo). Sin ninguna compra todavía
 *  no cuenta como cerrado — es simplemente un fondo sin abrir. */
export function isFundPositionClosed(
  purchases: Array<{ id: string; date: string; shareCount: string; purchasePrice: string; createdAt: string }>,
  sales: Array<{ id: string; date: string; shareCount: string; salePrice: string; createdAt: string }>,
): boolean {
  return purchases.length > 0 && parseFloat(fifoPositionState(purchases, sales).heldShares) === 0;
}

/** H2 criterio 4 (spec 044): total de ganancia/pérdida realizada de un fondo — suma de
 *  `realizedGainLossBySaleId` de su propio `fifoPositionState`. Idéntica a `totalRealizedGainLoss`
 *  de `stock-shared.ts`. */
export function totalRealizedGainLoss(fifoState: { realizedGainLossBySaleId: Record<string, string> }): string {
  return Object.values(fifoState.realizedGainLossBySaleId)
    .reduce((sum, v) => sum + parseFloat(v), 0)
    .toFixed(2);
}

/** Resumen (parte superior de la página): sumatorio del valor actual de cada fondo — mismo
 *  criterio que `stocksTotal` tras spec 031 (usa lo que queda en cartera, no el total comprado).
 *  Un fondo sin ninguna valoración aún contribuye 0, mismo criterio que "Sin valoración" en su
 *  propia tarjeta. `valuations` debe venir ya ordenado por fecha descendente (como llega de la
 *  API): `.find` se queda con la primera de cada fondo. */
export function fundsTotal(funds: Fund[], purchases: FundPurchase[], sales: FundSale[], valuations: FundValuation[]): string {
  return funds
    .reduce((sum, fund) => {
      const fundPurchases = purchases.filter((p) => p.fundId === fund.id);
      const fundSales = sales.filter((s) => s.fundId === fund.id);
      const lastValuation = valuations.find((v) => v.fundId === fund.id);
      if (!lastValuation) return sum;
      const { heldShares } = fifoPositionState(fundPurchases, fundSales);
      return sum + parseFloat(currentValue(lastValuation.pricePerShare, heldShares));
    }, 0)
    .toFixed(2);
}
