// Spec 039 (simulador de cesta de la compra), plan.md §4: cálculo puro sobre el
// historial de precios ya devuelto por `getProductPrices()` (spec 034) — sin endpoint
// nuevo, mismo criterio que las estadísticas de `ProductDetailPage` (spec 037).
import type { ProductPrice } from '../api/groceries';

export interface BasketProductPrices {
  productId: string;
  productName: string;
  /** Historial completo de `getProductPrices(productId)`. */
  prices: ProductPrice[];
}

export interface BasketLine {
  productId: string;
  productName: string;
  supermarketId: string;
  supermarketName: string;
  pricePerUnit: string;
}

export interface SingleSupermarketOption {
  supermarketId: string;
  supermarketName: string;
  total: string;
  lines: BasketLine[];
}

export interface MixedOption {
  total: string;
  storeCount: number;
  lines: BasketLine[];
}

export interface BasketSimulation {
  missingProducts: { productId: string; productName: string }[];
  cheapestSingle: SingleSupermarketOption | null;
  mostExpensiveSingle: SingleSupermarketOption | null;
  cheapestMixed: MixedOption | null;
  fewestStoresMixed: MixedOption | null;
}

interface SupermarketPrice {
  supermarketId: string;
  supermarketName: string;
  pricePerUnit: number;
}

interface ProductWithLatestPrices {
  productId: string;
  productName: string;
  /** Precio más reciente (por fecha) de cada supermercado en el que se ha comprado. */
  bySupermarket: Map<string, SupermarketPrice>;
}

/** Precio más reciente por supermercado (decisión ya confirmada): agrupa por `supermarketId`
 *  y se queda con el de `date` más alta. Empate de fecha (mismo día, dos supermercados
 *  distintos no puede darse — es una fecha por ticket): se queda con el primero encontrado,
 *  sin más criterio, no afecta a ningún caso real. */
