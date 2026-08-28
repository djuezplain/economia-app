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

- [x] **T3.1** — Backend: `DashboardModule` exporta `DashboardService` (`plan.md` §3); `GET /goals-progress/month` y `GET /goals-progress/year` (`GoalsProgressService`/`GoalsProgressController`), combinando los objetivos/presupuestos del usuario con `DashboardService.month()`/`.year()` y las funciones puras de T1.2. `GoalsModule` pasa a importar `DashboardModule`.
  *Autocorrección durante la implementación (no una deviación del plan — `plan.md` §6 ya especificaba el criterio correcto):* mi primer borrador de `GoalsProgressService` solo suprimía `projectedAmount` en un periodo cerrado, sin cubrir el caso "PERCENT con ingresos = 0 → sin proyección tampoco" que `plan.md` §6 ya recogía explícitamente. Detectado y corregido antes de dar la tarea por terminada, releyendo el propio código contra `plan.md`: `projectedAmount` ahora es `null` si el periodo está cerrado **o** si no hay `targetAmount` calculable (sin nada con lo que comparar la proyección), no solo lo primero.
  *Verificación (H3/H4, e2e — `test/goals-progress.e2e-spec.ts`, 15 tests):* progreso de un objetivo mensual y de un presupuesto por categoría con datos reales en un mes cerrado (importe objetivo, real, desviación, %, sin proyección — `null` explícito); presupuesto global usa el gasto total del mes, no el de una sola categoría; presupuesto de categoría sin ningún gasto todavía ese mes → `actualAmount: "0.00"`, `progressPercent: "0.00"`; objetivo `PERCENT` con ingresos = 0 en el periodo → `targetAmount`/`progressPercent` `null`, `BELOW_THRESHOLD`, sin proyección; estados de aviso con umbral 80 (79% → `BELOW_THRESHOLD`, 85% → `NEAR_THRESHOLD`, 105% → `AT_OR_ABOVE_TARGET`); mes en curso → proyección calculada (no `null`); progreso del objetivo anual en un año cerrado (sin proyección) y en el año en curso (con proyección); sin ningún objetivo/presupuesto definido → listas vacías / `savingsGoal: null`, no error; aislamiento (nunca incluye objetivos/presupuestos/movimientos de otro usuario); cuenta `PENDING_VERIFICATION` → 403; sin autenticar → 401.
  *Suite completa del backend en verde tras el grupo:* lint y build limpios; 97/97 tests unitarios; 177/177 tests e2e (18 ficheros, incluidos los 15 nuevos de este grupo).

## Grupo 4 — Frontend

- [x] **T4.1** — Frontend: página `/goals` (enlazada desde `HomePage`) — objetivo de ahorro (crear/editar mensual y anual, progreso del periodo en curso con selector de mes/año) y presupuestos de gasto (global + por categoría: crear, editar, borrar, progreso del mes en curso). `api/savings-goals.ts`, `api/expense-budgets.ts`, `api/goals-progress.ts` nuevos, espejo de los tipos del backend. HTML semántico plano sin gráficos (plan.md §7): progreso en `<ul>` de texto, presupuestos en `<table>`. Estado de progreso (`resolveProgressStatus`, neutral en el backend) traducido a dos vocabularios distintos en el cliente: "cumplido"/"cerca de conseguirlo" para el objetivo de ahorro, "superado"/"cerca del límite" para un presupuesto (H4 criterio 2).
  *Verificación:* `GoalsPage.test.tsx` (9 tests, Testing Library) — sin sesión no llama a ninguna API; sin objetivos/presupuestos muestra los mensajes de "todavía no tienes nada"; progreso real de un objetivo mensual y de un presupuesto de categoría; crear un objetivo mensual desde el formulario; editar un presupuesto existente desde la tabla; eliminar un presupuesto; crear un presupuesto de categoría desde "Añadir presupuesto"; con un presupuesto global ya existente, la opción "global" desaparece del desplegable (evita un 409 predecible desde la UI); error de carga mostrado. Lint y build en verde en ambos paquetes (frontend: 78/78 tests, 15 ficheros; backend sin cambios, 97/97 unitarios).

