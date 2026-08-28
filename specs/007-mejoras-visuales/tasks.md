# Tasks 007 — Mejoras visuales

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

**Nota de partida (contexto, no una tarea):** `plan.md` §0 corrige `spec.md` — H2 (gráficos Recharts) ya estaba implementada antes de esta spec. El Grupo 4 de abajo refleja esa corrección: es una tarea pequeña (aviso de año sin movimientos), no la construcción de los gráficos.

## Grupo 1 — H1: cálculo de color, sin tocar el backend

- [x] **T1.1** — `frontend/src/pages/goals-shared.ts` (nuevo): tipo `VisualLevel`, función `resolveVisualLevel(progressPercent, alertThresholdPercent)` y las dos rampas `BUDGET_RAMP`/`SAVINGS_RAMP` (`plan.md` §1). `frontend/src/index.css`: tokens `--status-green`/`--status-amber`/`--status-orange`/`--status-red` (+ variantes de modo oscuro).
  *Verificación (planeada, `goals-shared.test.ts`):* `resolveVisualLevel` en los 4 umbrales exactos (justo por debajo/igual/por encima del 90% del umbral de aviso, del umbral, y del 100%), con `progressPercent: null` → `'ok'`. `BUDGET_RAMP`/`SAVINGS_RAMP` cubren los 4 `VisualLevel` cada una, y son literalmente inversas entre sí (test explícito: `BUDGET_RAMP.over === SAVINGS_RAMP.ok`, etc., para que una futura edición de una rampa no rompa la otra en silencio).

## Grupo 2 — H3: componente `ProgressBar`

