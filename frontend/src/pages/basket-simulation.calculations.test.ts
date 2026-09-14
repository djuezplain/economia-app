import { describe, expect, it } from 'vitest';
import { computeBasketSimulation } from './basket-simulation.calculations';
import type { BasketProductPrices } from './basket-simulation.calculations';
import type { ProductPrice } from '../api/groceries';

function price(overrides: Partial<ProductPrice> = {}): ProductPrice {
  return {
    receiptId: 'r1',
    supermarketId: 's1',
    supermarketName: 'Mercadona',
    date: '2026-01-01',
    unit: 'unidad',
    pricePerUnit: '1.00',
    amount: '1.00',
    ...overrides,
  };
}

function product(overrides: Partial<BasketProductPrices> = {}): BasketProductPrices {
  return { productId: 'p1', productName: 'Producto', prices: [], ...overrides };
}

describe('computeBasketSimulation', () => {
  it('usa el precio más reciente por supermercado cuando hay varias fechas', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', date: '2026-01-01', pricePerUnit: '1.00' }),
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', date: '2026-03-01', pricePerUnit: '1.20' }),
      ],
    });
    const result = computeBasketSimulation([leche]);
    expect(result.cheapestSingle?.total).toBe('1.20');
  });

  it('cesta única: elige el súper más barato y el más caro entre los candidatos', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '1.50' }),
      ],
    });
    const pan = product({
      productId: 'pan',
      productName: 'Pan',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '0.80' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '0.70' }),
      ],
    });
    const result = computeBasketSimulation([leche, pan]);
    expect(result.cheapestSingle?.supermarketName).toBe('Mercadona');
    expect(result.cheapestSingle?.total).toBe('1.80');
    expect(result.mostExpensiveSingle?.supermarketName).toBe('Carrefour');
    expect(result.mostExpensiveSingle?.total).toBe('2.20');
  });

  it('sin ningún supermercado que cubra todos los productos, cesta única es null', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' })],
    });
    const pan = product({
      productId: 'pan',
      productName: 'Pan',
      prices: [price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '0.70' })],
    });
    const result = computeBasketSimulation([leche, pan]);
    expect(result.cheapestSingle).toBeNull();
    expect(result.mostExpensiveSingle).toBeNull();
    // La mixta más barata sigue calculándose con lo que sí hay dato.
    expect(result.cheapestMixed?.total).toBe('1.70');
  });

  it('con un único candidato, más barato y más caro son el mismo resultado', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' })],
    });
    const result = computeBasketSimulation([leche]);
    expect(result.cheapestSingle?.supermarketId).toBe('merc');
    expect(result.mostExpensiveSingle?.supermarketId).toBe('merc');
    expect(result.cheapestSingle?.total).toBe(result.mostExpensiveSingle?.total);
  });

  it('mixta más barata reparte entre varios supermercados sin límite', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '1.50' }),
      ],
    });
    const pan = product({
      productId: 'pan',
      productName: 'Pan',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '0.80' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '0.70' }),
      ],
    });
    const result = computeBasketSimulation([leche, pan]);
    expect(result.cheapestMixed?.total).toBe('1.70');
    expect(result.cheapestMixed?.storeCount).toBe(2);
    expect(result.cheapestMixed?.lines.find((l) => l.productId === 'leche')?.supermarketName).toBe('Mercadona');
    expect(result.cheapestMixed?.lines.find((l) => l.productId === 'pan')?.supermarketName).toBe('Carrefour');
  });

  it('mixta con menos súpers elige un único supermercado aunque cueste algo más que la mixta más barata', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '1.50' }),
      ],
    });
    const pan = product({
      productId: 'pan',
      productName: 'Pan',
      prices: [
        price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '0.80' }),
        price({ supermarketId: 'carr', supermarketName: 'Carrefour', pricePerUnit: '0.70' }),
      ],
    });
    const result = computeBasketSimulation([leche, pan]);
    // Mixta más barata: 1.70€ en 2 súpers. Con menos súpers: un único súper (Mercadona,
    // 1.80€) es más barato que Carrefour (2.20€) y visita solo 1 supermercado.
    expect(result.fewestStoresMixed?.storeCount).toBe(1);
    expect(result.fewestStoresMixed?.total).toBe('1.80');
    expect(parseFloat(result.fewestStoresMixed!.total)).toBeGreaterThan(parseFloat(result.cheapestMixed!.total));
  });

  it('un producto sin ningún precio histórico va a missingProducts y no cuenta en ningún total', () => {
    const leche = product({
      productId: 'leche',
      productName: 'Leche',
      prices: [price({ supermarketId: 'merc', supermarketName: 'Mercadona', pricePerUnit: '1.00' })],
    });
    const sinDatos = product({ productId: 'sin-datos', productName: 'Producto nuevo', prices: [] });
    const result = computeBasketSimulation([leche, sinDatos]);
    expect(result.missingProducts).toEqual([{ productId: 'sin-datos', productName: 'Producto nuevo' }]);
    expect(result.cheapestSingle?.total).toBe('1.00');
    expect(result.cheapestSingle?.lines).toHaveLength(1);
  });

  it('con todos los productos sin datos, todo es null salvo missingProducts', () => {
    const sinDatos1 = product({ productId: 'p1', productName: 'Uno', prices: [] });
    const sinDatos2 = product({ productId: 'p2', productName: 'Dos', prices: [] });
    const result = computeBasketSimulation([sinDatos1, sinDatos2]);
    expect(result.missingProducts).toHaveLength(2);
    expect(result.cheapestSingle).toBeNull();
    expect(result.mostExpensiveSingle).toBeNull();
    expect(result.cheapestMixed).toBeNull();
    expect(result.fewestStoresMixed).toBeNull();
  });
});
