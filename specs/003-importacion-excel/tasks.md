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

- [x] **T4.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1–H2) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que se hizo al cerrar las specs 001 y 002.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero (ver sección "Checklist de cierre — spec 003" más abajo).
  *Hallazgos reales durante el repaso, encontrados y corregidos con test nuevo (no solo documentados):* al contrastar `spec.md` literalmente contra la implementación, igual que en el cierre de las specs 001 y 002, aparecieron 3 huecos de cobertura sobre comportamiento que ya era correcto pero no estaba probado explícitamente: (1) H1 criterio 2 pide que el mes/año se derive siempre de "Fecha", nunca de la columna "Mes" del Excel — la columna "Mes" ni siquiera se extrae (no está en `INCOME_COLS`/`EXPENSE_COLS`), así que el criterio se cumple por construcción, pero ningún test reproducía el caso real que motivó la regla (fecha 31/08 con "Mes" = "Septiembre"); añadido un test en `import.parsing.spec.ts` con ese caso exacto, para ambas hojas. (2) El test de `confirm` que comprobaba la creación de categorías nuevas nunca verificaba los valores reales de los movimientos insertados (fecha, importe, comercio, tipo de pago) más allá del conteo y el `categoryId`; ampliado con `toMatchObject` sobre transacciones concretas de ingreso y de gasto. (3) H1 criterio 3 ("ningún gasto importado lleva subcategoría") no tenía ninguna aserción explícita de que `subcategoryId` fuera siempre `null` en los gastos importados — añadida, tanto puntual como sobre el conjunto completo de gastos insertados en ese test. Los tests nuevos viven en `import.parsing.spec.ts` y `test/import.e2e-spec.ts`; ninguno cambia comportamiento, solo prueban código que ya era correcto.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").

---

## Checklist de cierre — spec 003 (T4.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático (se cita el fichero).

### H1 — Importar el histórico de ingresos y gastos desde el Excel

- [x] Criterio 1 (vista previa de válidas/inválidas antes de guardar nada): `test/import.e2e-spec.ts` — "devuelve el resumen esperado sin crear ninguna fila en categories ni transactions" (`POST /import/excel/preview`).
- [x] Criterio 2 (fila válida de "Ingresos" → ingreso real; mes/año siempre de "Fecha", nunca de "Mes"): `test/import.e2e-spec.ts` — "importa ingresos y gastos válidos..." comprueba fecha, categoría, concepto e importe del ingreso insertado (`toMatchObject`); `import.parsing.spec.ts` — "el mes/año se deriva siempre de 'Fecha', nunca de la columna 'Mes'" (añadido en este cierre, T4.1), con el caso real encontrado en el fichero de Diego (fecha 31/08, "Mes" = "Septiembre").
- [x] Criterio 3 (fila válida de "Gastos" → gasto real; ningún gasto lleva subcategoría): `test/import.e2e-spec.ts` — mismo test comprueba fecha, categoría, tipo de pago, comercio e importe del gasto insertado, `subcategoryId: null` explícito (añadido en este cierre) y una comprobación sobre el conjunto completo de gastos importados.
- [x] Criterio 4 (resumen final con importados/descartados y motivo): `test/import.e2e-spec.ts` — "las filas inválidas no se importan y aparecen en el resumen con su motivo" (`POST /import/excel/confirm`).

### H2 — Reconocer categorías y tipos de pago aunque no coincidan literalmente

- [x] Criterio 1 (coincidencia normalizada con una categoría existente → se asocia, sin duplicar): `test/import.e2e-spec.ts` — preview con categoría "Nómina" ya existente y valor del Excel "Nomina" (sin tilde) se cuenta como válida sin aparecer en `newCategories`; confirm con el alias `Acciones` → `Acciones (venta)` no crea una categoría "Acciones" en paralelo. `normalizeCategoryName`/`normalizedCategoryMap` con tests unitarios propios (`import.parsing.spec.ts`).
- [x] Criterio 2 (sin coincidencia → categoría nueva automática): `test/import.e2e-spec.ts` — "importa ingresos y gastos válidos, crea categorías nuevas..." (`Bancos`, `Peluqueria`) + preview equivalente.
- [x] Criterio 3 (tipo de pago fuera del catálogo cerrado → fila inválida, no crea nada nuevo): `import.parsing.spec.ts` — `mapPaymentMethod` devuelve `null` para un valor fuera de la tabla; `validateExpenseRow` con el motivo concreto ("Bizum"... "no está entre los admitidos").

