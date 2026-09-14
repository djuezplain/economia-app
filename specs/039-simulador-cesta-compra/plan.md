# Plan 039 — Simulador de cesta de la compra

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1-H2)

## 1. Modelo de datos — dos tablas nuevas

Nuevo fichero `backend/src/db/schema/shopping-lists.schema.ts` (migración `0029`), añadido a `schema/index.ts`:

```ts
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('shopping_lists_user_idx').on(table.userId)],
);

export const shoppingListItems = pgTable(
  'shopping_list_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shoppingListId: uuid('shopping_list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('shopping_list_items_list_idx').on(table.shoppingListId),
    uniqueIndex('shopping_list_items_list_product_unique').on(table.shoppingListId, table.productId),
  ],
);
```

- `shoppingListItems.productId` es `cascade`, no `restrict` — mismo motivo ya documentado en `receiptLines.productId` (`groceries.schema.ts`): `users → products` y `users → shoppingLists → shoppingListItems` son dos ramas de distinta profundidad desde `users`, y el orden entre ramas de un `DELETE FROM users` en cascada no está garantizado por Postgres. Con `restrict` aquí, el borrado de cuenta (RGPD, spec 001 H8) podría fallar de forma intermitente igual que ya pasó con `receiptLines`.
- Índice único `(shoppingListId, productId)` — aplica H1 criterio 4 (sin productos repetidos en una lista) a nivel de base de datos, no solo de UI.
- Sin `userId` propio en `shoppingListItems`: el aislamiento pasa por `shoppingLists.userId`, mismo criterio que `receiptLines` vs. `receipts.userId`.

## 2. Backend — módulo `ShoppingListsModule`

Nuevo módulo `backend/src/shopping-lists/` (mismo patrón que `goals/`: un controller, un service, DTOs), registrado en `app.module.ts`. Consulta `products` directamente (misma tabla, sin importar `GroceriesModule` — los servicios de este proyecto ya acceden a tablas de otros dominios directamente vía Drizzle, p. ej. `ProductsService` consulta `receipts`/`supermarkets` sin pasar por sus módulos).

Endpoints, todos bajo `@UseGuards(AuthGuard, RequireActiveUserGuard)` y filtrados por `userId`:

| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| GET | `/shopping-lists` | — | `{ id, name, itemCount, createdAt }[]`, más reciente primero (`createdAt` desc) |
| POST | `/shopping-lists` | `{ name }` | la lista creada |
| GET | `/shopping-lists/:id` | — | `{ id, name, createdAt, items: { id, productId, productName }[] }`, items por `productName` asc |
| PATCH | `/shopping-lists/:id` | `{ name }` | la lista renombrada |
| DELETE | `/shopping-lists/:id` | — | 204 |
| POST | `/shopping-lists/:id/items` | `{ productId }` | el item creado |
| DELETE | `/shopping-lists/:id/items/:itemId` | — | 204 |

- `POST /shopping-lists/:id/items`: valida que `productId` existe y pertenece al usuario (404 si no); si ya está en la lista, la violación del índice único se traduce con `isUniqueViolation` (`common/db-errors.util.ts`, ya existente) a un 409 explícito — mismo patrón que el resto del proyecto, en vez de un 500 genérico.
- Sin endpoint de simulación en el backend — ver §4: se calcula en el cliente sobre datos que ya expone `GET /products/:id/prices` (spec 034), sin duplicar esa lógica de precios en el servidor.

## 3. Interacción con la fusión de productos (spec 038)

`ProductsService.merge()` (`backend/src/groceries/products.service.ts`) hoy reasigna `receiptLines.productId` de los perdedores al superviviente antes de borrarlos. Con `shoppingListItems` en cascada sobre `products`, sin este cambio un producto fusionado desaparecería silenciosamente de cualquier lista de la compra que lo tuviera — hueco real, no solo teórico, dado que fusionar productos "casi iguales" es precisamente spec 038.

Se añade, dentro de la misma transacción, antes de `tx.delete(products)`:

```ts
const affectedItems = await tx.select().from(shoppingListItems).where(inArray(shoppingListItems.productId, ids));
for (const item of affectedItems) {
  const [existing] = await tx
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.shoppingListId, item.shoppingListId), eq(shoppingListItems.productId, survivorId)));
  if (existing) {
    // La lista ya tiene el producto superviviente: reasignar violaría el
    // índice único (shoppingListId, productId) — se borra el duplicado.
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id));
  } else {
    await tx.update(shoppingListItems).set({ productId: survivorId }).where(eq(shoppingListItems.id, item.id));
  }
}
```

Secuencial (no `Promise.all`), a propósito: si dos productos fusionados están en la misma lista, el primero en procesarse reasigna su item al superviviente y el segundo lo encuentra ya presente y se borra — sin eso, ambas reasignaciones en paralelo violarían el índice único al mismo tiempo.

