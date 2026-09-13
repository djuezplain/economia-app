# Plan 037 — Estadísticas e historial enlazado en el detalle de producto

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1-H2)

## 1. Backend — `ProductPrice` gana `amount`

`GET /products/:id/prices` (spec 034) devuelve hoy `{ receiptId, supermarketId, supermarketName, date, unit, pricePerUnit }`. Se añade `amount` (importe de la línea) — necesario para "gasto total" (H1 criterio 3); `receiptId` ya existente cubre H2 sin cambios. Sin más cambios de `ProductsService.getPrices()` (mismo orden, mismos criterios de spec 034).

## 2. Estadísticas — funciones puras en el cliente

Mismo criterio que el cambio de "solo el más reciente + historial" (spec 036, cambio posterior): sin endpoint nuevo, se calcula en `ProductDetailPage.tsx` sobre la respuesta ya completa de `getProductPrices()` — a esta escala (datos de un usuario) no hace falta agregación en el servidor.

```ts
interface ProductStats {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  totalSpent: number;
  purchaseCount: number;
  cheapestSupermarket: { name: string; avgPrice: number };
}
```

- `minPrice`/`maxPrice`/`avgPrice`: sobre `pricePerUnit` de todas las líneas (comparable entre compras de distinto tamaño/peso, criterio ya usado en H4 de spec 034).
- `totalSpent`: suma de `amount` de todas las líneas.
- `purchaseCount`: nº de líneas (`prices.length`).
- `cheapestSupermarket`: media de `pricePerUnit` agrupada por supermercado, el mínimo de esas medias.
- Con `prices.length === 0`, no se calcula nada (H1 criterio 5) — la sección de estadísticas ni se renderiza.

## 3. Gráfico de evolución — Recharts, una serie por supermercado

Mismos componentes y estilo (`CHART_TICK_STYLE`/`CHART_TOOLTIP_STYLE`) que `DashboardPage`/`StockDetailPage`. Los datos de `prices` (fecha, supermercado, precio) se pivotan a formato ancho (una fila por fecha, una columna por supermercado) para que Recharts dibuje una `<Line>` por supermercado. Paleta de color cíclica sobre tokens ya existentes (`--accent-500`, `--accent-2-500`, `--neutral-700`, ...) — no hay un color fijo por supermercado en el resto de la app, así que se asigna por posición (orden alfabético del nombre, estable entre renders).

## 4. Historial enlazado (H2)

Las dos tablas ya existentes en `ProductDetailPage` (vista "solo el más reciente" y vista "Historial", spec 036) añaden una columna con `<Link to={`/tickets/${price.receiptId}`}>`. Sin cambios de datos (`receiptId` ya viene en `ProductPrice`).

## 5. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
