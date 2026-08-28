# Plan 004 — Objetivos de ahorro y presupuestos de gasto

**Estado:** Borrador
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H4)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos

Dos tablas nuevas, sin tocar el modelo de spec 002. Ninguna lleva subcategoría (spec.md §4).

### `savings_goals` (H1)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `users`, `onDelete: cascade` | |
| `period` | enum `MONTHLY` \| `ANNUAL` | |
| `target_type` | enum `AMOUNT` \| `PERCENT` | |
| `target_value` | `numeric(12,2)` | importe si `AMOUNT`; puntos porcentuales (0-100) si `PERCENT` |
| `alert_threshold_percent` | `numeric(5,2)` | H4 criterio 1: editable por el usuario, sin valor por defecto en el código |
| `created_at`, `updated_at` | timestamp | |

Regla de negocio (H1 criterio 4, no a nivel de esquema): un usuario no puede tener dos filas con el mismo `period` — se comprueba en `SavingsGoalsService.create()` antes de insertar (409 si ya existe), igual que `CategoriesService` comprueba sus propias reglas de jerarquía en el servicio, no con una constraint SQL. Se documenta la alternativa (índice único parcial) y por qué no se usa: mantiene la comprobación en el mismo sitio (el servicio) que ya centraliza el resto de reglas de negocio del proyecto, en vez de repartir la validación entre SQL y TypeScript.

### `expense_budgets` (H2)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `users`, `onDelete: cascade` | |
| `category_id` | uuid FK → `categories`, `onDelete: cascade`, **nullable** | `null` = presupuesto global (spec.md §4); si no es `null`, debe ser una categoría de gasto de nivel superior propia (H2 criterio 5) |
| `target_type` | enum `AMOUNT` \| `PERCENT` | |
| `target_value` | `numeric(12,2)` | igual criterio que `savings_goals` |
| `alert_threshold_percent` | `numeric(5,2)` | |
| `created_at`, `updated_at` | timestamp | |

`onDelete: cascade` en `category_id` (a diferencia de `transactions.category_id`, que es `restrict`): si Diego borra una categoría que tenía un presupuesto, tiene más sentido que el presupuesto huérfano desaparezca con ella que bloquear el borrado de la categoría — un presupuesto no es un dato histórico que preservar (a diferencia de un movimiento ya registrado).

Regla de negocio (H2 criterio 4, en el servicio, mismo criterio que `savings_goals`): un usuario no puede tener dos presupuestos con el mismo `category_id`, ni dos presupuestos globales (`category_id IS NULL`) — 409 si ya existe.

## 2. Endpoints (NestJS, mismo guard que categorías/movimientos/importación)

Todos con `@UseGuards(AuthGuard, RequireActiveUserGuard)`.

| Método y ruta | Descripción |
|---|---|
| `GET /savings-goals` | Lista los objetivos de ahorro del usuario (0, 1 o 2 filas: mensual y/o anual). |
| `POST /savings-goals` | Crea uno (`period`, `targetType`, `targetValue`, `alertThresholdPercent`). 409 si ya existe uno para ese `period`. |
| `PATCH /savings-goals/:id` | Edita `targetType`/`targetValue`/`alertThresholdPercent` (no `period` — para cambiar el periodo, se borra y se crea uno nuevo). |
| `DELETE /savings-goals/:id` | Borra. |
| `GET /expense-budgets` | Lista los presupuestos del usuario (global + por categoría). |
| `POST /expense-budgets` | Crea uno (`categoryId` opcional — se omite para el global, `targetType`, `targetValue`, `alertThresholdPercent`). 409 si ya existe uno para esa categoría/global. |
| `PATCH /expense-budgets/:id` | Edita `targetType`/`targetValue`/`alertThresholdPercent` (no `categoryId`). |
| `DELETE /expense-budgets/:id` | Borra. |
| `GET /goals-progress/month?month=YYYY-MM` | H3: progreso del objetivo de ahorro **mensual** (si existe) + de todos los presupuestos de gasto (mensuales por diseño) para ese mes. Sin `month`, el mes en curso. |
| `GET /goals-progress/year?year=YYYY` | H3: progreso del objetivo de ahorro **anual** (si existe) para ese año. Sin presupuestos (H2 es solo mensual). Sin `year`, el año en curso. |

Aislamiento (spec.md §3, constitution §2): todas las consultas filtran por `userId` del token, igual que el resto de la app — un objetivo/presupuesto ajeno nunca aparece en `GET`, y editarlo/borrarlo devuelve 404 (mismo criterio de "no confirmar recursos ajenos" que `CategoriesService`/`TransactionsService`).

## 3. Reutilización de `DashboardService` (decisión de diseño)

A diferencia de `DashboardService`, que consulta `transactions` directamente **en vez de** reutilizar `TransactionsService` (porque sus necesidades de agregación son distintas — ver la cabecera de `dashboard.service.ts`), aquí el caso es el contrario: `GoalsProgressService` necesita **exactamente** los mismos números que ya calcula `DashboardService.month()`/`.year()` (`income`, `expense`, `savings`, `byCategory`) — no una variación. Reimplementar esa misma consulta y esas mismas funciones puras sería duplicar, no adaptar. Por eso `GoalsProgressService` inyecta `DashboardService` directamente:

- `DashboardModule` pasa a exportar `DashboardService` (hoy solo lo declara como `provider`, sin `exports` — cambio pequeño y sin efecto en spec 002).
- `GoalsModule` importa `DashboardModule` para conseguirlo — mismo patrón ya usado por `CategoriesModule` exportando `CategoriesService` para `AuthModule`.

Esto significa que el progreso de objetivos/presupuestos **siempre coincide** con lo que ya muestra el dashboard (mismo `income`/`expense`/`byCategory` de origen) — no hay dos fuentes de verdad calculando el mismo dato de formas ligeramente distintas.

## 4. Cálculos: fórmulas y funciones puras (constitution §2)

Nuevo fichero `backend/src/goals/goals-progress.calculations.ts`. Todas reciben datos ya cargados, sin acceso a base de datos.

- **`resolveTargetAmount(targetType, targetValue, incomeForPeriod)`** → `string | null`. Si `AMOUNT`, devuelve `targetValue` tal cual. Si `PERCENT`, `income × targetValue ÷ 100`; `null` si `incomeForPeriod` es 0 (spec.md §4: sin ingresos, un objetivo en % no tiene importe calculable — mismo criterio que `savingsPercent` ya usa para no dividir por cero).
- **`computeDeviation(actualAmount, targetAmount)`** → `actualAmount − targetAmount`. Positivo = el gasto real supera el presupuesto (mal) o el ahorro real supera el objetivo (bien) — el signo es el mismo cálculo para ambos casos; quien presenta el dato decide cómo colorearlo/interpretarlo (H4), la función no sabe si es un objetivo de ahorro o un presupuesto de gasto.
- **`computeProgressPercent(actualAmount, targetAmount)`** → `actualAmount ÷ targetAmount × 100`, `null` si `targetAmount` es `null` o 0.
- **`resolveProgressStatus(progressPercent, alertThresholdPercent)`** → `'BELOW_THRESHOLD' | 'NEAR_THRESHOLD' | 'AT_OR_ABOVE_TARGET'`. `null` → `BELOW_THRESHOLD` (sin importe objetivo calculable, no hay nada que avisar). Función deliberadamente neutral (no sabe si "cerca"/"alcanzado" es bueno o malo) — el frontend traduce cada estado a la etiqueta correcta según el tipo (H4 criterio 2: "cerca del límite"/"superado" para un presupuesto; "cerca de conseguirlo"/"cumplido" para un objetivo de ahorro).
- **`projectAmount(actualAmount, daysElapsed, daysInPeriod)`** → `actualAmount ÷ daysElapsed × daysInPeriod`, `null` si `daysElapsed` ≤ 0. Mismo criterio de extrapolación que ya usa `average()`/`resolveDaysForMonth` (spec 002) — solo se llama cuando el periodo es el actual (H3 criterio 2/3).

Reutilizadas de `dashboard/dashboard.calculations.ts` (con dos añadidos pequeños, documentados aquí para no descubrirlos "en silencio" durante la implementación):

- `resolveDaysForMonth` (ya existe) para los días transcurridos del mes en curso.
- **Añadido**: `daysInMonth(month)` — extrae como función propia el cálculo de días totales de un mes que hoy vive inline dentro de `resolveDaysForMonth`; se necesita por separado para la proyección (`projectAmount` recibe *transcurridos* y *totales* a la vez, `resolveDaysForMonth` hoy solo devuelve uno u otro según el caso).
- **Añadido**: `resolveDaysForYear(year, now)` / `daysInYear(year)` — mismo criterio que sus equivalentes de mes, pero para el objetivo anual: día del año transcurrido (1-indexado) si `year` es el año en curso, o días totales del año (365/366, bisiesto correcto) si no.
- **Añadido**: `currentMonthIso(now)` pasa de ser una función privada de `dashboard.service.ts` a exportarse desde `dashboard.calculations.ts` (con test unitario propio) — `GoalsProgressService` necesita saber si el mes consultado es "el actual" para decidir si calcula proyección, igual que ya decide `DashboardService` internamente.

Todas estas funciones son estrictamente de "matemática de periodos", coherente con por qué ya viven en `dashboard.calculations.ts` (spec 002) en vez de un fichero nuevo — no se crea un tercer fichero de cálculos de fechas para esto.

## 5. Validaciones (DTOs)

