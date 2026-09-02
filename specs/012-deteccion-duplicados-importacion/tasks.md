# Tasks 012 — Detección de duplicados al importar Excel

**Estado:** Implementación completa (T1.1-T4.1)
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 1 — Backend: número de fila en las filas válidas (`plan.md` §2)

- [x] **T1.1** — `import.parsing.ts`: `ValidatedIncomeRow`/`ValidatedExpenseRow` añaden `rowNumber: number`, propagado desde `RawIncomeRow`/`RawExpenseRow` en la rama `valid: true` de `validateIncomeRow`/`validateExpenseRow` (hoy solo lo conservan las filas inválidas).
  *Verificación:* `import.parsing.spec.ts` ampliado — una fila válida devuelve el `rowNumber` correcto; no cambia ninguna validación existente. ✅ 45/45 tests del fichero, build y lint limpios.

## Grupo 2 — Backend: detección de duplicados (`plan.md` §3-4)

- [x] **T2.1** — `ImportService.classify()` recibe `existingTransactions` (cargadas por `preview()`/`confirm()` igual que ya cargan `existingCategories`) y separa, de las filas válidas, cuáles coinciden con la clave de comparación de `plan.md` §3 (tipo + fecha + categoría ya resuelta + concepto + importe, y en gastos también comercio/forma de pago) contra el histórico del usuario. `ImportSideSummary` añade `duplicates: InvalidRow[]` (reutiliza el tipo tal cual, `reason` fijo "Fila N: ya existe un movimiento igual en tu histórico."); `ImportConfirmResult` añade `skippedDuplicateCount` por tipo. `confirm()` excluye las filas duplicadas del `INSERT`.

  Incluye actualizar el test de spec 003 que fijaba "confirmar dos veces con el mismo fichero... duplica los movimientos" como comportamiento esperado (`backend/test/import.e2e-spec.ts`) — esta spec invierte ese comportamiento a propósito, así que el mismo test pasa a fijar lo contrario en el mismo commit.

  *Verificación (e2e, ampliando `import.e2e-spec.ts`):* los 6 casos límite de `plan.md` §6. ✅ Suite completa del backend: 99/99 unitarios + 195/195 e2e (sin paralelismo de ficheros, limitación preexistente del entorno local); lint y build limpios.

## Grupo 3 — Frontend (`plan.md` §5)

- [x] **T3.1** — `frontend/src/api/import.ts`: `ImportPreviewResult`/`ImportConfirmResult` reflejan los campos nuevos del backend (`duplicates`, `skippedDuplicateCount`).
  *Verificación:* `npm run build` sin errores de tipos. ✅
- [x] **T3.2** — `ImportPage.tsx`: la vista previa añade "Ingresos/Gastos ya registrados" (reutiliza `InvalidRowsTable` con las filas de `duplicates`, sin componente nuevo) y amplía el recuento ya visible para distinguir nuevas de ya-registradas; el resultado de confirmación añade lo saltado por ya existir junto a lo importado/descartado.
  *Verificación:* `ImportPage.test.tsx` ampliado — vista previa con duplicados muestra la sección y el recuento correcto; confirmar con duplicados detectados refleja lo saltado. ✅ Suite completa del frontend: 263/263 (33 ficheros) en verde sin paralelismo; lint y build limpios.

## Grupo 4 — Cierre de la spec

- [x] **T4.1** — Checklist de cierre: repasar `spec.md` H1/H2 criterio a criterio, y los 6 casos límite de `plan.md` §6, contra la implementación real.
  *Verificación:* checklist relleno abajo. Suite completa (backend 99/99 + 195/195 e2e; frontend 263/263) en verde; lint y build limpios en ambos paquetes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca `[x]` aquí y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo, se para y se ajusta `plan.md` antes de seguir (no se parchea "en silencio").

---

## Checklist de cierre — spec 012 (T4.1)

### H1 — No duplicar movimientos que ya existen al reimportar

- [x] Criterio 1 (coincidencia exacta en fecha/categoría/concepto/importe, y en gastos comercio/forma de pago): `import.e2e-spec.ts` — "una fila con los mismos datos pero otra categoría no se detecta como duplicado".
- [x] Criterio 2 (comparación contra todo el histórico, no solo fechas cercanas): garantizado por construcción — `classify()` recibe `existingTransactions` sin ningún filtro de fecha, el `Set` de claves cubre el histórico completo del usuario.
- [x] Criterio 3 (las filas duplicadas no se insertan al confirmar, sin marcar nada): `import.e2e-spec.ts` — "confirmar dos veces con el mismo fichero no duplica ni las categorías nuevas ni los movimientos".
- [x] Criterio 4 (el resultado de confirmar indica cuántas se saltaron): mismo test — `skippedDuplicateCount` comprobado en ambas confirmaciones; `ImportPage.test.tsx` — "el resultado de confirmar indica cuántas filas se saltaron por ya existir".

### H2 — Ver antes de confirmar cuántas filas ya existen

- [x] Criterio 1 (la vista previa muestra el recuento de ya existentes, por separado, para ingresos y gastos): `import.e2e-spec.ts` — "señala en la vista previa las filas que ya existen..."; `ImportPage.test.tsx` — "con filas ya registradas, la vista previa las muestra aparte...".
- [x] Criterio 2 (`validCount` no cambia de significado): mismo test e2e, comprobado explícitamente (`validCount` se mantiene en 2 con 1 de esas 2 marcada como duplicado); `plan.md §6` caso límite 6.

### Casos límite de `plan.md §6`

1. [x] Reimportar el mismo fichero completo dos veces → 0 movimientos nuevos la segunda vez: `import.e2e-spec.ts`.
2. [x] Categoría distinta, resto igual → no es duplicado: `import.e2e-spec.ts`.
3. [x] Categoría nueva → nunca duplicado: `import.e2e-spec.ts` — "una fila cuya categoría todavía no existe nunca se marca como duplicado".
4. [x] Ingreso vs. gasto con los mismos datos → no son duplicados entre sí: `import.e2e-spec.ts` — "un ingreso y un gasto con los mismos datos no se consideran duplicados entre sí".
5. [x] Histórico vacío → ningún duplicado: `import.e2e-spec.ts`, comprobado en el test de primera importación y en el de vista previa sin histórico previo.
6. [x] `validCount` no cambia de significado: comprobado explícitamente en el test de vista previa con duplicados.

Con esto termina la implementación de spec 012 (T1.1-T4.1, fase 4 de 4).
