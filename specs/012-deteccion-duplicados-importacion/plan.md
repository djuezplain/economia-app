# Plan 012 — Detección de duplicados al importar Excel

**Basado en:** `specs/012-deteccion-duplicados-importacion/spec.md` (aprobada).

## 1. Dónde vive: `ImportService.classify` (`backend/src/import/import.service.ts`)

`classify()` ya separa filas válidas/inválidas y detecta categorías nuevas (spec 003). Se añade un tercer eje de clasificación en el mismo sitio: de las filas válidas, cuáles ya existen como movimiento. No se toca el parseo (`import.parsing.ts`) salvo un cambio menor de datos (§2).

`preview()` y `confirm()` ya cargan `existingCategories` antes de llamar a `classify()`; ambos pasan igual a cargar `existingTransactions` del usuario (`db.query.transactions.findMany({ where: eq(transactions.userId, userId) })`) y pasarlas a `classify()`.

## 2. Cambio menor necesario en `import.parsing.ts`: número de fila en las filas válidas

`ValidatedIncomeRow`/`ValidatedExpenseRow` no llevan `rowNumber` hoy (`RawIncomeRow`/`RawExpenseRow` sí lo tienen, pero `validateIncomeRow`/`validateExpenseRow` lo descartan en la rama de éxito — solo lo conservan en `InvalidRow`). Hace falta para poder señalar en la vista previa **qué fila** del Excel es cada duplicado (H2 criterio 1, mismo formato "Fila N" que ya usan los inválidos). Se añade `rowNumber: number` a ambas interfaces y se propaga en la rama `valid: true` de ambas funciones — no cambia ninguna validación existente, solo añade un campo.

## 3. Criterio de coincidencia (H1 criterio 1) — clave de comparación, no columna nueva en BD

Nada de constraint único en la tabla `transactions`: la detección es propia de la importación (spec.md §2, fuera de alcance para movimientos creados a mano), una restricción a nivel de base de datos afectaría a *todos* los `INSERT`, no solo a los del importador.

Se compara por una clave compuesta, calculada igual para una fila del Excel y para un movimiento ya guardado:

- **Ingreso:** `type + date + categoryId + concept + amount`
- **Gasto:** `type + date + categoryId + concept + amount + merchant + paymentMethod`

`categoryId` es el id **ya resuelto** (mismo mapa `incomeCategoryMap`/`expenseCategoryMap`, normalizado por nombre, que `classify()` ya usa para detectar categorías nuevas) — no el nombre de texto del Excel. Esto es importante: si una categoría se renombra después de una importación, sigue siendo el mismo `categoryId`, así que una reimportación posterior se sigue detectando correctamente aunque el nombre visible haya cambiado. Una fila cuya categoría **no existe todavía** (va a crearse, `missingCategories`) nunca puede ser duplicado — ningún movimiento previo puede referenciar una categoría que no existía — así que esas filas se descartan de la comparación sin más (optimización, no solo corrección).

`concept`/`merchant` se comparan tal cual los deja la validación de fila ya existente (sin normalizar mayúsculas/espacios de más allá de lo que `import.parsing.ts` ya hace) — coincidencia exacta literal, tal como decidió Diego (spec.md §3, decisión 1): el caso real a cubrir es reimportar el mismo fichero, que produce valores idénticos byte a byte.

Implementación: un `Set<string>` con la clave de cada movimiento existente del usuario (construido una vez por llamada a `classify`), y la misma función de clave aplicada a cada fila válida para mirar si ya está en el set — O(n) sobre el histórico del usuario, sin problema de rendimiento a la escala de una app personal.

## 4. Contrato de `ImportService`/`ImportController` — nuevos campos, ninguno se quita

```ts
export interface ImportSideSummary {
  validCount: number;              // sin cambio de significado (spec.md H2 criterio 2)
  invalid: InvalidRow[];           // sin cambio
  duplicates: InvalidRow[];        // nuevo — subconjunto de las válidas que ya existen
}

export interface ImportConfirmResult {
  income: { importedCount: number; invalid: InvalidRow[]; skippedDuplicateCount: number };
  expense: { importedCount: number; invalid: InvalidRow[]; skippedDuplicateCount: number };
  categoriesCreated: string[];
}
```

`duplicates` reutiliza el tipo `InvalidRow` (`{ rowNumber, reason }`) tal cual — mismo motivo por el que ya sirve para inválidas: la vista previa puede reutilizar el mismo componente de tabla (`InvalidRowsTable`, `frontend/src/pages/ImportPage.tsx`) sin crear uno nuevo, solo con otro título y otra fuente de filas. `reason` fijo: `"Fila N: ya existe un movimiento igual en tu histórico."`.

En `confirm()`, las filas marcadas como duplicado se excluyen de `incomeValues`/`expenseValues` antes del `INSERT` (H1 criterio 3) — el resto del método (creación de categorías nuevas, transacción de BD) no cambia.

## 5. Frontend (`frontend/src/pages/ImportPage.tsx`, `frontend/src/api/import.ts`)

- `ImportPreviewResult`/`ImportConfirmResult` (espejo en `api/import.ts`) reciben los mismos campos nuevos que el backend.
- Vista previa: una sección más, "Ya registrados" (mismo patrón visual que "con problemas"), usando `InvalidRowsTable` reutilizado con las filas de `duplicates`. El recuento ya en pantalla ("N válidos, M con problemas") se amplía para dejar claro cuántas de las válidas son nuevas y cuántas ya existen (H2 criterio 2) — p. ej. "N válidos (P nuevos, M ya registrados)".
- Resultado de confirmación: añade "Q saltados por ya existir" junto a lo que ya se muestra (importados/descartados).

## 6. Casos límite a cubrir con tests

1. Reimportar el mismo fichero completo dos veces seguidas → la segunda vez, 0 movimientos nuevos, todas las filas válidas se detectan como duplicado (el caso real que motivó esta spec).
2. Una fila con la fecha/importe/concepto exactos pero una categoría **distinta** de la del movimiento existente → no es duplicado, se importa (coincidencia exacta significa exacta en *todos* los campos, spec.md H1 criterio 1).
3. Una fila cuya categoría todavía no existe (se va a crear) → nunca se marca como duplicado, aunque el resto de campos coincidieran con algo (imposible en la práctica, pero la implementación no debe intentar comparar contra un `categoryId` que no existe aún).
4. Un ingreso y un gasto con fecha/concepto/importe iguales pero tipos distintos → no son duplicados entre sí (la clave incluye `type`).
5. Importar un fichero por primera vez (histórico vacío) → ningún duplicado, comportamiento idéntico a hoy.
6. `validCount` de la vista previa no cambia al añadir `duplicates` — sigue contando todas las filas válidas, duplicadas o no (H2 criterio 2, verificado explícitamente para no reintroducir sin querer el hueco que motivó esta spec en otra parte).

## 7. Fuera de este plan

Lo ya listado en `spec.md §2` (duplicados entre movimientos manuales, fusionar datos parecidos, forzar la importación de un duplicado, deshacer una importación).
