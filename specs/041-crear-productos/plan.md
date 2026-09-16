# Plan 041 — Crear productos desde el listado

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1)

## 1. Backend — `POST /products` (nuevo)

`ProductsService` gana `create(userId, name)`, con el **mismo criterio de duplicados que `update()`** (nombre normalizado, `normalizeText`) — se extrae a un helper privado `assertNoDuplicateName(userId, name, excludeId?)` compartido entre `create()` y `update()`, en vez de duplicar la comprobación. 409 (`ConflictException`) simple si ya existe — a diferencia del 409 de `update()` (spec 038 H2), **sin** `duplicateProductId` en el cuerpo: no hay nada que "fusionar" con un producto que nunca ha llegado a crearse.

`ProductsController` gana `@Post() create(@Body() dto: CreateProductDto, ...)` — `CreateProductDto` igual que `UpdateProductDto` (nombre, `Length(1, 150)`).

## 2. Backend — el precio inicial reutiliza `POST /receipt-import/confirm` tal cual

`ReceiptImportService.confirm()` (spec 034) ya crea una `receipt` + sus `receiptLines` a partir de datos ya estructurados (sin depender de `preview()` ni de OCR) — es exactamente un "crear ticket manualmente". **Sin cambios en este endpoint**: el frontend lo llama con `product: { id: <producto recién creado> }` en la línea, para que el ticket sintético (spec.md, decisión de fondo) quede exactamente igual que uno real.

## 3. Frontend — flujo de creación en dos llamadas

`frontend/src/api/groceries.ts`: `createProduct(name: string): Promise<Product>` → `POST /products`.

`ProductsPage.tsx` gana un formulario "Crear producto":
- Campo nombre (obligatorio).
- Sección opcional de precio inicial (criterio 5: todo o nada) — mismo patrón de selector de supermercado que `ReceiptFieldsEditor` (`<select>` + "+ Nuevo supermercado" con `NEW_OPTION_VALUE`, campo de texto si se elige nuevo), fecha (`input type="date"`), unidad (`unidad`/`kg`) y precio por unidad.
- Al enviar: `createProduct(name)`; si hay precio relleno, a continuación `confirmReceiptImport({ supermarket, date, lines: [{ description: name, quantity: '1', unit, pricePerUnit, amount: pricePerUnit, product: { id: created.id } }] })` — `quantity` fija a `'1'` y `amount = pricePerUnit` (criterio 1: es un precio de referencia por unidad, no una compra con cantidad real; spec.md §2 ya deja fuera cantidades reales, mismo criterio que el simulador de cesta, spec 039).
- Errores por separado (criterio 6): si `createProduct` falla (409 duplicado u otro), no se llama a `confirmReceiptImport`. Si `createProduct` tiene éxito pero `confirmReceiptImport` falla, se añade el producto ya creado al listado igualmente y se muestra un aviso distinto ("el producto se creó, pero no se ha podido guardar el precio inicial: …").
- Tras crear con éxito, el producto nuevo se añade al estado local del listado (sin recargar, criterio 3) — mismo patrón que `ShoppingListsPage.handleCreate` (spec 039).

## 4. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
