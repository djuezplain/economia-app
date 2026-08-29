# Plan — Spec 010 (Rediseño visual completo, handoff editorial)

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Enfoque general

El handoff trae sus propios nombres de variable (`--color-bg`, `--color-accent`, `--font-heading`...). El propio README del handoff dice: *"si el target tiene tokens de diseño ya existentes, mapear sobre ellos en vez de inventar nuevos valores"*. El proyecto ya tiene su propio sistema de tokens desde spec 008 (`--text`, `--text-h`, `--bg`, `--border`, `--accent`, `--card-bg`, `--heading`, `--sans`) — así que **se actualizan los valores de esas variables ya existentes**, en vez de renombrarlas todas a `--color-*`. Esto reduce el tamaño del cambio (no hay que tocar cada selector que ya las usa) y sigue la propia guía de fidelity del handoff. Excepciones:

- `--sans` pasa a apuntar a Source Serif 4 (el cuerpo de texto deja de ser sans-serif): mantener ese nombre sería confuso para quien lea el código después, así que se renombra a `--font-body` en todo el fichero (único renombrado real).
- `--accent-2` (magenta) es una variable **nueva** — spec 008 solo tenía un acento. No hay nada que mapear.
- Las rampas tonales de 9 pasos (`--accent-100…900`, `--accent-2-100…900`, `--neutral-100…900`) son **nuevas** — spec 008 solo tenía `--accent-bg`/`--accent-border` (2 tintas). Se añaden tal cual las da el handoff.
- Los 4 niveles de estado de spec 007 (`--status-green/amber/orange/red`, usados por `ProgressBar`/`goals-shared.ts` para objetivos y presupuestos) **no se tocan** — no forman parte del sistema del handoff (que solo distingue 2 estados, "en curso"/"excedido") y son una decisión de negocio (4 umbrales), no de estilo. Se mantiene su lógica y sus valores; ver §5.

**Alcance del cambio de convención (className):** las clases de componente (`.card`, `.btn-*`, `.tag-*`, `.seg`, `.field`/`.input`, `.table`) se aplican a **las 8 pantallas autenticadas y a `AppLayout`**, que es lo que cubren las historias de `spec.md`. Las páginas sin menú lateral (login, registro, verificación, recuperación de contraseña...) **no** se tocan en su JSX — siguen con los selectores genéricos `main form`/`input`/`button` de spec 007/008, y heredan el nuevo aspecto solo a través de los tokens globales (mismo criterio que ya aplicó spec 008 §H1 criterio 2: "son variables CSS, toda página hereda el cambio"). Esto es una decisión de alcance, documentada aquí igual que la "Nota de alcance" de spec 008 — no un olvido.

## 1. Tokens (`frontend/src/index.css`, bloque `:root`)

```css
:root {
  /* Spec 010 (rediseño editorial). Antes (spec 008): paleta cálida +
     acento azul-verdoso. Ahora: papel/tinta + acentos cian/magenta del
     handoff de Claude Design, valores finales (README §Fidelity). */
  --text: #201e1d;
  --text-h: #201e1d;       /* antes distinguía cuerpo/titular; el handoff usa la misma tinta para ambos */
  --bg: #f3f2f2;
  --border: color-mix(in srgb, #201e1d 16%, transparent); /* --color-divider del handoff */
  --code-bg: #eae9e9;      /* --color-surface del handoff, reutilizado */
  --card-bg: #eae9e9;      /* mismo valor que --code-bg: el handoff usa una única superficie */
  --accent: #0088b0;
  --accent-bg: var(--accent-100);
  --accent-border: var(--accent-400);
  --accent-2: #d6006c;

  /* Rampas tonales OKLCH de 9 pasos, tal cual el handoff (nuevas). */
  --neutral-100: #f8f4f4; --neutral-200: #eae7e7; --neutral-300: #d7d3d3;
  --neutral-400: #bab6b6; --neutral-500: #9b9797; --neutral-600: #7d7979;
  --neutral-700: #605d5d; --neutral-800: #444141; --neutral-900: #2d2b2b;

  --accent-100: #e9f8ff; --accent-200: #cbeeff; --accent-300: #99e0ff;
  --accent-400: #62c5ee; --accent-500: #38a6cf; --accent-600: #1186ac;
  --accent-700: #006786; --accent-800: #004961; --accent-900: #0a303e;

  --accent-2-100: #fff1f4; --accent-2-200: #ffdee6; --accent-2-300: #ffc0d0;
  --accent-2-400: #ff90b1; --accent-2-500: #ff458e; --accent-2-600: #d82071;
  --accent-2-700: #aa0b56; --accent-2-800: #790e3d; --accent-2-900: #4b1528;

  /* Spec 007, sin cambios — 4 niveles de estado, ajenos al handoff (§5). */
  --status-green: #1baf7a; --status-amber: #d6a92a;
  --status-orange: #eb6834; --status-red: #d64545;

  --sans: system-ui, 'Segoe UI', Roboto, sans-serif; /* ya no se usa para cuerpo de texto, ver --font-body */
  --font-body: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --heading: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --mono: ui-monospace, Consolas, monospace;

  /* Espaciado del handoff — sustituye a los valores sueltos (32px 40px,
     16px, 24px...) usados desde spec 007/008 por una escala con nombre. */
  --space-1: 5px; --space-2: 10px; --space-3: 15px; --space-4: 20px;
  --space-6: 30px; --space-8: 40px;

  --radius-sm: 1px; --radius-md: 2px; --radius-lg: 4px;
  --shadow-sm: 0 1px 2px color-mix(in srgb, #2d2b2b 14%, transparent);
  --shadow-md: 0 3px 10px color-mix(in srgb, #2d2b2b 16%, transparent);

  font: 15px/155% var(--font-body); /* antes 18px/145% var(--sans) */
  letter-spacing: normal;           /* el handoff no usa tracking negativo en cuerpo */
  ...                                /* color-scheme/antialiasing sin cambios */
}
```