### Aislamiento de datos (spec.md §3 / constitution.md §2)

- [x] Todo lo creado por una importación (categorías y movimientos) pertenece exclusivamente al usuario autenticado: `test/import.e2e-spec.ts` — "todo lo creado pertenece al usuario autenticado (aislamiento)", dedicado.
- [x] Sin vía de referenciar datos de otro usuario: el fichero subido nunca contiene un `userId` — `ImportController` solo usa `req.user.id` (mismo guard `AuthGuard`/`RequireActiveUserGuard` que categorías/movimientos); no hay ningún parámetro de la petición que identifique a otro usuario.
- [x] No idempotente, mitigado por la vista previa (no por detección de duplicados): `test/import.e2e-spec.ts` — "confirmar dos veces con el mismo fichero no duplica las categorías nuevas (sí duplica los movimientos)", comportamiento documentado y verificado tal cual.
- [x] Cuenta `PENDING_VERIFICATION` → 403 (mismo guard que el resto de rutas económicas): `test/import.e2e-spec.ts`, en ambos endpoints.

### Reglas de negocio concretas (spec.md §4)

- [x] Solo se procesan las hojas "Ingresos" y "Gastos": `import.parsing.spec.ts` — `parseExcelWorkbook` solo lee esas dos hojas por nombre; el resto del workbook (otras hojas) ni se toca.
- [x] Mes/año derivado siempre de "Fecha": ver H1 criterio 2 más arriba.
- [x] Importe aceptado como número o texto que representa un número: `import.parsing.spec.ts` — `parseAmount` con texto `"0.89"` + `parseExcelWorkbook` con una celda de importe en texto.
- [x] Importe ≤ 0 invalida la fila: `import.parsing.spec.ts` — `validateIncomeRow`/`validateExpenseRow`, importe 0 y negativo.
- [x] Fila con campos clave vacíos → inválida con motivo concreto: `import.parsing.spec.ts` — motivos combinados ("faltan categoría, concepto y importe") y singulares ("falta fecha"/"falta concepto").
- [x] Espacios sobrantes en categoría/tipo de pago recortados antes de comparar: `import.parsing.spec.ts` — `normalizeCategoryName('Comida ')` = `normalizeCategoryName('Comida')`; `mapPaymentMethod('  tarjeta  ')`.
- [x] Ningún gasto importado lleva subcategoría: ver H1 criterio 3 más arriba.
- [x] Columna "Tipo" significa cosas distintas según la hoja (categoría en Ingresos, tipo de pago en Gastos): por diseño de `INCOME_COLS`/`EXPENSE_COLS` — cada hoja mapea su columna "Tipo" a un campo distinto; los tests de cada hoja (`incomeRow`/`expenseRow` en `import.parsing.spec.ts`) ejercitan cada mapeo por separado.

### Decisiones (spec.md §6)

- [x] Decisión 3 (flujo en dos pasos, preview nunca escribe): ver H1 criterio 1.
- [x] Decisión 4 (filas inválidas no bloquean el resto de la importación): ver H1 criterio 4.

### Fuera de alcance (spec.md §5)

Fondos/bolsa/cashback, objetivos/comparativa interanual, detección de duplicados, edición de filas inválidas en el propio flujo, otros formatos de fichero, adaptación automática a otra estructura de columnas: ninguno tiene código en esta spec — ausencia deliberada, nada que verificar (mismo criterio que el cierre de la spec 002 con sus propios "fuera de alcance").

### Resultado del cierre

Todos los criterios de aceptación de H1 y H2 están cubiertos por al menos un test automático — a diferencia del cierre de la spec 002, este repaso no encontró ningún hueco real frente a `spec.md` que requiriera una decisión de Diego, solo 3 huecos de cobertura sobre comportamiento ya correcto (detallados en la nota de T4.1 más arriba), corregidos con tests nuevos durante el propio cierre. Suite completa en verde al cerrar el grupo 4: backend 75/75 unitarios + 133/133 e2e, frontend 69/69; lint y build limpios en ambos paquetes.

Con esto, **spec 003 queda cerrada por completo**.
