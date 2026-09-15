# Plan 040 — Filtros en el historial de tickets

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1)

## 1. Backend — `GET /receipts` gana query params

`ListReceiptsQueryDto` (`backend/src/groceries/dto/list-receipts-query.dto.ts`), mismo patrón que `ListTransactionsQueryDto` (spec 002):

```ts
export class ListReceiptsQueryDto {
  @IsOptional() @IsUUID() supermarketId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsMoneyAmount() amountMin?: string;
  @IsOptional() @IsMoneyAmount() amountMax?: string;
}
```

Reutiliza `IsMoneyAmount` (`common/is-money-amount.decorator.ts`, ya existente) para `amountMin`/`amountMax` — mismo formato que cualquier importe de la app.

`ReceiptsController.list()` pasa el DTO a `ReceiptsService.list(userId, query)`.

## 2. `ReceiptsService.list()` — filtra sin joins SQL, mismo criterio que el resto del módulo

- Validación cruzada (400, mismo mensaje/patrón que `TransactionsService`): `dateFrom > dateTo` o `amountMin > amountMax` → `BadRequestException`.
- `conditions` sobre `receipts`: `userId` (siempre) + `supermarketId` (si viene) + `gte(date, dateFrom)` + `lte(date, dateTo)` — todo lo que se puede filtrar directamente en la tabla `receipts`.
- Tras traer los `receipts` que cumplen eso, una única consulta a `receiptLines` con `inArray(receiptId, ids)` (igual que `getPrices` en `ProductsService`) para, en JS:
  - **`linesTotal` por ticket**: suma de `amount` de sus líneas — el importe real usado para el filtro de importe (spec.md H1 criterio 4: nunca `printedTotal`, que puede ser `null`).
  - **Presencia del `productId` filtrado** (si viene): qué `receiptId`s tienen al menos una línea con ese producto.
- Filtrado final en JS: si `productId` viene, se descartan los tickets sin ese producto; si `amountMin`/`amountMax` vienen, se descartan por `linesTotal` fuera de rango.
- `ReceiptSummary` gana `linesTotal: string` — se muestra en la tabla (plan.md §4) para que el importe por el que se está filtrando sea siempre visible, no solo el total impreso (que puede faltar).

Sin cambios en `getById`/`update`/`remove`.

## 3. DTO y tipos

- `ReceiptSummary` (backend `receipts.service.ts` y frontend `api/groceries.ts`) gana `linesTotal: string`.
- `frontend/src/api/groceries.ts`: `listReceipts()` acepta un objeto de filtros opcional y construye el query string (mismo patrón que `listTransactions()` en `api/transactions.ts`).

## 4. Frontend — `ReceiptsPage.tsx`

Mismo patrón que `MovementsListPage.tsx` (spec 002/006): estado local por filtro, un `filters` memoizado como dependencia de un único `useEffect` que recarga la lista — sin botón "Aplicar", cada cambio filtra al momento.

- Sección "Filtros": `supermarketId` (`<select>`, opciones de `listSupermarkets()`, "Todos" por defecto — ya son solo los que tienen algún ticket, spec 034 §3), `productId` (`<select>`, opciones de `searchProducts()`, "Todos" por defecto — mismo razonamiento), `dateFrom`/`dateTo` (`input type="date"`), `amountMin`/`amountMax` (`input type="number" step="0.01" min="0"`).
- Botón "Limpiar filtros" (criterio 8): resetea los seis campos a su valor vacío en un único `onClick`.
- Tabla: nueva columna "Suma de líneas" junto a la ya existente "Total impreso".
- Sin resultados con algún filtro activo: mensaje "No hay tickets con estos filtros." en vez de la tabla vacía (criterio 7) — se distingue de "Todavía no has importado ningún ticket." (sin tickets en absoluto, ya existente) comprobando si hay algún filtro activo.

## 5. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