- `@import url(.../Source+Serif+4...)` se añade al principio de `index.css`, igual que hace `broadsheet-styles.css`.
- `h1{font-size:42px}`, `h2{32px}`, `h3{25px}`, `h4{20px}` (antes 56px/24px, spec 008) — se ajustan las reglas existentes de `h1,h2` con estos tamaños; se añaden `h3,h4,h5,h6` (no existían reglas propias antes, heredaban del navegador).
- **Modo oscuro**: el handoff no define uno (mismo caso que spec 008). Se deriva con el mismo criterio ya usado (invertir luminosidad, mantener matiz): `--bg:#1c1b1a`, `--text/--text-h:#efeceb`, `--border` con el mismo `color-mix` sobre el texto claro, `--card-bg:#28211f`-ish, rampas de acento con los pasos 400-600 intercambiados por sus opuestos (300↔700, etc., mismo patrón que spec 008 §1). Se ajusta durante la implementación y se verifica visualmente (T de cierre), no se calcula aquí al dígito exacto.
- Los breakpoints de spec 009 (768px) y spec 008 (1024px, tamaño de letra) no cambian.

## 2. Componentes CSS nuevos (adoptados tal cual del handoff, con ajustes de nombre de variable)

Se añaden a `index.css` las clases de `broadsheet-styles.css` que sí se usan en alguna de las 8 pantallas (ver `spec.md §5` sobre las clases `.cmyk*`/`.halftone`, que se excluyen por completo):

- `.card`, `.card-kicker`, `.card-title`, `.card-body`, `.card-meta`, `.elev-sm`, `.elev-md`
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-block`
- `.tag`, `.tag-accent`, `.tag-accent-2`, `.tag-neutral`
- `.seg`, `.seg-opt`
- `.field`, `.input`
- `.table` (mapeada sobre el `main table` genérico ya existente, ver §4.6)
- `.hr`
- `.nav-link` (para los enlaces del menú lateral, sustituye a los estilos inline que generaba el prototipo)

Se portan literalmente desde `broadsheet-styles.css`, sustituyendo `--color-*` por los nombres ya existentes del proyecto (`--color-bg`→`--bg`, `--color-text`→`--text`, `--color-accent`→`--accent`, `--color-accent-2`→`--accent-2`, `--color-divider`→`--border`, `--color-surface`→`--card-bg`, `--color-neutral-*`→`--neutral-*`, `--color-accent-*`→`--accent-*`, `--font-heading`/`--font-body`→ los mismos nombres, ya alineados). Se documenta en el propio CSS, mismo criterio que las notas de spec 007/008/009 ya presentes en el fichero.

Las 4 excepciones a "sin className" ya existentes (`.dot`/`.dot-accent`, `.progress-bar`*, `.sr-only`) se mantienen sin cambios de nombre — solo heredan los nuevos valores de color por variable.

## 3. Menú lateral (`AppLayout.tsx` + CSS)

- **Ancho**: pasa de fijo 220px a **236px expandido / 68px plegado**, con `transition: width .18s ease` (el handoff sí anima el ancho; hasta ahora `isCollapsed` solo ocultaba el texto — ver `frontend/src/index.css`, no había ninguna regla de ancho condicionada al plegado). Se añade `data-collapsed={isCollapsed}` a `#app-sidebar` (mismo patrón que `data-mobile-open` de spec 009, sin introducir una clase nueva):
  ```css
  #app-sidebar { width: 236px; overflow: hidden; transition: width .18s ease; }
  #app-sidebar[data-collapsed='true'] { width: 68px; }
  ```