function latestPricesBySupermarket(prices: ProductPrice[]): Map<string, SupermarketPrice> {
  const bySupermarket = new Map<string, SupermarketPrice & { date: string }>();
  for (const price of prices) {
    const current = bySupermarket.get(price.supermarketId);
    if (!current || price.date > current.date) {
      bySupermarket.set(price.supermarketId, {
        supermarketId: price.supermarketId,
        supermarketName: price.supermarketName,
        pricePerUnit: parseFloat(price.pricePerUnit),
        date: price.date,
      });
    }
  }
  return bySupermarket;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

/** H2 (spec.md): simula, para una lista de productos con su historial de precios completo,
 *  en qué supermercado sale más barato/más caro comprarlo todo, y las dos formas de repartir
 *  la compra entre varios supermercados (la más barata sin límite, y la que visita menos
 *  supermercados posible). */
export function computeBasketSimulation(products: BasketProductPrices[]): BasketSimulation {
  const missingProducts = products
    .filter((product) => product.prices.length === 0)
    .map((product) => ({ productId: product.productId, productName: product.productName }));

  const withData: ProductWithLatestPrices[] = products
    .filter((product) => product.prices.length > 0)
    .map((product) => ({
      productId: product.productId,
      productName: product.productName,
      bySupermarket: latestPricesBySupermarket(product.prices),
    }));

  if (withData.length === 0) {
    return { missingProducts, cheapestSingle: null, mostExpensiveSingle: null, cheapestMixed: null, fewestStoresMixed: null };
  }

  return {
    missingProducts,
    ...singleSupermarketOptions(withData),
    cheapestMixed: cheapestMixedOption(withData),
    fewestStoresMixed: fewestStoresMixedOption(withData),
  };
}

/** Criterios 1, 2, 5, 6: de los supermercados que tienen precio de TODOS los productos con
 *  datos, el de menor y el de mayor total (el mismo si solo hay un candidato). `null` en
 *  ambos si ningún supermercado cubre la lista completa (criterio 4). */
function singleSupermarketOptions(
  products: ProductWithLatestPrices[],
): { cheapestSingle: SingleSupermarketOption | null; mostExpensiveSingle: SingleSupermarketOption | null } {
  const [first, ...rest] = products;
  const candidateIds = [...first.bySupermarket.keys()].filter((supermarketId) =>
    rest.every((product) => product.bySupermarket.has(supermarketId)),
  );

  const options = candidateIds
    .map((supermarketId) => buildSingleSupermarketOption(products, supermarketId))
    .sort((a, b) => a.supermarketName.localeCompare(b.supermarketName));

  if (options.length === 0) return { cheapestSingle: null, mostExpensiveSingle: null };

  const cheapestSingle = options.reduce((min, option) => (parseFloat(option.total) < parseFloat(min.total) ? option : min));
  const mostExpensiveSingle = options.reduce((max, option) => (parseFloat(option.total) > parseFloat(max.total) ? option : max));
  return { cheapestSingle, mostExpensiveSingle };
}

function buildSingleSupermarketOption(products: ProductWithLatestPrices[], supermarketId: string): SingleSupermarketOption {
  const lines = products.map((product) => {
    const price = product.bySupermarket.get(supermarketId)!;
    return {
      productId: product.productId,
      productName: product.productName,
      supermarketId: price.supermarketId,
      supermarketName: price.supermarketName,
      pricePerUnit: price.pricePerUnit.toFixed(2),
    };
  });
  const total = lines.reduce((sum, line) => sum + parseFloat(line.pricePerUnit), 0);
  return { supermarketId, supermarketName: lines[0].supermarketName, total: total.toFixed(2), lines };
}

/** Criterio 3: para cada producto, el supermercado más barato en el que hay dato, sin
 *  límite de en cuántos supermercados distintos se reparte. Empate de precio: el
 *  supermercado cuyo nombre va antes alfabéticamente, para que el resultado sea estable. */
function cheapestMixedOption(products: ProductWithLatestPrices[]): MixedOption {
  const lines = products.map((product) => cheapestLineFor(product, [...product.bySupermarket.keys()]));
  return buildMixedOption(lines);
}

function cheapestLineFor(product: ProductWithLatestPrices, allowedSupermarketIds: string[]): BasketLine {
  const candidates = allowedSupermarketIds
    .map((supermarketId) => product.bySupermarket.get(supermarketId)!)
    .sort((a, b) => a.pricePerUnit - b.pricePerUnit || a.supermarketName.localeCompare(b.supermarketName));
  const cheapest = candidates[0];
  return {
    productId: product.productId,
    productName: product.productName,
    supermarketId: cheapest.supermarketId,
    supermarketName: cheapest.supermarketName,
    pricePerUnit: cheapest.pricePerUnit.toFixed(2),
  };
}

function buildMixedOption(lines: BasketLine[]): MixedOption {
  const total = lines.reduce((sum, line) => sum + parseFloat(line.pricePerUnit), 0);
  const storeCount = new Set(lines.map((line) => line.supermarketId)).size;
  return { total: total.toFixed(2), storeCount, lines };
}

/** Criterio 4 (mixta con menos súpers): el menor número de supermercados que, entre todos,
 *  cubren todos los productos con datos; entre las combinaciones de ese tamaño mínimo, la
 *  más barata. Fuerza bruta sobre combinaciones del universo de supermercados relevantes —
 *  asumible a la escala de una lista personal (plan.md §4). */
function fewestStoresMixedOption(products: ProductWithLatestPrices[]): MixedOption {
  const universe = [...new Set(products.flatMap((product) => [...product.bySupermarket.keys()]))].sort();

  for (let size = 1; size <= universe.length; size++) {
    const coveringCombos = combinations(universe, size).filter((combo) =>
      products.every((product) => combo.some((supermarketId) => product.bySupermarket.has(supermarketId))),
    );
    if (coveringCombos.length === 0) continue;

    let best: MixedOption | null = null;
    for (const combo of coveringCombos) {
      const lines = products.map((product) => cheapestLineFor(product, combo));
      const option = buildMixedOption(lines);
      if (!best || parseFloat(option.total) < parseFloat(best.total)) best = option;
    }
    return best!;
  }

  // Inalcanzable en la práctica: `universe` se construye a partir de los propios
  // supermercados de `products`, así que el universo completo siempre cubre.
  return cheapestMixedOption(products);
}
