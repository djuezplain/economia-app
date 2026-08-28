# Tasks 004 — Objetivos de ahorro y presupuestos de gasto

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 1 — Modelo de datos y funciones puras de cálculo

- [x] **T1.1** — Backend: esquema Drizzle (`savings_goals`, `expense_budgets`, enums `goal_period`/`target_type` de `plan.md` §1) + migración.
  *Verificación:* `npx drizzle-kit generate` + `npx drizzle-kit migrate` aplican sin error contra Postgres (`economia_dev` y `economia_test`); las dos tablas nuevas aparecen junto a las de las specs 001-003 (`\dt`, `\d savings_goals`, `\d expense_budgets` verificados directamente en ambas bases: FKs, `onDelete cascade` en `expense_budgets.category_id` incluido). Lint y suite unitaria del backend en verde tras el cambio (75/75, sin afectar a ningún test existente).
- [x] **T1.2** — Backend: funciones puras de cálculo de progreso (`goals/goals-progress.calculations.ts` de `plan.md` §4): `resolveTargetAmount`, `computeDeviation`, `computeProgressPercent`, `resolveProgressStatus`, `projectAmount`. Añade también a `dashboard/dashboard.calculations.ts`: `daysInMonth` (extraída de `resolveDaysForMonth`), `resolveDaysForYear`/`daysInYear`, y exporta `currentMonthIso` (hoy privada en `dashboard.service.ts`, `dashboard.service.ts` actualizado para importarla en vez de declararla).
  *Verificación:* `goals-progress.calculations.spec.ts` (14 tests) — `resolveTargetAmount` con `AMOUNT`, con `PERCENT` e ingresos > 0, y con `PERCENT` e ingresos = 0 (`null`, sin dividir por cero); `computeProgressPercent`/`computeDeviation` con importe objetivo `null` (`null`, no error) y con `targetAmount` 0; `resolveProgressStatus` con los tres estados (por debajo, cerca, alcanzado/superado, incluidos los límites exactos del umbral y del 100%) y con `progressPercent: null`; `projectAmount` con días transcurridos > 0 y con 0 (`null`). `dashboard.calculations.spec.ts` ampliado (7 tests nuevos) — `currentMonthIso`, `daysInMonth` (incluido bisiesto), `daysInYear`/`resolveDaysForYear` con un año en curso (día 240 del año verificado sumando los días de cada mes anterior), el 1 de enero como día 1 (no 0), un año cerrado, y la regla gregoriana completa (2100 no bisiesto, 2000 sí). Suite completa del backend en verde: 97/97 unitarios + 133/133 e2e, lint y build limpios.

## Grupo 2 — CRUD de objetivos y presupuestos

- [x] **T2.1** — Backend: `GET/POST/PATCH/DELETE /savings-goals` (`SavingsGoalsService`/`SavingsGoalsController`, `@UseGuards(AuthGuard, RequireActiveUserGuard)`). Validación de rango (`targetValue`/`alertThresholdPercent` ≤ 100 en `PERCENT`/umbral) con `Decimal.js`, no floats nativos (constitución §2). `period` no es editable en `PATCH` (fijo desde la creación, `plan.md` §5).
  *Verificación (H1, e2e — `test/savings-goals.e2e-spec.ts`, 12 tests):* crear un objetivo mensual y uno anual a la vez (no chocan entre sí); crear un segundo objetivo con el mismo `period` → 409; `targetType: PERCENT` con `targetValue` > 100 → 400; `alertThresholdPercent` > 100 → 400; `targetValue` negativo → 400; editar `targetType`/`targetValue`/`alertThresholdPercent` (confirmado que `period` no cambia); borrar; aislamiento (un objetivo ajeno nunca aparece en `GET`, ni se puede editar/borrar — 404, sin borrar nada); cuenta `PENDING_VERIFICATION` → 403; sin autenticar → 401.
- [x] **T2.2** — Backend: `GET/POST/PATCH/DELETE /expense-budgets` (`ExpenseBudgetsService`/`ExpenseBudgetsController`, mismo guard). `categoryId` opcional (ausente = presupuesto global); validación de categoría (`assertValidExpenseCategory`) reutiliza el criterio de `TransactionsService`: ajena/inexistente → 404, tipo `INCOME` o subcategoría → 400.
  *Verificación (H2, e2e — `test/expense-budgets.e2e-spec.ts`, 17 tests):* crear un presupuesto global y uno de categoría a la vez; crear un segundo presupuesto global → 409; crear un segundo presupuesto para la misma categoría → 409; crear sobre una subcategoría → 400; crear sobre una categoría de tipo `INCOME` → 400; crear sobre una categoría ajena → 404; crear sobre una categoría inexistente → 404; `targetType: PERCENT` con `targetValue` > 100 → 400; `alertThresholdPercent` > 100 → 400; editar; borrar; borrar la categoría de un presupuesto borra el presupuesto en cascada (`onDelete: 'cascade'` en `expense_budgets.category_id`, a diferencia de un movimiento, que sigue bloqueando el borrado de su categoría — `restrict`, spec 002); aislamiento; cuenta `PENDING_VERIFICATION` → 403; sin autenticar → 401.
  *Suite completa del backend en verde tras el grupo:* lint y build limpios; 97/97 tests unitarios; 162/162 tests e2e (17 ficheros, incluidos los 29 nuevos de este grupo).

## Grupo 3 — Progreso real (H3/H4)

- [ ] **T3.1** — Backend: `DashboardModule` exporta `DashboardService` (`plan.md` §3); `GET /goals-progress/month` y `GET /goals-progress/year` (`GoalsProgressService`/`GoalsProgressController`), combinando los objetivos/presupuestos del usuario con `DashboardService.month()`/`.year()` y las funciones puras de T1.2.
  *Verificación (H3/H4, e2e):* progreso de un objetivo mensual con datos reales (importe objetivo, real, desviación, %, proyección de fin de mes calculada por extrapolación); mismo objetivo en un mes ya cerrado → sin proyección (`null` explícito); progreso de los presupuestos (global + por categoría) para el mes indicado, incluida una categoría sin gasto todavía ese mes (`actualAmount: "0.00"`); objetivo/presupuesto `PERCENT` con ingresos = 0 en el periodo → `targetAmount`/`progressPercent` `null`, sin dividir por cero; estados de aviso con distintos umbrales (por debajo, cerca, alcanzado/superado); progreso del objetivo anual, con y sin proyección según si el año consultado es el actual; sin ningún objetivo/presupuesto definido → listas vacías, no error; aislamiento (nunca incluye datos de otro usuario); cuenta `PENDING_VERIFICATION` → 403; sin autenticar → 401.

## Grupo 4 — Frontend

- [ ] **T4.1** — Frontend: página `/goals` (enlazada desde `HomePage`) — objetivo de ahorro (crear/editar mensual y anual, progreso del periodo en curso con selector de mes/año) y presupuestos de gasto (global + por categoría: crear, editar, borrar, progreso del mes en curso).
  *Verificación:* tests con Testing Library + lint/build en verde en ambos paquetes.

## Grupo 5 — Cierre de la spec

- [ ] **T5.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1–H4) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que se hizo al cerrar las specs 001-003.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").
