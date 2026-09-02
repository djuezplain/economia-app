# Tasks 012 — Detección de duplicados al importar Excel

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 1 — Backend: número de fila en las filas válidas (`plan.md` §2)

- [ ] **T1.1** — `import.parsing.ts`: `ValidatedIncomeRow`/`ValidatedExpenseRow` añaden `rowNumber: number`, propagado desde `RawIncomeRow`/`RawExpenseRow` en la rama `valid: true` de `validateIncomeRow`/`validateExpenseRow` (hoy solo lo conservan las filas inválidas).
  *Verificación:* `import.parsing.spec.ts` ampliado — una fila válida devuelve el `rowNumber` correcto; no cambia ninguna validación existente (mismos tests de filas inválidas en verde, sin tocar).

## Grupo 2 — Backend: detección de duplicados (`plan.md` §3-4)

- [ ] **T2.1** — `ImportService.classify()` recibe `existingTransactions` (cargadas por `preview()`/`confirm()` igual que ya cargan `existingCategories`) y separa, de las filas válidas, cuáles coinciden con la clave de comparación de `plan.md` §3 (tipo + fecha + categoría ya resuelta + concepto + importe, y en gastos también comercio/forma de pago) contra el histórico del usuario. `ImportSideSummary` añade `duplicates: InvalidRow[]` (reutiliza el tipo tal cual, `reason` fijo "Fila N: ya existe un movimiento igual en tu histórico."); `ImportConfirmResult` añade `skippedDuplicateCount` por tipo. `confirm()` excluye las filas duplicadas del `INSERT`.

  Incluye actualizar el test de spec 003 que fijaba "confirmar dos veces con el mismo fichero... duplica los movimientos" como comportamiento esperado (`backend/test/import.e2e-spec.ts`) — esta spec invierte ese comportamiento a propósito, así que el mismo test pasa a fijar lo contrario en el mismo commit (dejarlo roto entre dos tareas no es una opción, constitution.md: "ninguna tarea se da por completada si rompe un test existente").

  *Verificación (e2e, ampliando `import.e2e-spec.ts`):* los 6 casos límite de `plan.md` §6 — reimportar el mismo fichero completo no duplica nada; categoría distinta con el resto igual no es duplicado; una fila con categoría nueva nunca se marca duplicada; ingreso vs. gasto con los mismos datos no son duplicados entre sí; histórico vacío no marca ningún duplicado; `validCount` no cambia de significado al añadir `duplicates`. Suite completa del backend (unitarios + e2e) en verde; lint y build limpios.

## Grupo 3 — Frontend (`plan.md` §5)

- [ ] **T3.1** — `frontend/src/api/import.ts`: `ImportPreviewResult`/`ImportConfirmResult` reflejan los campos nuevos del backend (`duplicates`, `skippedDuplicateCount`).
  *Verificación:* `npm run build` (comprueba en tipos que ningún consumidor existente rompe).
- [ ] **T3.2** — `ImportPage.tsx`: la vista previa añade una sección "Ya registrados" (reutiliza `InvalidRowsTable` con las filas de `duplicates`, sin componente nuevo) y amplía el recuento ya visible para distinguir nuevas de ya-registradas; el resultado de confirmación añade lo saltado por ya existir junto a lo importado/descartado.
  *Verificación:* `ImportPage.test.tsx` ampliado — vista previa con duplicados muestra la sección y el recuento correcto; confirmar con duplicados detectados no los reimporta y el resultado los refleja.

## Grupo 4 — Cierre de la spec

- [ ] **T4.1** — Checklist de cierre: repasar `spec.md` H1/H2 criterio a criterio, y los 6 casos límite de `plan.md` §6, contra la implementación real.
  *Verificación:* el propio checklist relleno al final de este fichero, con la suite completa (frontend + backend) en verde y build/lint limpios en ambos paquetes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca `[x]` aquí y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo, se para y se ajusta `plan.md` antes de seguir (no se parchea "en silencio").