- El botón de plegar pasa a usar `.btn.btn-secondary` (antes sin clase). La marca "Ledger" (spec 008 H4) y el botón de cerrar sesión (`.btn.btn-secondary`) se mantienen.
- Cada enlace de navegación usa `.nav-link` en vez de estilos ad-hoc; el color de acento en el enlace activo sigue siendo un selector por descendencia (`#app-sidebar a[aria-current='page']`), no una clase que React añada — mismo criterio ya usado.
- **Spec 009 (menú móvil)**: el botón `#app-mobile-menu-toggle`, el backdrop `#app-sidebar-backdrop` y el atributo `data-mobile-open` no cambian de mecanismo, solo heredan el nuevo color/tipografía. Se revisa en la tarea de cierre que el menú superpuesto se siga abriendo/cerrando igual (H11 criterio 1) — la única duda real es si 236px (antes 220px) sigue cabiendo bien en el `min(280px, 82vw)` que ya limitaba el ancho del panel en móvil (sí: 236 < 280).

## 4. Pantalla a pantalla

### 4.1 Inicio (`HomePage.tsx`)

- `#home-summary > div` (spec 008) se sustituye por tarjetas `.card.elev-sm` con `.card-kicker` (antes `p:first-child`) y el importe grande ya no necesita una regla `id`-específica: se usa un `<div>` con estilo inline de tamaño (como el propio handoff hace) o una clase `.card-amount` nueva de 4 líneas — se decide en la tarea según qué quede más legible en el JSX, sin más excepciones a "sin className" de las ya asumidas.
- `#home-recent-list li` se mantiene con su propio `id` (no es parte del sistema de tarjetas del handoff, es una lista con punto de color) — solo cambia de color/tipografía por herencia de tokens.
- Se conserva todo lo que no aparece en el handoff (H3 criterio 3: objetivo de ahorro, estado vacío, aviso de verificación pendiente) sin tocar su estructura, solo heredando los tokens nuevos.

### 4.2 Categorías (`CategoriesPage.tsx`)

- La lista de spec 009 (`<ul id="categories-income-list">`/`<ul id="categories-expense-list">` con `<li>` apilables) se reestructura a una cuadrícula de `.card.elev-sm` (`display:grid;grid-template-columns:repeat(3,1fr)`, `max-width:900px`, como el handoff), una tarjeta por categoría de nivel superior.
- Dentro de cada tarjeta: punto de color + `.card-title` (nombre), `.card-body` (nº de movimientos — dato que hoy no calcula `CategoriesPage`, ver nota), `.card-meta` con importe y % (mismos datos que ya expone `DashboardPage` vía `byCategoryChartData`, pero `CategoriesPage` hoy no los pide). **Nota de reconciliación real**: el handoff asume que "Categorías" muestra agregados de gasto (nº movimientos, importe, %) que hoy solo calcula el backend para `DashboardPage` (`GET /dashboard/monthly`); para no inventar un endpoint nuevo fuera de esta spec (que es puramente visual), `CategoriesPage` reutiliza `getMonthlySummary`/`getMonthlyByCategory` ya existente (mismo patrón que `HomePage` en spec 008, que también reutilizó endpoints ya existentes) para pintar esos 3 datos; si una categoría no tiene movimientos este mes, se muestra "0 movimientos" / "0,00 €" / "0%" en vez de ocultarla.
- Las acciones existentes (crear con tipo/categoría padre, renombrar inline, eliminar) se añaden dentro de cada `.card` como una segunda fila con `.btn-secondary`/`.btn-ghost` (Renombrar/Eliminar), igual que el patrón de fila de acciones de las tarjetas de Movimientos del propio handoff. El formulario de "Crear categoría" ya existente se envuelve en `.field`/`.input`, fuera de la cuadrícula (como hoy, debajo).
- Subcategorías: la cuadrícula 3×3 del handoff no contempla anidamiento. Se mantienen como una sub-lista simple dentro de la tarjeta del padre (`.card-body` con una lista de `.tag-neutral`, una por subcategoría, en vez del `<ul>` anidado de hoy) — visual nuevo, mismo dato.