## Grupo 5 — Cierre de la spec

- [x] **T5.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1–H4) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que se hizo al cerrar las specs 001-003.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero (ver sección "Checklist de cierre — spec 004" más abajo).
  *Hallazgos reales durante el repaso, encontrados y corregidos con test nuevo (no solo documentados):* al contrastar `spec.md` literalmente contra la implementación, aparecieron 6 huecos de cobertura sobre comportamiento que ya era correcto pero no estaba probado explícitamente (ningún hueco real de producto, a diferencia del cierre de la spec 002): (1) H1 criterio 3 ("editar/borrar el mensual y el anual de forma independiente") no tenía un test que editara uno y comprobara que el otro queda intacto — añadido en `savings-goals.e2e-spec.ts`. (2) H2 criterio 2 ("importe fijo o % de mis ingresos") solo estaba probado para el caso inválido (`PERCENT` > 100) en `expense-budgets.e2e-spec.ts`, nunca para una creación válida — añadido. (3) H1 criterio 2 / H2 criterio 3 ("se aplica automáticamente a todos los periodos futuros sin volver a crearlo") no tenían ningún test que usara el mismo objetivo/presupuesto contra dos meses distintos — añadido en `goals-progress.e2e-spec.ts`, comprobando mismo `id` y `actualAmount` distinto en cada mes. (4) El caso "PERCENT con ingresos = 0" (spec.md §4) solo estaba probado para un objetivo de ahorro, nunca para un presupuesto de gasto (mismo `resolveTargetAmount`, pero sin demostración e2e para H2) — añadidos dos tests (ingresos reales y ingresos = 0). (5) H4 criterio 1 ("cada objetivo/presupuesto tiene su propio umbral, independiente de los demás") solo se había probado con el mismo umbral (80%) en varios presupuestos — añadido un test con dos presupuestos con el mismo % de progreso (85%) y umbrales distintos (50%/90%) que producen estados distintos. (6) En el frontend, `GoalsPage.test.tsx` solo ejercitaba la etiqueta de `AT_OR_ABOVE_TARGET`; añadido un test para `NEAR_THRESHOLD`/`BELOW_THRESHOLD` en los dos vocabularios (objetivo/presupuesto). Ninguno de los 6 cambia comportamiento, solo prueban código que ya era correcto. Suite tras el cierre: backend 97/97 unitarios + 183/183 e2e (18 ficheros); frontend 79/79 tests (15 ficheros); lint y build limpios en ambos paquetes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").

---

## Checklist de cierre — spec 004 (T5.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático (se cita el fichero).

### H1 — Definir un objetivo de ahorro

- [x] Criterio 1 (mensual, anual, o ambos a la vez; importe fijo o % de ingresos): `savings-goals.e2e-spec.ts` — "crea un objetivo mensual y uno anual a la vez, sin chocar entre sí" (uno `AMOUNT`, otro `PERCENT`).
- [x] Criterio 2 (se aplica automáticamente a todos los periodos futuros/en curso sin volver a crearlo): `goals-progress.e2e-spec.ts` — "el mismo objetivo y presupuesto, sin volver a crearlos, aplican a distintos meses con su propio real de cada uno" (añadido en este cierre, T5.1).
- [x] Criterio 3 (editar o borrar el mensual y el anual de forma independiente): `savings-goals.e2e-spec.ts` — "editar el objetivo mensual no afecta al anual, y viceversa" (añadido en este cierre); `DELETE /savings-goals/:id` — "borra un objetivo propio".
- [x] Criterio 4 (solo un objetivo mensual y un anual activos a la vez): `savings-goals.e2e-spec.ts` — "un segundo objetivo con el mismo period → 409".

### H2 — Definir presupuestos de gasto

