# Tasks 003 — Importación del histórico desde el Excel "2026"

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 1 — Parseo, mapeo y validación (funciones puras)

- [x] **T1.1** — Backend: lectura del workbook (`exceljs` — ver desviación documentada en `plan.md` §2: `xlsx`/SheetJS sustituido por vulnerabilidades HIGH sin parche en npm) + funciones puras de mapeo y validación (`plan.md` §4-§6): `parseExcelWorkbook`, `normalizeCategoryName` (+ `CATEGORY_ALIASES`), `mapPaymentMethod`, `validateIncomeRow`/`validateExpenseRow`. Añadido también `export type PaymentMethod` en `db/schema/transactions.schema.ts` (alias reutilizable del enum, evita repetir la unión literal una cuarta vez).
  *Verificación:* `backend/src/import/import.parsing.spec.ts` — 40 tests con workbooks `.xlsx` sintéticos construidos en el propio test (nunca el fichero real de Diego — `plan.md` §9): hoja sin el nombre esperado → `InvalidWorkbookError` claro; fila con importe en texto (`"0.89"`) se convierte; importe 0 o negativo → inválida; fila con varios campos clave vacíos a la vez → inválida con un único motivo que los lista todos ("faltan tipo de pago, categoría y concepto"); categoría con espacios sobrantes se normaliza igual que sin ellos; `Acciones` se resuelve al alias `Acciones (venta)`; fila totalmente vacía se ignora sin contar como inválida ni válida (y se distingue de una fila con algún dato pero sin fecha, que si se conserva para validarse); tipo de pago fuera de la tabla fija → inválida sin crear nada nuevo. `npm run lint`, `npm run build` y `npm run test` (72 tests, todo el backend) en verde.

## Grupo 2 — Endpoints

*Nota sobre la regla "una tarea = un commit":* T2.1 y T2.2 se implementan y commitean juntos, en un único commit — no por comodidad, sino porque `plan.md` §3 pide explícitamente que ambos endpoints reutilicen "exactamente las mismas funciones, no una copia" (`ImportService.classify`/`parseOrThrow`); partir el commit habría significado dejar `confirm()` a medias en el primero o duplicar temporalmente esa lógica compartida, ambas peores que un commit conjunto y honesto sobre por qué. Se documenta aquí en vez de partir el commit en silencio.

- [x] **T2.1** — Backend: `POST /import/excel/preview` (`ImportController`/`ImportService`, `@UseGuards(AuthGuard, RequireActiveUserGuard)`) — sube el fichero, aplica T1.1 contra las categorías ya existentes del usuario, devuelve filas válidas/inválidas y qué categorías nuevas haría falta crear. No escribe nada en la base de datos.
  *Verificación:* `test/import.e2e-spec.ts` con ficheros sintéticos — devuelve el resumen esperado sin crear ninguna fila en `categories` ni `transactions`; fichero sin las hojas esperadas → 400; cuenta `PENDING_VERIFICATION` → 403; sin autenticar → 401. Añadido también `normalizedCategoryMap` a `import.parsing.ts` (pura, con test unitario) para indexar las categorías existentes por nombre normalizado.
- [x] **T2.2** — Backend: `POST /import/excel/confirm` — repite el parseo/validación de T1.1 dentro de una `db.transaction()`: crea las categorías que falten (una sola vez cada una) y despúes inserta los movimientos válidos. Devuelve el resumen final (importados/descartados con motivo).
  *Verificación:* e2e — importa correctamente ingresos y gastos válidos; crea las categorías nuevas necesarias sin duplicar las ya existentes (incluido el alias `Acciones` → `Acciones (venta)`); las filas inválidas no se importan y aparecen en el resumen con su motivo; confirmar dos veces con el mismo fichero no duplica las categorías nuevas (sí duplica los movimientos — comportamiento esperado y documentado, `spec.md` §3); todo lo creado pertenece al usuario autenticado (aislamiento); cuenta `PENDING_VERIFICATION` → 403. `npm run lint`, `npm run build`, `npm run test` (74) y `npm run test:e2e` (133, todo el backend) en verde.
  *Desviación menor, documentada:* `backend/tsconfig.json` tenía `"types": ["vitest/globals", "node"]` explícito (spec 002), lo que excluye la inclusión automática de ambient types de otros paquetes — sin añadir `"multer"` a esa lista, `@types/multer` no amplía `Express.Multer.File` y `ImportController` no compila. Se añade `"multer"`; no cambia ningún comportamiento existente.

## Grupo 3 — Frontend

- [x] **T3.1** — Frontend: página de importación (`/import`, enlazada desde `HomePage`) — seleccionar fichero, validar (vista previa con categorías nuevas y filas inválidas), confirmar (mismo fichero ya seleccionado, sin volver a pedirlo), resultado final con enlaces a `/movements` y `/dashboard`.
  *Verificación:* `ImportPage.test.tsx` (8 tests con Testing Library): sin sesión no llama a la API; botón "Validar" deshabilitado sin fichero; vista previa muestra el resumen, las categorías nuevas y las filas con problemas sin haber llamado a confirmar; sin problemas no se muestran esas secciones; un 400 del backend (hoja no encontrada) se muestra tal cual; confirmar reutiliza el mismo `File` ya seleccionado (sin volver a pedirlo) y muestra el resultado final con enlaces a `/movements`/`/dashboard`; un fallo al confirmar mantiene la vista previa para reintentar; elegir un fichero nuevo descarta la vista previa anterior. `npm run lint`, `npm run build` y `npm run test` (69, todo el frontend) en verde.
  *Desviación menor, documentada:* `api/client.ts` forzaba siempre `Content-Type: application/json` — con un `FormData` (subida de fichero) eso rompe el `multipart/form-data; boundary=...` que el navegador debe generar. Se añade `api.postForm` y se deja de forzar ese header cuando el cuerpo es `FormData`; no cambia ningún endpoint JSON existente.

## Grupo 4 — Cierre de la spec

- [ ] **T4.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1–H2) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que se hizo al cerrar las specs 001 y 002.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").
