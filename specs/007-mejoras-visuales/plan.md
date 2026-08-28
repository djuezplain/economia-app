# Plan 007 — Mejoras visuales

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H5)
**Stack de referencia:** `specs/constitution.md` §3 — añade `lucide-react` (ya reflejado en la tabla, decisión tomada en `spec.md` §4.2).

## 0. Corrección importante encontrada al planificar: H2 ya está implementado

`spec.md` (§1, "Por qué") afirmaba que "Recharts... está declarado como dependencia desde el principio pero ninguna página lo usa aún". **Es incorrecto** — al revisar el código para planificar H2, `DashboardPage.tsx` ya usa Recharts de forma completa desde antes de esta spec (comentario propio en el fichero: "H4/H5 (spec 002)"):

- Un `BarChart` horizontal con el desglose de gastos por categoría del mes (criterio 1 de H2).
- Un `LineChart` con la evolución mensual de ingresos/gastos/ahorro del año (criterio 2 de H2).
- En ambos casos, la tabla con las mismas cifras se mantiene debajo del gráfico, no se sustituye (criterio 3).
- Estado vacío explícito para el mes sin gastos ("Sin gastos en este mes.", criterio 4).

Lo único no cubierto de H2 criterio 4: la vista anual no tiene un aviso explícito de "año sin movimientos" — pero `dashboard.service.ts` (`monthlyEvolution`) siempre devuelve los 12 meses del año con ceros cuando no hay datos, así que el gráfico nunca aparece roto o en blanco sin explicación (se ve una línea plana en 0), que ya es una representación honesta de "no hay datos". Se añade de todos modos un texto explícito cuando los 3 totales anuales son `0.00` (ver §3), por coherencia con el resto de la app y para no dejar a medias un criterio de aceptación ya escrito.

**Consecuencia para `tasks.md`:** las tareas de H2 se reducen a esa única mejora menor (texto de año vacío) en vez de construir los gráficos desde cero. Se documenta aquí en vez de que `tasks.md` "descubra" en silencio que la mayor parte del trabajo ya existe.

## 1. H1 — Código de color: función pura de 4 niveles, sin cambios de backend

`GoalProgress`/`BudgetProgress` (`api/goals-progress.ts`) ya exponen `progressPercent` (string) y `alertThresholdPercent` (string) — suficiente para calcular los 4 niveles de `spec.md` H1 criterio 1 enteramente en el cliente, sin tocar el backend ni `resolveProgressStatus` (que sigue devolviendo sus 3 estados de negocio, usados para el texto — `budgetStatusLabel`/`savingsStatusLabel` no cambian).

Nueva función pura en `frontend/src/pages/goals-shared.ts` (fichero nuevo, mismo patrón que `movements-shared.ts`):

```ts
export type VisualLevel = 'ok' | 'near' | 'warning' | 'over';

// H1 criterio 1 (spec 007). Subdivide visualmente el estado `BELOW_THRESHOLD`
// del backend (goals-progress.calculations.ts) con un límite adicional al
// 90% del umbral de aviso — puramente de presentación, no se envía ni se
// guarda como un umbral configurable nuevo (spec.md §4.3).
export function resolveVisualLevel(progressPercent: string | null, alertThresholdPercent: string): VisualLevel {
  if (progressPercent === null) return 'ok';
  const percent = parseFloat(progressPercent);
  const threshold = parseFloat(alertThresholdPercent);
  if (percent >= 100) return 'over';
  if (percent >= threshold) return 'warning';
  if (percent >= threshold * 0.9) return 'near';
  return 'ok';
}
```

`parseFloat` (no una librería de precisión decimal) es intencional: esto no es un cálculo financiero (constitution.md §2, "no llevan lógica a ojo" se refiere a totales/medias/impuestos, no a en qué franja de color cae un valor ya calculado por el backend) — mismo criterio que ya usa `DashboardPage.tsx` (`parseFloat(entry.total)`) para ordenar y dibujar el gráfico de barras.

### Decisión de plan: dirección del color según el tipo (no está en `spec.md`, se decide aquí — constitution.md §5)