- [x] Criterio 1 (global + por categoría, ambos mensuales): `expense-budgets.e2e-spec.ts` — "crea un presupuesto global y uno por categoría a la vez, sin chocar entre sí".
- [x] Criterio 2 (importe fijo o % de mis ingresos del mes): `expense-budgets.e2e-spec.ts` — "acepta targetType PERCENT válido" (añadido en este cierre); `goals-progress.e2e-spec.ts` — "un presupuesto PERCENT calcula su importe objetivo sobre los ingresos reales del mes" (añadido).
- [x] Criterio 3 (se aplica automáticamente a todos los meses futuros): ver H1 criterio 2 (mismo test, cubre objetivo y presupuesto a la vez).
- [x] Criterio 4 (editar/borrar cada presupuesto independientemente; solo uno por categoría y uno global): `expense-budgets.e2e-spec.ts` — "un segundo presupuesto global → 409", "un segundo presupuesto para la misma categoría → 409", `PATCH`/`DELETE`.
- [x] Criterio 5 (solo categorías de gasto de nivel superior, no subcategorías): `expense-budgets.e2e-spec.ts` — "una subcategoría como categoryId → 400", "una categoría de tipo INCOME como categoryId → 400".

### H3 — Ver el progreso real frente a mis objetivos y presupuestos

- [x] Criterio 1 (importe objetivo, real, desviación, % alcanzado): `goals-progress.e2e-spec.ts` — "calcula el progreso de un objetivo de ahorro mensual y de un presupuesto por categoría en un mes cerrado".
- [x] Criterio 2 (proyección de cierre para el periodo en curso, mismo criterio del dashboard): `goals-progress.e2e-spec.ts` — "el mes en curso calcula una proyección de cierre por extrapolación (no null)", "el año en curso calcula una proyección (no null)"; fórmula (`projectAmount`) con 14 tests unitarios en `goals-progress.calculations.spec.ts`.
- [x] Criterio 3 (periodo cerrado, sin proyección): `goals-progress.e2e-spec.ts` — mismos tests del criterio 1, `projectedAmount: null` explícito; también el caso "PERCENT sin ingresos" (sin `targetAmount`, tampoco proyecta).
- [x] Criterio 4 (sin nada definido, se indica claramente, no pantalla vacía): backend — `goals-progress.e2e-spec.ts` "sin ningún objetivo ni presupuesto definido, devuelve listas vacías (no error)"; frontend — `GoalsPage.test.tsx` "sin ningún objetivo ni presupuesto, muestra los mensajes de todavía no tienes nada".

### H4 — Aviso visual al acercarme o superar un objetivo/presupuesto

- [x] Criterio 1 (umbral propio por objetivo/presupuesto, independiente de los demás): `goals-progress.e2e-spec.ts` — "el umbral de aviso es independiente por presupuesto" (añadido en este cierre: mismo 85% de progreso, umbrales 50%/90%, estados distintos).
- [x] Criterio 2 ("cerca del límite"/"superado" o "cerca de conseguirlo"/"cumplido" según el 100%): backend — `goals-progress.e2e-spec.ts` "umbrales de aviso: 79%/85%/105%"; frontend — `GoalsPage.test.tsx` "traduce NEAR_THRESHOLD y BELOW_THRESHOLD a la etiqueta correcta según el tipo" (añadido en este cierre) + el test de progreso real que ya cubría `AT_OR_ABOVE_TARGET`.
- [x] Criterio 3 (solo aviso visual, sin email/notificación externa): por ausencia — esta spec no añade ningún envío de email/push (ver `plan.md` §8, fuera de este plan); nada que probar más allá de que no existe el código.

### Aislamiento de datos (spec.md §3 / constitution.md §2)

- [x] Cada objetivo/presupuesto pertenece exclusivamente a su usuario: `savings-goals.e2e-spec.ts`/`expense-budgets.e2e-spec.ts` — "lista solo los objetivos/presupuestos propios", ajeno → 404 en `PATCH`/`DELETE`.
- [x] El progreso nunca mezcla movimientos de otro usuario: `goals-progress.e2e-spec.ts` — "aislamiento: nunca incluye objetivos/presupuestos/movimientos de otro usuario".
- [x] Cuenta `PENDING_VERIFICATION` → 403 en todos los endpoints nuevos: los tres ficheros e2e, en cada recurso.