### 4.3 Ingresos y gastos (`MovementsListPage.tsx`, `MovementsLayout.tsx`)

- El control Gastos/Ingresos (hoy `<label class="radio">`, spec 002) pasa a `.seg`/`.seg-opt` tal cual el handoff (misma estructura de `<input type=radio oculto> + texto`, solo cambia el envoltorio y el CSS).
- Los filtros (`<div><label>...<input>`) pasan a `.field`/`.input`, en una rejilla de 4 columnas `max-width:900px` (ya es prácticamente el layout actual, solo cambia la clase).
- Cada fila de movimiento (reestructurada en spec 009 T3 en 3 `<div>`) pasa a una `.card` con `flex-direction:row` (como el handoff), sin volver a los `<span>` sueltos de antes de spec 009 — se reutiliza el agrupamiento en `<div>` ya hecho, solo cambian las clases del contenedor y se añade `.tag.tag-neutral` para la categoría (hoy es un `<span>` con `·`).
- El botón "+ Añadir movimiento" (`.btn.btn-primary`) enlaza a `/movements/register` (ya existente vía `MovementsLayout`), no crea un formulario inline nuevo.
- Se mantienen las pestañas Movimientos/Resumen/Registrar de `MovementsLayout` (spec 006), con sus `<a>` ahora usando `.nav a` en vez de estilos por defecto del navegador (mismo problema que spec 008 T8 corrigió para el menú lateral: enlaces sin estilo propio se ven azul/subrayado — aquí se corrige desde el principio).

### 4.4 Dashboard (`DashboardPage.tsx`)

- Los gráficos de Recharts (barras mensuales, línea anual) **no se sustituyen** por los divs coloreados del handoff (H6 criterio 1) — se les pasa la nueva paleta como props de color (`COLOR_INCOME`/`COLOR_EXPENSE`/`COLOR_SAVINGS`, hoy definidas en el propio fichero) actualizada a `--accent-300`/`--neutral-600`/`--accent`/`--accent-2` según corresponda, y `fontFamily`/`fontSize` de los ejes/leyenda a Source Serif 4 vía las opciones de Recharts.
- El desglose "Gasto por categoría" (hoy una `<table>` con `data-label` para apilar en móvil, spec 009 T6) se sustituye por la lista de barra de progreso de 8px del handoff — esto **reemplaza** la técnica `data-label`/tabla responsive de spec 009 (que deja de hacer falta: una lista de `<div>` con barra ya se apila de forma natural en cualquier ancho, sin necesitar la cabecera oculta ni `::before`). Se documenta como sustitución, no como regresión: la información (categoría + importe) se conserva, solo cambia de tabla a lista con barra.
- La vista anual (tabla de evolución mensual) se mantiene como tabla — el handoff no la representa — pero pasa a usar la clase `.table` en vez del selector genérico `main table`; la técnica `data-label` de spec 009 T6 se mantiene para esta tabla en concreto, ya que sigue siendo una tabla real de 4 columnas.

### 4.5 Importar Excel (`ImportPage.tsx`)

- La zona de "1. Seleccionar fichero" adopta el borde discontinuo y el botón primario del handoff.
- Los pasos 2 (vista previa) y 3 (confirmación/completado), que el handoff no representa, mantienen su estructura (`<section>`/`<h2>`/`<h3>`) mostrando la tabla de vista previa con `.table` y los botones con `.btn-primary`/`.btn-secondary`.
- No hay "importaciones recientes" en el backend actual (el handoff lo muestra, pero no existe ya un endpoint de historial de importaciones) — **no se inventa** esa sección; se documenta como diferencia con el handoff, coherente con "esta spec no cambia datos ni endpoints" (`spec.md §4`).

### 4.6 Objetivos y presupuestos (`GoalsPage.tsx`)

- Cada bloque de objetivo/presupuesto pasa a `.card.elev-sm` con `.card-title` (nombre) y una etiqueta de estado (`.tag`) — ver §5 para el mapeo de color.
- La barra de progreso sigue siendo el componente `ProgressBar` ya existente (`.progress-bar`/`.progress-bar-fill`) — no se sustituye por una nueva, solo se ajusta su altura/radio a los 8px del handoff si no coincide ya.
- Los formularios de crear/editar objetivo y presupuesto (spec 004) pasan a usar `.field`/`.input`/`.btn-primary`, sin cambiar su lógica.

### 4.7 Tu perfil (`ProfilePage.tsx`)

