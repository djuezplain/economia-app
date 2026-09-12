# Tasks — Spec 035 (Editar y borrar tickets ya guardados)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — Extraer `resolveRef` de `ReceiptImportService` a `receipt-import/resolve-entity-ref.util.ts` (función exportada `resolveEntityRef`, plan.md §2). `ReceiptImportService.confirm()` pasa a importarla — sin cambio de comportamiento, los tests de `receipt-import.e2e-spec.ts` (spec 034) deben seguir en verde tal cual.
- **T1.2** — `ReceiptsService.update(userId, id, dto: ConfirmReceiptDto)` (plan.md §3) y `ReceiptsService.remove(userId, id)` (plan.md §4). `PUT /receipts/:id` y `DELETE /receipts/:id` en `ReceiptsController` (plan.md §1).
  Tests e2e (`test/groceries.e2e-spec.ts`, ampliar el `describe` de `/receipts`): actualizar fecha/supermercado/total; sustituir todas las líneas por otras (las viejas desaparecen); borrar un ticket borra sus líneas (cascada) sin tocar productos/supermercado ni otros tickets del mismo producto; 404 al editar/borrar un ticket de otro usuario, nada cambia; 404 si una línea referencia un producto de otro usuario, transacción revertida; `GET /products/:id/prices` refleja un precio corregido por `update()` sin ninguna acción aparte (H3 criterio 4).

## Grupo 2 — Frontend

- **T2.1** — Extraer de `ReceiptImportPage.tsx` el editor de campos+líneas a `components/ReceiptFieldsEditor.tsx` (props controladas: supermercado, fecha, total, líneas, listas de supermercados/productos existentes; sin conocer si el resultado va a `confirm` o `update`, plan.md §5). `ReceiptImportPage` pasa a usarlo — sus tests existentes (`ReceiptImportPage.test.tsx`, spec 034) deben seguir en verde tal cual, sin cambiar aserciones.
- **T2.2** — `api/groceries.ts`: `updateReceipt(id, payload)`, `deleteReceipt(id)`.
- **T2.3** — `ReceiptDetailPage.tsx`: botón "Editar" que activa `ReceiptFieldsEditor` precargado con `GET /receipts/:id`, guarda con `PUT`; botón "Borrar ticket" con confirmación en dos pasos (plan.md §5) → `DELETE`, tras borrar vuelve a `/tickets`.
  Tests: editar un campo y guardar llama a `updateReceipt` con el payload correcto; borrar pide confirmación antes de llamar a `deleteReceipt`; cancelar la confirmación no borra nada.

## Grupo 3 — Cierre

- **T3.1** — Repasar `spec.md` H1-H3 historia por historia, checklist de cierre igual que specs anteriores.
- **T3.2** — `npm run lint`, `tsc -b` (frontend), `npm test`/`npm run test:e2e` (backend) en verde. Verificación manual contra los servidores de desarrollo reales: editar un ticket real (cambiar una línea y el total), borrar otro, y comprobar en `/tickets/productos` que la comparativa de precios refleja el cambio sin recargar nada aparte.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 035 (T3.1)

### H1 — Borrar un ticket ya guardado

- [x] Criterio 1 (borra también las líneas): `test/groceries.e2e-spec.ts` — "borra el ticket y sus líneas, sin tocar el producto ni el supermercado".
- [x] Criterio 2 (confirmación explícita): `ReceiptDetailPage.test.tsx` — "borrar pide confirmación antes de llamar a deleteReceipt", "cancelar la confirmación de borrado no borra nada".
- [x] Criterio 3 (no borra productos/supermercado, ni afecta a otros tickets del mismo producto): mismo test e2e de criterio 1 (productos/supermercado sobreviven) + "no afecta a otro ticket que use el mismo producto".

### H2 — Editar los datos generales de un ticket

- [x] Criterio 1 (fecha): `test/groceries.e2e-spec.ts` — "actualiza fecha, supermercado y total...".
- [x] Criterio 2 (supermercado existente o nuevo): mismo test (cambia a un supermercado existente); el caso "nuevo" reutiliza `resolveEntityRef`, ya cubierto en spec 034.
- [x] Criterio 3 (total impreso): mismo test.

### H3 — Editar las líneas de un ticket ya guardado

- [x] Criterio 1 (cada campo editable): `ReceiptDetailPage.test.tsx` — "editar, cambiar un campo y guardar llama a updateReceipt con el payload correcto"; `ReceiptFieldsEditor` es el mismo componente ya testeado en `ReceiptImportPage.test.tsx` (spec 034 H2).
- [x] Criterio 2 (borrar/añadir línea): cubierto a nivel de componente por los tests ya existentes de `ReceiptImportPage.test.tsx` (mismo `ReceiptFieldsEditor`); a nivel de API, `test/groceries.e2e-spec.ts` — "actualiza fecha, supermercado y total... sustituye todas las líneas por otras".
- [x] Criterio 3 (emparejar con producto existente o crear nuevo): mismo test e2e (línea nueva con `product: { name: 'Agua' }`).
- [x] Criterio 4 (la comparativa de precios refleja el cambio de inmediato): `test/groceries.e2e-spec.ts` — "el precio corregido se refleja de inmediato en la comparativa de precios (H3 criterio 4)".

### Aislamiento de datos

- [x] `PUT`/`DELETE /receipts/:id` de otro usuario → 404, nada cambia/se borra: 2 tests dedicados en `test/groceries.e2e-spec.ts`.
- [x] Línea con un producto de otro usuario en `PUT` → 404, transacción revertida (0 líneas escritas): "un producto de otro usuario en una línea responde 404 y no deja la transacción a medias".

### Resultado del cierre

Todos los criterios de H1-H3 quedan cubiertos por al menos un test automático. Sin huecos encontrados en este repaso.

### T3.2 — Verificación final

Backend: `npm run build`/`lint` en verde; 232 unitarios + 573 e2e en verde (`--no-file-parallelism`). Frontend: `tsc -b`/lint en verde (sin warnings nuevos tras separar `receipt-line.types.ts` de `ReceiptFieldsEditor.tsx` para no romper Fast Refresh); 541/543 tests en verde — los 2 fallos son los mismos pre-existentes y no relacionados ya documentados en el cierre de spec 034 (`WealthPage.test.tsx`, fecha-dependiente).

Con esto, **spec 035 queda cerrada**.