`spec.md` H1 solo describe el color para presupuestos, donde superar es malo (verde→rojo = de holgado a excedido). Un objetivo de **ahorro** es lo contrario: superar el objetivo es bueno. Aplicar literalmente "verde = lejos, rojo = superado" a un objetivo de ahorro pintaría de rojo justo el resultado que el usuario persigue — contradictorio con `savingsStatusLabel` (que ya llama "cumplido" en positivo a `AT_OR_ABOVE_TARGET`). Se define una única rampa de 4 colores, ordenada siempre por el mismo `VisualLevel` (`ok → near → warning → over`), pero **invertida según la dirección**:

```ts
const BUDGET_RAMP: Record<VisualLevel, string> = { ok: 'green', near: 'amber', warning: 'orange', over: 'red' };
const SAVINGS_RAMP: Record<VisualLevel, string> = { ok: 'red', near: 'orange', warning: 'amber', over: 'green' };
```

`GoalsPage` ya distingue las dos direcciones para el texto (`savingsStatusLabel` vs `budgetStatusLabel`); se reutiliza exactamente ese mismo punto de decisión para elegir la rampa de color, así que no hay ningún sitio nuevo donde se pueda desincronizar texto y color.

### Tokens de color en `index.css`

Se añaden 4 variables de color con su variante de modo oscuro, mismo patrón que las ya existentes (`--accent`, `--border`, etc.), y una versión "-bg" tenue para el fondo de la barra vacía:

```css
--status-green: #1baf7a;
--status-amber: #d6a92a;   /* mismo criterio de contraste que --accent, no un amarillo puro */
--status-orange: #eb6834;  /* mismo naranja que COLOR_EXPENSE en DashboardPage.tsx, reutilizado a propósito */
--status-red: #d64545;
--status-track-bg: var(--border); /* fondo de la barra vacía, ya existe como token */
```

(Con sus 4 equivalentes ajustados de luminosidad dentro de `@media (prefers-color-scheme: dark)`, igual que el resto de `:root`.)

## 2. H3 — Componente `ProgressBar` reutilizable

Nuevo componente `frontend/src/components/ProgressBar.tsx`:

```tsx
export function ProgressBar({ percent, level, direction, label }: {
  percent: number | null;
  level: VisualLevel;
  direction: 'budget' | 'savings';
  label: string; // aria-label completo, p.ej. "Transporte: 120% del presupuesto, superado"
}) {
  const clamped = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  const color = (direction === 'budget' ? BUDGET_RAMP : SAVINGS_RAMP)[level];
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={percent ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-bar-fill" style={{ width: `${clamped}%`, background: `var(--status-${color})` }} />
      {percent !== null && percent > 100 && <span className="progress-bar-overflow" aria-hidden="true">{Math.round(percent)}%</span>}
    </div>
  );
}
```

**Nota de arquitectura — primer uso de `className` en el proyecto.** Todo el CSS existente es por `id` (`#app-sidebar`, `#root`...), documentado explícitamente en `index.css` como decisión ("el proyecto no usa `className` en ninguna página"). Esa convención asume elementos únicos por página. `ProgressBar` rompe ese supuesto a propósito: se instancia varias veces en la misma página (un objetivo mensual, uno anual, y uno por cada presupuesto de la tabla) — un `id` no puede repetirse ahí. Se introduce `className` **solo para este componente reutilizable**, no se generaliza al resto de la app; el resto de páginas sigue con HTML semántico plano sin clases. Se documenta aquí explícitamente en vez de dejar que sea una desviación silenciosa de la convención ya fijada.

### Dónde se usa

- **Objetivo de ahorro** (`GoalProgressSummary`, mensual y anual): se añade un `<ProgressBar direction="savings" .../>` justo antes del `<ul>` existente — el `<ul>` no se toca (conserva los tests actuales letra por letra).
- **Presupuestos** (tabla de `expenseBudgets`): se añade una columna nueva `Progreso visual` con `<ProgressBar direction="budget" .../>`, **sin tocar** la columna existente `Progreso del mes` (que sigue siendo `budgetProgressCellText`, texto plano) — evita cualquier riesgo de romper el test que hace `getByText('300.00 de 250.00 (120.00%) · superado')` sobre esa celda exacta.

Un valor `>100%` (H3 criterio 3) se representa con la barra llena al 100% más una etiqueta numérica junto a ella (`progress-bar-overflow`) — nunca se corta el contenedor ni se dibuja fuera de la barra.

## 3. H2 — único añadido: aviso de año sin movimientos

