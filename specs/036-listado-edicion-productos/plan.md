# Plan 036 — Listado y edición de productos

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1-H3)

## 1. Endpoints — `ProductsController` (`/products`)

| Método y ruta | Descripción |
|---|---|
| `GET /products/:id` | H2. Ficha básica del producto (`id`, `name`). 404 si no existe o no es del usuario. |
| `PATCH /products/:id` | H3. `{ name: string }`. 404 si no existe; 409 si el nombre normalizado coincide con otro producto del usuario (H3 criterio 2). |

`GET /products?search=` y `GET /products/:id/prices` ya existen (spec 034), sin cambios.

## 2. `ProductsService`

- `getById(userId, id)`: mismo criterio de aislamiento que `getPrices` ya existente.
- `update(userId, id, name)`: verifica propiedad (404), comprueba duplicado por `normalizeText` contra el resto de productos del usuario (excluyendo el propio, 409 si coincide — mismo criterio de bloqueo, no fusión, que spec 034 §3), `UPDATE products SET name = ...`.

`UpdateProductDto { name: string }` — `@IsString() @Length(1, 150)` (mismo límite que la columna `varchar(150)`).

## 3. Frontend

- **`ProductsPage.tsx`** (`/tickets/productos`, sustituye a `ProductPricesPage.tsx`): buscador (igual que antes) + listado de resultados como enlaces a `/tickets/productos/:id` en vez de mostrar el resultado en la misma pantalla.
- **`ProductDetailPage.tsx`** (nuevo, `/tickets/productos/:id`): `GET /products/:id` + `GET /products/:id/prices`. Nombre en un campo editable con botón "Guardar" (`PATCH`); tabla de precios debajo (misma tabla que tenía `ProductPricesPage`, sin cambios de criterio).
- `api/groceries.ts`: `getProduct(id)`, `updateProduct(id, name)`.
- Nav (`AppLayout.tsx`): la entrada "Comparar precios" pasa a llamarse "Productos" (ahora es un listado con detalle, no solo una búsqueda de comparativa) — misma ruta `/tickets/productos`.

## 4. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