## 4. Cálculo de la simulación — función pura en el cliente

Mismo criterio que spec 037 §2 (estadísticas de producto): sin endpoint nuevo de precios, se reutiliza `getProductPrices(productId)` ya existente (una llamada por producto de la lista, en paralelo con `Promise.all` — a la escala de una lista personal, decenas de productos como mucho, es una carga trivial) y se calcula todo en `frontend/src/pages/basket-simulation.calculations.ts`, con test unitario dedicado (`basket-simulation.calculations.test.ts`), igual que `stock-detail.calculations.ts`/`wealth-evolution.calculations.ts`. Cumple la regla de la constitution (§2) de que los cálculos financieros son funciones puras con test, sin necesidad de que vivan en el backend.

```ts
export interface BasketProductPrices {
  productId: string;
  productName: string;
  prices: ProductPrice[]; // historial completo de GET /products/:id/prices
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
export function computeBasketSimulation(products: BasketProductPrices[]): BasketSimulation;
```

Pasos internos:

1. **Precio más reciente por producto+supermercado** (decisión ya confirmada): para cada producto, agrupar `prices` por `supermarketId` y quedarse con el de `date` más alta (empate: no se puede dar en la práctica — una fecha es un ticket, y `receiptLines` no permite dos líneas del mismo producto en el mismo ticket sin más que sumarlas a mano al importar; si ocurriera, se toma la primera encontrada, sin más criterio — no afecta al resultado en ningún caso real).
2. **Productos sin datos** (H2 criterio 7): productos con `prices.length === 0` van a `missingProducts` y no participan en ningún cálculo siguiente.
3. **Cesta única** (criterios 1, 2, 5, 6): candidatos = supermercados presentes en el precio-más-reciente de **todos** los productos con datos. `cheapestSingle`/`mostExpensiveSingle` = el de menor/mayor suma entre los candidatos; `null` si no hay ningún candidato (criterio 4). Con un único candidato, ambos apuntan al mismo resultado (criterio 6), sin caso especial en el código.
4. **Mixta más barata** (criterio 3): para cada producto con datos, el supermercado con menor precio-más-reciente; `total` = suma, `storeCount` = nº de supermercados distintos usados. `null` solo si no queda ningún producto con datos.
5. **Mixta con menos súpers** (criterio 4 de `spec.md`): sea `U` el universo de supermercados que aparecen en el precio-más-reciente de al menos un producto con datos (en la práctica, un puñado — los supermercados que usa Diego). Para `k = 1, 2, ...` hasta `|U|`: de entre todos los subconjuntos de `U` de tamaño `k`, quedarse con los que cubren (tienen precio de) todos los productos con datos; si hay al menos uno, `fewestStoresMixed` = el de coste mínimo entre esos subconjuntos que cubren (asignando cada producto al supermercado más barato **dentro del subconjunto elegido**), y se para ahí — es el primer `k` con solución, luego el mínimo posible. Fuerza bruta sobre combinaciones (`C(|U|, k)`), asumible sin optimizar a esta escala (uso personal, no una escala de datos donde `|U|` pase de una decena) — mismo criterio de "no hace falta más a este tamaño de datos" que el resto del proyecto (p. ej. `ProductsService.getPrices`, sin joins SQL).

## 5. Frontend — páginas y rutas

- `frontend/src/api/shopping-lists.ts`: cliente para los 7 endpoints de §2 (mismo estilo que `api/groceries.ts`).
- `frontend/src/pages/ShoppingListsPage.tsx` — ruta `/tickets/cesta`: listado de listas (nombre, nº de productos), crear una nueva, borrar. Enlaza a la de detalle.
- `frontend/src/pages/ShoppingListDetailPage.tsx` — ruta `/tickets/cesta/:id`: renombrar la lista, añadir productos (buscador reutilizando `searchProducts`, igual que `ProductsPage`, excluyendo los ya presentes en la lista), quitar productos, y botón "Generar" que llama `Promise.all` de `getProductPrices` para cada item y pinta el resultado de `computeBasketSimulation` (cuatro bloques: más barato, más caro, mixta más barata, mixta con menos súpers — cada uno con su desglose por producto; aviso si hay `missingProducts` o si `cheapestSingle` es `null`).
- Nueva entrada de navegación en `AppLayout.tsx`, dentro de "Tickets de supermercado": `{ to: '/tickets/cesta', end: false, label: 'Cesta de la compra', icon: '🛒' }`.
- Rutas nuevas en `App.tsx`: `/tickets/cesta` y `/tickets/cesta/:id`, mismo patrón protegido que el resto de `/tickets/*`.

## 6. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