- [x] **T2.1** — `frontend/src/components/ProgressBar.tsx` (nuevo, `plan.md` §2): `role="progressbar"`, `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, color según `direction`/`level`, indicador de exceso cuando `percent > 100`. CSS de `.progress-bar`/`.progress-bar-fill`/`.progress-bar-overflow` en `index.css` (primer uso de `className` del proyecto, documentado en `plan.md` §2 — no se repite fuera de este componente).
  *Verificación (planeada, `ProgressBar.test.tsx`):* atributos ARIA correctos con distintos `percent`; `percent === null` se muestra vacía (`aria-valuenow="0"`) sin lanzar error; `percent === 150` muestra la etiqueta de exceso y el relleno no supera el 100% de ancho (comprobado vía `style.width`); `direction="budget"` con `level="over"` usa el color rojo (`--status-red`) y `direction="savings"` con `level="over"` usa el verde (`--status-green`) — mismo `level`, colores opuestos.

## Grupo 3 — H1 + H3: integración en `GoalsPage`

- [x] **T3.1** — `GoalsPage.tsx`: `GoalProgressSummary` añade un `<ProgressBar direction="savings" .../>` antes del `<ul>` existente (sin tocar el `<ul>`). La tabla de presupuestos añade una columna nueva "Progreso visual" con `<ProgressBar direction="budget" .../>`, dejando la columna existente "Progreso del mes" (`budgetProgressCellText`) intacta (`plan.md` §2).
  *Verificación (planeada, ampliando `GoalsPage.test.tsx`):* la columna "Progreso del mes" sigue devolviendo exactamente el mismo texto que hoy (regresión de los tests ya existentes, sin tocarlos) — confirma que no se ha roto nada de spec 004. Nuevo test: un presupuesto al 120% muestra su `ProgressBar` en rojo (`over`, dirección `budget`); un objetivo de ahorro mensual cumplido (`AT_OR_ABOVE_TARGET`) muestra su `ProgressBar` en verde (dirección `savings`) — mismo dato de entrada que ya prueba `savingsStatusLabel`, verificando que texto y color no puedan desincronizarse (ambos leen el mismo `status`/`progressPercent`).

## Grupo 4 — H2: único añadido (aviso de año sin movimientos)

- [x] **T4.1** — `DashboardPage.tsx`: cuando `yearSummary.totals.income === '0.00' && yearSummary.totals.expense === '0.00'`, muestra `<p>Sin movimientos registrados en {year}.</p>` antes del gráfico de evolución mensual (`plan.md` §3). Sin cambios en `MonthSummary`/`YearSummary` ni en el backend.
  *Verificación (planeada, ampliando `DashboardPage.test.tsx`):* año con `income`/`expense` totales en `0.00` muestra el aviso nuevo; año con datos reales no lo muestra (evita falso positivo); el gráfico y la tabla de evolución mensual se siguen mostrando en ambos casos (no se sustituyen, criterio 3 de H2).

## Grupo 5 — H4: espaciado y agrupación (solo CSS)

- [x] **T5.1** — `frontend/src/index.css`: reglas de `plan.md` §4 (`main form` como bloque con borde/padding, espaciado entre `div` de campo, cabecera de tabla distinguida, filas con más aire, `<li>` de listas dentro de `main` con separador). Ningún fichero `.tsx` se modifica en esta tarea.
  *Verificación (planeada):* no hay tests automáticos de CSS en este proyecto (documentado en `plan.md` §6) — se verifica manualmente con capturas de antes/después de al menos: `RegisterMovementPage` (formulario), `GoalsPage` (formularios + tabla de presupuestos), `MovementsListPage` (listado). Se confirma además que la suite completa de tests sigue en verde sin ningún cambio (ninguna tarea de este grupo toca comportamiento ni marcado semántico).

## Grupo 6 — H5: iconos de `lucide-react` en el menú lateral

- [ ] **T6.1** — `npm install lucide-react` en `frontend/`. `AppLayout.tsx`: array `NAV_ITEMS` con icono por sección (`plan.md` §5); cada `NavLink` renderiza `<Icon aria-hidden="true" />` + `<span>{label}</span>`. Botón "Cerrar sesión" recibe el icono `LogOut` con el mismo tratamiento.
  *Verificación (planeada, ampliando `AppLayout.test.tsx`):* con el menú desplegado, los 8 enlaces y el botón de cerrar sesión siguen siendo accesibles por su nombre exactamente igual que hoy (regresión del test ya existente, sin cambios de comportamiento en este estado) — solo se añade que cada uno tiene ahora un icono (`container.querySelector('svg')` dentro del enlace/botón).

- [ ] **T6.2** — `AppLayout.tsx`: con el menú plegado, el `<ul>` deja de ocultarse por completo — cada `<NavLink>`/el botón de cerrar sesión oculta visualmente su `<span>` de texto (clase `sr-only`, nueva en `index.css`) y añade `aria-label`/`title` con el nombre completo (`plan.md` §5).
  *Verificación (planeada, actualizando el test "el botón de plegar oculta los enlaces y el de cerrar sesión..." de `AppLayout.test.tsx`, spec 005):* se sustituye la comprobación de que el enlace "Inicio" deja de existir por: el enlace sigue siendo accesible (`getByRole('link', { name: 'Inicio' })` sigue encontrándolo, vía `aria-label`), pero su `<span>` de texto tiene la clase `sr-only` (no hay un nodo de texto visible "Inicio" fuera de ese `aria-label`); mismo patrón para "Cerrar sesión". Se anota explícitamente en el commit que este test pertenece a spec 005 y se actualiza aquí por la decisión ya documentada en `plan.md` §5 (evolución del comportamiento de plegado, no una regresión).

## Grupo 7 — Cierre de la spec

- [ ] **T7.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1-H5) y marcar cada criterio de aceptación como cubierto por al menos un test automático o, para H4 (sin tests de CSS en este proyecto), por verificación manual documentada — mismo criterio que en el cierre de las specs 001-006.
  *Verificación (planeada):* el propio checklist relleno, añadido al final de este fichero tras la implementación; suite completa del frontend en verde (0 regresiones en los tests de specs 002/004/005 que este trabajo toca de refilón); lint y build limpios.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca `[x]` aquí y se hace commit; solo entonces se pasa a la siguiente. Si algo de `plan.md` no encaja al implementarlo, se para y se ajusta el plan antes de seguir (no se parchea en silencio).