- `targetValue`: reutiliza el decorador `IsMoneyAmount` ya existente (`common/is-money-amount.decorator.ts`) tanto para `AMOUNT` como para `PERCENT` — el formato exigido (positivo, hasta 2 decimales) es el mismo en los dos casos, aunque el nombre del decorador venga de "importe"; no se crea un decorador casi idéntico solo por el nombre.
- Si `targetType` es `PERCENT`, el servicio comprueba además que `targetValue ≤ 100` (400 si no) — `IsMoneyAmount` no lo sabe (no distingue importes de porcentajes), así que ese límite se aplica en la capa de servicio, no en el DTO.
- `alertThresholdPercent`: mismo `IsMoneyAmount` + comprobación de servicio `≤ 100`.
- `period` (`savings_goals`): `@IsIn(['MONTHLY', 'ANNUAL'])`.
- `targetType`: `@IsIn(['AMOUNT', 'PERCENT'])`.
- `categoryId` (`expense_budgets`, opcional): si se manda, el servicio comprueba que existe, pertenece al usuario, es de tipo `EXPENSE` y no tiene `parentId` — 404 si no existe/no es propia (mismo criterio de no confirmar recursos ajenos que `TransactionsService.validateCategoryAssignment`), 400 si es de tipo `INCOME` o es una subcategoría (H2 criterio 5).
- Duplicados (H1 criterio 4 / H2 criterio 4): 409, con mensaje que indica editar el existente en vez de crear uno nuevo.

## 6. Casos límite a cubrir con tests

- Objetivo/presupuesto tipo `PERCENT` con ingresos = 0 en el periodo → `targetAmount` = `null`, sin dividir por cero, `progressPercent` = `null`, estado `BELOW_THRESHOLD` (sin proyección tampoco).
- Presupuesto de una categoría sin ningún gasto todavía ese mes → `actualAmount` = "0.00", `progressPercent` = "0.00".
- Crear un segundo objetivo con el mismo `period` → 409.
- Crear un segundo presupuesto global (sin `categoryId`) → 409.
- Crear un presupuesto sobre una subcategoría → 400.
- Crear un presupuesto sobre una categoría de tipo `INCOME` → 400.
- Crear un presupuesto sobre una categoría ajena o inexistente → 404.
- Borrar un objetivo/presupuesto: desaparece de `GET` y deja de aparecer en `goals-progress`.
- Borrar una categoría con un presupuesto asociado: el presupuesto se borra en cascada (a diferencia de un movimiento, que sigue bloqueando el borrado — spec 002).
- Mes en curso: `projectedAmount` se calcula (extrapolación por días transcurridos); mes ya cerrado: sin proyección (`null` explícito en la respuesta, no el campo ausente).
- Umbral 80: real = 79% → `BELOW_THRESHOLD`; 85% → `NEAR_THRESHOLD`; 105% → `AT_OR_ABOVE_TARGET` (mismo dato para un presupuesto "superado" o un objetivo de ahorro "cumplido" — la etiqueta la decide el frontend, no el backend).
- Año bisiesto: `resolveDaysForYear`/`daysInYear` con 2024 (366) vs. 2026 (365).
- Aislamiento: un objetivo/presupuesto de otro usuario nunca aparece en `GET`, ni se puede editar/borrar (404); `goals-progress` de un usuario nunca incluye datos de otro.
- Cuenta `PENDING_VERIFICATION` → 403 en todos los endpoints nuevos.
- Sin ningún objetivo/presupuesto definido: `goals-progress` devuelve listas vacías, no un error (H3 criterio 4 — el frontend es quien decide cómo explicarlo).

## 7. Frontend

Una página `/goals` (enlazada desde `HomePage`):

1. **Objetivo de ahorro**: formulario para crear/editar el mensual y el anual por separado (tipo importe/%, valor, umbral de aviso) y, debajo de cada uno, su progreso del periodo en curso: importe objetivo, real, desviación, % alcanzado, proyección de fin de periodo (o resultado final si el periodo ya cerró — con un selector de mes/año como el que ya tiene `DashboardPage`), y el aviso visual si corresponde.
2. **Presupuestos de gasto**: lista de los presupuestos existentes (global + por categoría) con su progreso del mes en curso; formulario para añadir uno nuevo (selector de categoría de gasto de nivel superior, o "presupuesto global"), y editar/borrar los existentes.
3. Mismo criterio del resto de la app: HTML semántico plano sin CSS, `<table>` con `<caption>`/`<th scope="col">` donde haga falta tabular datos — sin un componente de "barra de progreso" nuevo; el progreso se expresa en texto/tabla (p. ej. "160.00 € de 200.00 € (80%)"), igual que el resto de estadísticas de la app no usa gráficos para cifras puntuales (`DashboardPage` solo usa gráficos para comparaciones categóricas y evolución temporal, no para un único valor frente a un objetivo).
4. Nombres de categoría resueltos en el cliente contra `/categories` (ya existente), igual que hace `DashboardPage` — `goals-progress` solo devuelve `categoryId`.

## 8. Fuera de este plan

Todo lo ya listado como fuera de alcance en `spec.md` §5 (notificaciones por email/push, presupuestos de gasto anuales, presupuestos por subcategoría, historial de valores pasados, ajuste automático de objetivos) queda igualmente fuera del diseño técnico.

---
**Siguiente paso:** revisar este plan (modelo de datos, endpoints, fórmulas de progreso/proyección, reutilización de `DashboardService`) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
