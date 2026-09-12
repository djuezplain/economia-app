# Plan 035 — Editar y borrar tickets ya guardados

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H3)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Endpoints — en `GroceriesController` (`/receipts`), no en `receipt-import`

`spec 034 plan.md §12` separaba `ReceiptImportModule` (escritura, flujo preview/confirm) de `GroceriesModule` (solo consulta) porque la importación es un flujo de varios pasos distinto de un CRUD simple. Editar/borrar un ticket ya guardado **sí** es CRUD simple sobre el recurso `/receipts/:id` — mismo criterio que `StocksController` (spec 020), que tiene `GET`/`POST`/`PATCH`/`DELETE` juntos en un mismo controller. Se añaden aquí, no se reabre `ReceiptImportModule`:

| Método y ruta | Guard | Descripción |
|---|---|---|
| `PUT /receipts/:id` | `AuthGuard`, `RequireActiveUserGuard` | H2-H3. Reemplaza fecha/supermercado/total y **todas** las líneas del ticket. |
| `DELETE /receipts/:id` | ídem | H1. Borra el ticket (cascada a sus líneas, ya `onDelete: 'cascade'` desde spec 034). |

`PUT`, no `PATCH`: el cliente manda el estado completo del ticket (igual que la propia pantalla de edición, que carga todo el ticket y lo reenvía entero) — no hay edición parcial de un subconjunto de campos.

**Reutiliza `ConfirmReceiptDto` tal cual** (`receipt-import/dto/confirm-receipt.dto.ts`) como cuerpo del `PUT` — misma forma exacta (`supermarket: EntityRefDto`, `date`, `printedTotal?`, `lines: ConfirmReceiptLineDto[]`) que ya usa `POST /receipt-import/confirm`. No se crea un DTO nuevo.

## 2. Reutilización del emparejamiento de supermercado/producto

El método privado `resolveRef` de `ReceiptImportService` (crea si `{ name }`, verifica pertenencia si `{ id }`, mismo criterio que spec 034 plan.md §8) se extrae a una función exportada, `resolveEntityRef`, en `receipt-import/resolve-entity-ref.util.ts` — la usan tanto `ReceiptImportService.confirm()` como el nuevo `ReceiptsService.update()`, sin duplicar la lógica ni depender un módulo del otro (se importa la función, no el módulo).

## 3. `ReceiptsService.update()` — todo o nada

Dentro de un único `db.transaction()`:

1. Verifica que el ticket pertenece al usuario (404 si no, mismo criterio que `getById`).
2. Resuelve `supermarketId` (`resolveEntityRef`, H2 criterio 2).
3. `UPDATE receipts` (`date`, `supermarketId`, `printedTotal`) — H2 criterio 1 y 3.
4. Borra **todas** las líneas existentes del ticket (`DELETE FROM receipt_lines WHERE receipt_id = ...`) e inserta las del DTO desde cero, resolviendo el producto de cada una (`resolveEntityRef`) — H3 criterio 1-3. Más simple y sin casos límite de "¿qué línea es cuál" que hacer un diff línea a línea; el volumen de líneas de un ticket (decenas, no miles) hace irrelevante el coste de borrar+reinsertar.
5. Cualquier error revierte toda la transacción — mismo patrón que `confirm()`.

H3 criterio 4 (la comparativa de precios refleja el cambio al momento) no necesita nada especial: `ProductsService.getPrices()` (spec 034) ya lee `receiptLines` en el momento de la consulta, sin caché.

## 4. `ReceiptsService.remove()`

Verifica que el ticket pertenece al usuario (404 si no) y borra la fila de `receipts` — la cascada ya existente (`receipt_lines.receipt_id → receipts.id ON DELETE CASCADE`, spec 034) se lleva las líneas. Sin transacción explícita: es un único `DELETE`.

## 5. Frontend — reutiliza el editor de líneas de `ReceiptImportPage`

`ReceiptImportPage.tsx` ya tiene toda la UI de líneas editables (tabla con descripción/cantidad/unidad/precio/producto, añadir/eliminar línea, selects de supermercado/producto con opción "nuevo") — se extrae a un componente compartido en vez de duplicar ~150 líneas de JSX:

- **`ReceiptFieldsEditor.tsx`** (nuevo, `frontend/src/components/`): recibe y devuelve el estado editable (supermercado, fecha, total, líneas) vía props controladas — sin conocer si el resultado se va a mandar a `confirm` o a `update`. Lo usan tanto `ReceiptImportPage` (tras el preview) como la nueva pantalla de edición.
- **`ReceiptDetailPage.tsx`** (existente, spec 034 H5): gana un botón "Editar" que activa el mismo editor precargado con los datos actuales del ticket (`GET /receipts/:id` ya trae todo lo necesario), y un botón "Borrar ticket" con confirmación explícita (H1 criterio 2) — mismo patrón `useState` de confirmación en dos pasos que ya usa `AppLayout` para cerrar sesión con cambios sin sincronizar.
- `frontend/src/api/groceries.ts`: `updateReceipt(id, payload)` (`PUT`) y `deleteReceipt(id)` (`DELETE`).

## 6. Casos límite a cubrir con tests

- Editar un ticket de otro usuario → 404, nada cambia.
- Borrar un ticket de otro usuario → 404, nada se borra.
- `update()` con un producto/supermercado `{ id }` que pertenece a otro usuario → 404, transacción revertida (ninguna línea a medias).
- Borrar un ticket no afecta a los productos/supermercado que usaba (siguen existiendo, spec.md H1 criterio 3) ni a otros tickets que también usen ese mismo producto.
- `update()` que sustituye todas las líneas por otras completamente distintas — las líneas viejas desaparecen, solo quedan las nuevas.
- Aislamiento: `resolveEntityRef` solo encuentra supermercados/productos del propio usuario (ya cubierto por spec 034, se reutiliza sin cambios).

## 7. Fuera de este plan

Igual que `spec.md` §2: sin auditoría de ediciones, sin deshacer borrado, sin fusionar tickets, sin editar productos/supermercados directamente.

---
**Siguiente paso:** revisar este plan con Diego y aprobarlo. Al aprobarlo, se genera `tasks.md`.