- "Datos de la cuenta" pasa a `.card.elev-sm` con `.field`/`.input`; el campo de correo se muestra como texto de solo lectura con el estilo `.field > label` + un `<p>` (no un `<input disabled>`, para no sugerir que es editable) — igual que hoy, ya es un párrafo, no un input (ver `constitution.md`, T7.1: `PATCH /users/me` no acepta email).
- "Cambiar contraseña", "Mi cuenta" (exportar) y "Eliminar cuenta" pasan a sus propias `.card`, con `.btn-primary`/`.btn-secondary`/`.btn-ghost` según la acción (eliminar cuenta usa un botón de aspecto más discreto, no primario, para no invitar al clic accidental — decisión de estilo, no de comportamiento).

### 4.8 Dispositivos y sesiones (`SessionsPage.tsx`)

- Cada `<li>` (ya reestructurado en spec 009 T5 en 2 `<div>`) pasa a `.card` con `flex-direction:row`, `.tag.tag-accent` para "Esta sesión" (dato ya existente: comparar con la sesión actual — **nota**: `constitution.md` T6.2 documenta que `isCurrent` se implementó y se retiró por no poder identificarse de forma fiable en el navegador real; si esa limitación sigue vigente, la etiqueta "Esta sesión" del handoff **no se implementa** hasta que exista esa información real — no se inventa un dato que la app no puede calcular hoy. Se confirma el estado exacto de esa limitación al empezar la tarea correspondiente).

## 5. Objetivos/presupuestos: reconciliar 4 niveles de estado con 2 colores de etiqueta

`goals-shared.ts` calcula 4 niveles (`ok`/`near`/`warning`/`over`) con dirección (`budget`/`savings`) — spec 007, decisión de negocio, no se toca. El handoff solo define 2 estilos de etiqueta (`tag-accent` cian / `tag-accent-2` magenta). Se agrupan así para la etiqueta de texto (la barra de progreso sigue mostrando los 4 colores exactos vía `--status-*`, sin pérdida de información):

- `ok`/`near` → `.tag.tag-accent`, texto "En curso".
- `warning`/`over` → `.tag.tag-accent-2`, texto "Excedido" (presupuesto) / el texto que ya calcule `statusLabel` para objetivos de ahorro.

Esto es una simplificación deliberada de la etiqueta (de 4 a 2 grupos), no de la barra de progreso (que conserva los 4 colores) ni del cálculo (que no cambia). Se documenta aquí para que quede explícito, no implícito en el código.

## 6. Impacto en spec 009 (móvil)

- El menú superpuesto (botón, backdrop, `data-mobile-open`) no cambia de mecanismo — solo de color/tamaño de sidebar (236px en vez de 220px, ya contemplado en `min(280px, 82vw)`).
- Los listados que spec 009 apiló con `display:flex;flex-direction:column` sobre `<li>`/`<div>` (Movimientos, Categorías, Dispositivos) pasan a apilarse igual pero sobre `.card` en vez de `<li>` — la regla CSS se reescribe apuntando a la nueva estructura (`#movements-list .card`, etc., o directamente una regla común si todas comparten `.card` con `flex-direction:row` en escritorio → `column` en móvil).
- La tabla de "Gasto por categoría" del Dashboard, que spec 009 T6 hizo responsive con `data-label`, deja de ser una tabla (§4.4) — dejará de necesitar esa técnica; la tabla de "Evolución mensual" (vista anual) sigue siendo tabla y conserva `data-label`.
- Se repite la misma verificación visual de spec 009 (Playwright, 390px/430px, con y sin menú abierto) sobre las 8 pantallas ya rediseñadas, como parte del cierre de esta spec (H11).

## 7. Casos de prueba

- Automatizados: los tests existentes de cada página (`*.test.tsx`) no deberían cambiar de intención — comprueban texto/roles accesibles, no clases CSS ni estructura visual exacta; se revisan tras cada tarea y se ajustan solo si un cambio de estructura (p. ej. Categorías a cuadrícula) mueve un texto de sitio de forma que un `getByText`/`within` deje de ser único.
- Nuevo: un test en `CategoriesPage.test.tsx` que confirme que la cuadrícula muestra nº de movimientos/importe/% cuando hay datos del mes, y valores en cero cuando no los hay (H4, reconciliación de §4.2).
- Manual/visual (Playwright, mismo patrón que spec 008 T8/spec 009 T8): las 8 pantallas en claro y oscuro, en escritorio (1440px) y móvil (390px/430px), menú expandido/plegado/abierto en móvil — confirmando que ninguna pierde funcionalidad real (checklist por historia, igual que specs anteriores) y que no hay regresión de spec 009.

---
**Pendiente de aprobación por Diego.** Siguiente paso: `tasks.md`.