En `DashboardPage.tsx`, cuando `yearSummary.totals.income === '0.00' && yearSummary.totals.expense === '0.00'`, se muestra `<p>Sin movimientos registrados en {year}.</p>` encima del gráfico de evolución mensual (mismo patrón que el aviso ya existente de "Sin gastos en este mes."). El gráfico y la tabla se mantienen debajo (criterio 3 de H2, sin cambios) — el aviso es un complemento, no un reemplazo.

## 4. H4 — Espaciado y agrupación: solo CSS, sin tocar ningún componente

Todos los formularios y tablas de la app viven dentro de un `<main>` y ya siguen el mismo patrón estructural (`<div>` por campo con `<label>`+`<input>`, `<table>` con `<thead>`/`<tbody>`) — se puede resolver H4 entera con selectores de descendencia en `index.css`, **sin editar ningún `.tsx`** ni introducir clases nuevas (mantiene la convención de "sin `className`" para todo lo que no sea `ProgressBar`):

```css
main form {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

main form > div {
  margin-bottom: 14px;
}
main form > div:last-of-type {
  margin-bottom: 0;
}

main table {
  border-collapse: collapse;
  width: 100%;
}
main table th,
main table td {
  padding: 10px 12px;
  text-align: left;
}
main table thead th {
  background: var(--code-bg);
  border-bottom: 2px solid var(--border);
}
main table tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--border);
}
```

El borde+padding alrededor de `main form` es lo que resuelve el criterio 1 de H4 ("agrupados visualmente... en vez de aparecer como una lista de campos pegados") sin necesidad de decidir subgrupos internos por formulario (que sería subjetivo y tocaría cada página) — cada `<form>` ya es, semánticamente, "un bloque relacionado"; delimitarlo visualmente como tal cumple el criterio sin inventar agrupaciones nuevas dentro de formularios con pocos campos. El `<ul>` del listado de movimientos (`MovementsListPage`) no es una tabla — se le aplica el mismo espaciado vertical entre `<li>` con un selector adicional (`main ul li { padding: 8px 0; border-bottom: 1px solid var(--border); }`), acotado a listas dentro de `<main>` para no afectar a listas de otras partes (p. ej. las de `GoalProgressSummary`, que son más cortas y no necesitan ese tratamiento — se excluyen dándoles su propio contenedor, ver nota de implementación en `tasks.md`).

Criterio 3 de H4 (sin cambios funcionales) queda garantizado por construcción: no se toca ningún `.tsx` en esta historia.

## 5. H5 — Iconos de `lucide-react` en el menú lateral

`npm install lucide-react` en `frontend/` (nueva dependencia, ya reflejada en `constitution.md` §3). Se define un array de configuración en `AppLayout.tsx` para no repetir 8 veces el mismo bloque `<li><NavLink>...`:

```tsx
const NAV_ITEMS = [
  { to: '/', end: true, label: 'Inicio', Icon: Home },
  { to: '/categories', label: 'Categorías', Icon: Tags },
  { to: '/movements', label: 'Ingresos y gastos', Icon: ArrowLeftRight },
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/import', label: 'Importar Excel', Icon: FileUp },
  { to: '/goals', label: 'Objetivos y presupuestos', Icon: Target },
  { to: '/profile', label: 'Tu perfil', Icon: User },
  { to: '/sessions', label: 'Dispositivos y sesiones', Icon: Monitor },
] as const;
```

Cada `<NavLink>` pasa a renderizar `<Icon aria-hidden="true" size={18} />` seguido del texto de `label` — el icono es decorativo (el texto sigue siendo el nombre accesible del enlace, criterio 3 de H5 no cambia nada aquí).

### Decisión de plan que modifica un comportamiento ya cerrado en spec 005

Hoy, plegar el menú (`isCollapsed`) **oculta por completo** el `<ul>` — así lo prueba `AppLayout.test.tsx` ("el botón de plegar oculta los enlaces..."), verificando literalmente que el enlace "Inicio" deja de existir en el DOM. `spec.md` H5 criterio 2 pide lo contrario: con el menú plegado, el icono debe seguir siendo visible y accesible (con `title`/`aria-label`). Esto es una evolución deliberada del comportamiento de plegado, no solo una capa visual encima:

- Con el menú plegado, `AppLayout` sigue renderizando el `<ul>`, pero cada `<NavLink>` muestra solo `<Icon aria-hidden="true" />` (sin el texto de `label` visible) y añade `aria-label={label}` + `title={label}` — el nombre accesible del enlace sigue siendo el mismo texto de siempre, solo cambia lo que se ve.
- El botón de cerrar sesión (no es una "sección" de spec.md H5, pero vive en el mismo `<ul>`) se trata igual por coherencia visual: icono `LogOut` siempre, con el texto "Cerrar sesión" oculto (no el botón entero) cuando está plegado.
- **Esto requiere actualizar el test existente** "el botón de plegar oculta los enlaces y el de cerrar sesión..." (`AppLayout.test.tsx`): en vez de comprobar que `getByRole('link', { name: 'Inicio' })` no existe, deberá comprobar que el enlace existe (accesible, mismo `name: 'Inicio'` vía `aria-label`) pero que su texto visible (`Inicio` como nodo de texto plano) ya no está presente — p. ej. comprobando que el `<span>` de texto tiene `hidden` o que no hay un nodo de texto suelto igual a "Inicio" fuera del propio `aria-label`. Se deja concretado en `tasks.md`, pero se anota aquí porque es un cambio de comportamiento de una spec ya cerrada (005), no solo una tarea nueva — mismo motivo por el que spec 006 documentó explícitamente su interacción con spec 005 en su propio plan (§4 de ese plan).

Para ocultar visualmente el texto sin quitarlo del árbol de accesibilidad (mejor que `aria-label` solo, que además duplicaría el anuncio si el texto siguiera ahí), se envuelve el label en un `<span>` con una clase de utilidad `sr-only` (oculta visualmente, presente para lectores de pantalla) — segundo y último uso de `className` en el proyecto junto al de `ProgressBar` (§2), con el mismo criterio: es infraestructura de un componente/patrón reutilizable, no estilo de página.

## 6. Casos límite a cubrir con tests

- `resolveVisualLevel`: los 4 umbrales exactos (justo por debajo/igual/por encima de 90% del umbral, del umbral, y de 100%) — tests unitarios puros, mismo criterio que `goals-progress.calculations.spec.ts` en el backend.
- `ProgressBar`: `role="progressbar"` con `aria-valuenow`/`aria-valuemin`/`aria-valuemax` correctos; `percent > 100` muestra la etiqueta de exceso sin desbordar la barra (`width` no supera 100%); `percent === null` (sin datos) se muestra vacía sin lanzar error.
- `GoalsPage`: la columna nueva "Progreso visual" no rompe ningún test existente sobre la columna "Progreso del mes"; el color de un presupuesto superado es `red`/`over` y el de un objetivo de ahorro cumplido es `green`/`over` (misma función, direcciones opuestas) — test explícito de la inversión de rampa.
- `DashboardPage`: año con los 3 totales a `0.00` muestra el aviso nuevo; año con datos no lo muestra (no hay falso positivo).
- `AppLayout`: con el menú plegado, los 8 enlaces + el botón de cerrar sesión siguen siendo accesibles por su nombre (`getByRole(..., { name })` sigue encontrándolos), pero su texto visible no está en el DOM como nodo de texto plano — sustituye al test que hoy comprueba que dejan de existir del todo.
- CSS de H4 no se prueba con tests automáticos (no hay tests visuales en este proyecto) — se verifica manualmente (capturas de antes/después) como parte del cierre de la spec, mismo criterio que otras mejoras puramente visuales no han tenido test dedicado hasta ahora.

## 7. Fuera de este plan

- No se toca `resolveProgressStatus` ni ningún endpoint del backend — todo H1/H3 es cálculo y presentación en el cliente sobre datos ya servidos.
- No se toca la paleta de colores de `DashboardPage.tsx` (`COLOR_INCOME`/`COLOR_EXPENSE`/`COLOR_SAVINGS`) — son series de un gráfico ya aprobado (spec 002), fuera del alcance de H1 (que es sobre progreso de objetivos/presupuestos, no sobre las series del dashboard).

---
**Siguiente paso:** revisar este plan con Diego — en particular la corrección de §0 (H2 ya implementado, reduce mucho el alcance de esa historia) y la decisión de §5 que actualiza un test de la spec 005 ya cerrada. Con su aprobación, se genera `tasks.md`.
