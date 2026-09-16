# Plan 042 — Precio más bajo reciente en el listado de productos

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1)

## 1. Backend — `GET /products` calcula el precio en el propio servicio

A diferencia del simulador de cesta (spec 039, plan.md §4), que evita un endpoint nuevo porque es una acción puntual sobre pocos productos elegidos, `GET /products` se llama en cada carga/búsqueda del listado — hacer una petición extra por producto (`Promise.all` de `getProductPrices`) multiplicaría las peticiones en cada tecla del buscador. Se calcula aquí, en una sola pasada, con las mismas tablas que ya usa `ProductsService`.

`ProductsService.search()` cambia su tipo de retorno de `Product[]` a `ProductSummary[]`:

```ts
export interface ProductLowestPrice {
  pricePerUnit: string;
  unit: string;
  supermarketId: string;
  supermarketName: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  lowestRecentPrice: ProductLowestPrice | null;
}
```

Implementación (sin joins SQL, mismo criterio que el resto del módulo):

1. `productRows` = igual que hoy (filtro `search`, orden por nombre).
2. Una consulta a `receiptLines` con `inArray(productId, productRows.map(p => p.id))`.
3. Sin líneas → todos con `lowestRecentPrice: null`, corte rápido (criterio 2).
4. Con líneas: una consulta a `receipts` (`inArray(id, receiptIds)`) y una a `supermarkets` (`inArray(id, supermarketIds)`) — igual que `getPrices()`.
5. Agrupar líneas por `productId`; por cada producto, `lowestRecentPrice()` (helper privado nuevo): agrupa sus líneas por `supermarketId` quedándose con la de `receipt.date` más alta (mismo criterio que `latestPricesBySupermarket` del simulador de cesta, spec 039), y de esas se queda con el `pricePerUnit` mínimo (`Decimal`, igual que el resto de comparaciones de precio del backend). Con una sola línea/supermercado, ese es el resultado (criterio 3). Sin ninguna línea para ese producto, `null` (criterio 2).

`ProductsController.search()` sin cambios de firma — el tipo de retorno ya lo decide el servicio.

## 2. Frontend — nuevo campo opcional en `Product`

`frontend/src/api/groceries.ts`: `Product` gana `lowestRecentPrice?: ProductLowestPrice | null` (mismo shape que el backend). Aditivo — el resto de usos de `Product` en la app (selección de producto en tickets, buscador de la cesta de la compra) no leen este campo y siguen compilando igual.

`ProductsPage.tsx`: cada fila del listado muestra, junto al nombre, el precio y supermercado si `lowestRecentPrice` no es `null`, o "—" si lo es (criterio 2).

## 3. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