### Reglas de negocio concretas (spec.md §4)

- [x] Un objetivo de ahorro no lleva categoría: por diseño de esquema (`savings_goals` no tiene `category_id`, `goals.schema.ts`) — nada que probar más allá de la ausencia de la columna.
- [x] Un presupuesto global no lleva categoría: `expense-budgets.e2e-spec.ts` — creación de presupuesto global con `categoryId: null` explícito en la respuesta.
- [x] Un presupuesto de categoría solo a una de nivel superior propia: ver H2 criterio 5.
- [x] El % de ingresos se calcula sobre el mismo periodo evaluado; sin ingresos, sin importe calculable: `goals-progress.e2e-spec.ts` — caso del objetivo de ahorro y, añadido en este cierre, el caso paralelo del presupuesto de gasto.
- [x] La proyección solo se calcula para el periodo en curso: ver H3 criterio 2/3.
- [x] Umbral de aviso editable por objetivo/presupuesto, sin valor fijo en el código: el esquema no lleva `.default(...)` en `alert_threshold_percent` (`goals.schema.ts`) — el cliente siempre debe enviarlo explícitamente. Nota de transparencia: el formulario de creación en `GoalsPage` sugiere `80.00` como valor de partida en el campo (editable antes de enviar) — no es un umbral fijo aplicado por el backend ni compartido entre objetivos, cada fila guarda su propio valor tal cual lo envía el usuario, igual que si hubiera escrito cualquier otro número.

### Decisiones (spec.md §6)

- [x] Decisión 1 (alcance: ahorro + presupuesto por categoría + global, ambos mensuales para el gasto): ver H1/H2 arriba — ninguna spec de presupuesto anual de gasto implementada, coherente con la decisión.
- [x] Decisión 2 (objetivos/presupuestos fijos, sin histórico; editar sustituye): ver H1 criterio 4 / H2 criterio 4 (409 en duplicado, `PATCH` sustituye el valor de la fila existente, no se guarda versión anterior — por diseño de esquema, sin tabla de historial).
- [x] Decisión 3 (solo aviso visual, sin email): ver H4 criterio 3.
- [x] Decisión 4 (umbral configurable por el usuario, no fijo): ver H4 criterio 1 y la nota de transparencia de "Reglas de negocio" arriba.
- [x] Decisión 5 (proyección reutiliza el criterio ya validado del dashboard): `goals-progress.service.ts` reutiliza `resolveDaysForMonth`/`resolveDaysForYear`/`projectAmount`, mismo criterio de extrapolación que `average()` (spec 002); sin un método de proyección nuevo y distinto.

### Fuera de alcance (spec.md §5)

Notificaciones por email/push, presupuestos de gasto anuales, presupuestos/desviaciones por subcategoría, historial de valores pasados, ajuste automático de objetivos: ninguno tiene código en esta spec — ausencia deliberada, nada que verificar (mismo criterio que el cierre de las specs 002 y 003 con sus propios "fuera de alcance").

### Resultado del cierre

Todos los criterios de aceptación de H1-H4 están cubiertos por al menos un test automático. Igual que en el cierre de la spec 003 (y a diferencia del cierre de la spec 002), este repaso no encontró ningún hueco real de producto frente a `spec.md` que requiriera una decisión de Diego — solo 6 huecos de cobertura sobre comportamiento ya correcto (detallados en la nota de T5.1 más arriba), corregidos con tests nuevos durante el propio cierre. Suite completa en verde: backend 97/97 unitarios + 183/183 e2e (18 ficheros); frontend 79/79 tests (15 ficheros); lint y build limpios en ambos paquetes.

Con esto, **spec 004 queda cerrada por completo**.
