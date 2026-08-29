# Plan — Spec 009 (Adaptación a móvil)

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Punto de partida

Todo lo de spec 008 (tokens, layout a ancho completo, `#app-sidebar` de 220px,
`.dot`, marca "Ledger") se mantiene tal cual en escritorio. Esta spec añade
una capa de CSS condicionada por ancho de pantalla, más los cambios de JSX
mínimos que una capa solo-CSS no puede resolver (H1, y parte de H3).

**Breakpoint único: `768px`** (`max-width: 768px` en todas las reglas nuevas).
Motivos:
- Es más ancho que el rango de verificación de la spec (360-430px), da
  margen y evita que un móvil "grande" en horizontal quede a medio camino
  entre el layout de escritorio y el de móvil.
- Ya existe un precedente en el propio CSS (`@media (max-width: 1024px)`
  para el tamaño de letra, spec 007/008) — un segundo breakpoint más
  estrecho y dedicado a móvil no choca con él, ambos pueden estar activos a
  la vez por debajo de 768px (letra base 16px + reglas de móvil encima).
- Coincide con la condición de "fuera de alcance" de `spec.md §3`: no se
  diseña un rango de tablet a propósito — todo lo que no es ≤768px se trata
  como escritorio, sin un tercer estado intermedio.

Todas las reglas nuevas se añaden a `frontend/src/index.css` dentro de
`@media (max-width: 768px)`, agrupadas por sección con comentario, siguiendo
el mismo estilo que el resto del fichero (reglas por `id`, sin clases nuevas
salvo que ya exista una excepción justificada).

## 1. H1 — Menú lateral en móvil (`AppLayout.tsx`)

**Diseño:** panel superpuesto ("hamburguesa"), no franja de iconos —
decisión ya tomada con Diego. Requiere JSX nuevo, no solo CSS, porque:
- El botón de plegar/desplegar actual ("Ocultar/Mostrar menú") vive *dentro*
  de `#app-sidebar`; si el panel entero se oculta fuera de pantalla en
  móvil, ese botón deja de ser alcanzable. Hace falta un control nuevo,
  fuera de `#app-sidebar`, siempre presente.
- Abrir/cerrar el panel en móvil es un concepto distinto de
  plegar/desplegar en escritorio (`isCollapsed`): no reutiliza ese estado.

### 1.1 Estado nuevo en `AppLayout.tsx`

```tsx
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
const toggleButtonRef = useRef<HTMLButtonElement>(null);
const sidebarRef = useRef<HTMLElement>(null);

function closeMobileMenu() {
  setIsMobileMenuOpen(false);
}
```

- `isCollapsed` no cambia de significado — sigue rigiendo solo el
  comportamiento de escritorio (H1 criterio 4: no cambia).
- `isMobileMenuOpen` es independiente; en escritorio no tiene efecto visual
  (las reglas que lo usan solo existen dentro del `@media (max-width:
  768px)`).

### 1.2 JSX nuevo

- Botón de apertura, **fuera** de `#app-sidebar`, hermano de `#app-shell`
  (visible siempre en el árbol; se oculta por CSS en escritorio):

  ```tsx
  {showSidebar && (
    <button
      type="button"
      id="app-mobile-menu-toggle"
      ref={toggleButtonRef}
      aria-expanded={isMobileMenuOpen}
      aria-controls="app-sidebar"
      onClick={() => setIsMobileMenuOpen((open) => !open)}
    >
      {isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
    </button>
  )}
  ```

  Se renderiza antes de `#app-shell`, mismo nivel. Nombre accesible propio
  (texto visible), no depende de `.sr-only`.

- Fondo/backdrop, solo montado mientras el menú está abierto (igual que
  `showSidebar` ya condiciona el montaje de `#app-sidebar`):

  ```tsx
  {isMobileMenuOpen && (
    <div id="app-sidebar-backdrop" onClick={closeMobileMenu} />
  )}
  ```

- `#app-sidebar` pasa a llevar `ref={sidebarRef}` y un atributo de estado
  (no clase, mismo criterio "sin className" que el resto del proyecto):

  ```tsx
  <nav id="app-sidebar" aria-label="Navegación principal" ref={sidebarRef} data-mobile-open={isMobileMenuOpen}>
  ```

  En escritorio, `data-mobile-open` no se usa en ningún selector — es
  invisible para el CSS de escritorio existente.

- Cada `NavLink` y el botón de "Cerrar sesión" añaden `onClick`:
  `onClick={closeMobileMenu}` (además del `onClick` que ya tenga, en el caso
  de logout: `onClick={() => { closeMobileMenu(); void logout(); }}`). En
  escritorio esto no tiene efecto observable (el menú "abierto" en móvil ya
  está en `false`).

- El botón existente de plegar/desplegar (`isCollapsed`) no se toca en JSX;
  se oculta por CSS bajo 768px (ver 1.3), porque en móvil el concepto de
  "colapsado a franja estrecha" no aplica (criterio: el panel está oculto
  del todo o abierto a un ancho legible, no hay estado intermedio).

### 1.3 CSS nuevo

```css
#app-mobile-menu-toggle {
  display: none; /* oculto en escritorio */
}

@media (max-width: 768px) {
  #app-mobile-menu-toggle {
    display: inline-flex;
    /* posición fija arriba a la izquierda, siempre alcanzable */
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 30;
  }

  /* Oculta el botón de plegar/desplegar de escritorio: en móvil el panel
     está oculto del todo o abierto a ancho completo, no hay colapsado. */
  #app-sidebar > button {
    display: none;
  }

  #app-sidebar {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 25;
    width: min(280px, 82vw);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    background: var(--bg);
    overflow-y: auto;
  }
  #app-sidebar[data-mobile-open='true'] {
    transform: translateX(0);
  }

  #app-sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 20;
  }

  /* El botón de apertura queda por encima del panel para poder cerrarlo
     con el mismo control (aria-expanded ya indica el cambio de estado). */
  #app-content {
    padding: 72px 20px 20px; /* deja hueco para el botón fijo */
  }
}
```

Notas:
- `#app-sidebar > button` selecciona el botón de plegado por posición
  (primer/único `<button>` hijo directo, antes de la lista) sin clase
  nueva — coherente con el resto de selectores del fichero
  (`#home-summary > div > p:first-child`, etc.).
- `z-index` del panel (25) por encima del backdrop (20) y ambos por encima
  del contenido normal; el botón de apertura (30) por encima del panel para
  que su área de toque no quede tapada al abrir.
- No se anima el backdrop (aparición/desaparición instantánea vía montaje
  condicional) para no complicar el manejo del foco descrito en 1.4.

### 1.4 Foco y teclado (accesibilidad ligera, no un focus-trap completo)

- **Al abrir** (`isMobileMenuOpen` pasa a `true`): mover el foco al primer
  enlace del menú (`sidebarRef.current?.querySelector('a')?.focus()`) en un
  `useEffect` con `[isMobileMenuOpen]` como dependencia.
- **Al cerrar** (por cualquier vía: botón, backdrop, Escape, clic en un
  enlace): devolver el foco al botón de apertura
  (`toggleButtonRef.current?.focus()`), también desde el mismo `useEffect`
  cuando `isMobileMenuOpen` pasa a `false` — con cuidado de no robar el foco
  la primera vez que el componente monta (guardar el valor anterior con un
  `useRef` o comprobar que no es el render inicial).
- **Escape** cierra el menú: un `useEffect` que añade/quita un listener de
  `keydown` en `document` solo mientras `isMobileMenuOpen` es `true`.
- No se implementa un focus-trap completo (ciclar Tab dentro del panel) —
  fuera de alcance explícito de esta spec (no se pidió); el criterio de
  aceptación H1.3 solo exige que el contenido de detrás no sea interactivo,
  lo que ya cumple el backdrop (intercepta los clics) combinado con que el
  contenido de detrás queda visualmente tapado. Se documenta como decisión
  de alcance en el propio commit.

### 1.5 Verificación de escritorio sin cambios (H1 criterio 4)

Ninguna regla de 1.3 tiene efecto fuera de `max-width: 768px`; `isCollapsed`
y su botón siguen exactamente igual arriba de ese ancho. Se verifica con los
tests existentes de `AppLayout.test.tsx` (plegado/desplegado) sin
modificarlos, más una revisión visual en escritorio tras el cambio.

## 2. H2 — Overflow, tipografía y formularios

Todo esto es CSS puro dentro de `@media (max-width: 768px)`, sin tocar JSX:

```css
@media (max-width: 768px) {
  h1 {
    font-size: 28px;
    letter-spacing: -0.6px;
    margin: 16px 0;
  }
  h2 {
    font-size: 18px;
  }

  main form {
    max-width: none;
  }

  /* Reduce el margen general a ancho de móvil (32px 40px es demasiado en
     360-430px de ancho). #root > main cubre las páginas sin menú lateral
     (spec 008 T8); #app-content ya se ajusta en 1.3 para el hueco del
     botón fijo. */
  #root > main {
    padding: 20px;
  }

  /* Evita que texto sin espacios (URLs largas, user-agents en
     SessionsPage, correos largos) fuerce scroll horizontal — no cambia el
     salto de línea de texto normal, solo actúa cuando una palabra sola no
     cabe. */
  main {
    overflow-wrap: anywhere;
  }
}
```

`overflow-wrap: anywhere` en `main` es la red de seguridad genérica de H2
(ninguna página provoca scroll horizontal); las páginas concretas de H3/H4
además reciben su propio tratamiento donde hace falta bloques, no solo
salto de palabra.

**Verificación:** captura a 390px de cada título de página autenticada
(8 páginas) para confirmar que ningún `h1`/`h2` se parte en una palabra por
línea con `font-size: 28px`/`18px`; si alguno concreto no cabe, se ajusta su
tamaño en la revisión visual de T-final, no se sobre-diseña de antemano.

## 3. H3 — Tablas y listados, por página

Regla general: por debajo de 768px, cada fila pasa de "columnas una junto a
otra" a "bloque apilado". Donde la fila ya está agrupada en elementos
(varios `<span>` o `<div>` hijos directos), basta con CSS
(`flex-direction: column`). Donde la fila es hoy una secuencia plana de
`<span>` sueltos con separadores de texto (" · ") directamente en el JSX,
no hay elemento que un `flex-direction: column` pueda apilar por separado —
hace falta agrupar esos campos en contenedores nuevos primero.

### 3.1 `HomePage.tsx` — `#home-recent-list li` (solo CSS)

Ya son 3 hijos directos (`.dot`, un `<span>` de concepto+meta, un `<span>`
de importe) — no es una tabla de columnas alineadas, es una fila tipo
"tarjeta" con texto que ya envuelve con `<br>`. No necesita bloque apilado
adicional: se revisa visualmente a 390px y, si el importe queda pegado al
texto, se añade `flex-wrap: wrap` y `margin-inline-start: 0` (en vez de
`auto`) para que cambie de línea en vez de comprimirse. Sin cambio de JSX.

### 3.2 `MovementsListPage.tsx` — restructurar el `<li>` (JSX + CSS)

Estado actual (`pages/MovementsListPage.tsx:181-199`): un único `<li>` con
`<span>`s y "·" sueltos, sin agrupar. Se reagrupa en dos bloques más las
acciones, cada uno un `<div>` (posición, no clase — igual criterio que
`#home-summary > div`):

```tsx
<ul id="movements-list">
  {result.items.map((t) => (
    <li key={t.id}>
      <div>
        <span>{t.date}</span> · <span>{categoryName(categories, t.categoryId)}</span>
        {t.subcategoryId && <span> / {categoryName(categories, t.subcategoryId)}</span>}
      </div>
      <div>
        <span>{t.concept}</span> · <span>{t.amount}</span>
        {t.merchant && <span> · {t.merchant}</span>}
        {t.paymentMethod && <span> · {PAYMENT_METHOD_LABELS[t.paymentMethod]}</span>}
      </div>
      <div>
        <button type="button" onClick={() => navigate(`/movements/register/${t.id}`)}>Editar</button>{' '}
        <button type="button" disabled={pendingDeleteId === t.id} onClick={() => void handleDelete(t.id)}>
          {pendingDeleteId === t.id ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </li>
  ))}
</ul>
```

Se añade `id="movements-list"` al `<ul>` (no lo tenía) para poder acotar el
CSS nuevo sin afectar a `main ul li` genérico. El texto visible y el orden
de la información no cambian (H3 criterio 3: cambio puramente presentacional
— reagrupar en `<div>` no altera qué se lee ni en qué orden, solo qué
elementos existen para que el CSS los apile).

```css
@media (max-width: 768px) {
  #movements-list li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
}
```

Tests a actualizar: `MovementsListPage.test.tsx` sigue comprobando el mismo
texto accesible (`getByText`, `getByRole('button', ...)`) — envolver en
`<div>` no cambia el texto ni el orden en el DOM, así que las aserciones
actuales deberían seguir en verde; se revisan igualmente al ejecutar
`npm run test` tras el cambio.

### 3.3 `CategoriesPage.tsx` — restructurar `renderCategory` (JSX + CSS)

Estado actual (`pages/CategoriesPage.tsx:137-181`): nombre, badge y botones
en una sola línea plana (fuera del modo edición). Se agrupa en dos bloques:

```tsx
<li key={category.id}>
  {isEditing ? (
    /* formulario de renombrado, sin cambios */
  ) : (
    <>
      <div>
        <span>{category.name}</span>
        {category.isDefault && <span> (por defecto)</span>}
      </div>
      <div>
        <button type="button" onClick={() => startRename(category)}>Renombrar</button>{' '}
        <button type="button" disabled={pendingDeleteId === category.id} onClick={() => void handleDelete(category.id)}>
          {pendingDeleteId === category.id ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </>
  )}
  {renameError && isEditing && <p role="alert">{renameError}</p>}
  {category.type === 'EXPENSE' && !category.parentId && childrenOf(category.id).length > 0 && (
    <ul>{childrenOf(category.id).map((child) => renderCategory(child))}</ul>
  )}
</li>
```

Se añade `id="categories-income-list"` / `id="categories-expense-list"` a
los dos `<ul>` de nivel superior (`pages/CategoriesPage.tsx:201,209` — hoy
sin id) para acotar el CSS; los `<ul>` anidados de subcategorías heredan la
regla por descendencia (`ul li`, sin necesitar su propio id):

```css
@media (max-width: 768px) {
  #categories-income-list li,
  #categories-expense-list li,
  #categories-income-list ul li,
  #categories-expense-list ul li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
}
```

### 3.4 `SessionsPage.tsx` — restructurar el `<li>` (JSX + CSS)

Estado actual (`pages/SessionsPage.tsx:96-107`): user-agent, IP, última
actividad y botón en una sola línea. El user-agent es la cadena con más
riesgo real de desbordar (puede no tener espacios en tramos largos), así
que además del bloque propio lleva `overflow-wrap: anywhere` explícito (la
regla genérica de H2 en `main` ya lo cubriría, pero se declara aquí también
por claridad de intención, igual que otras reglas de esta spec que
refuerzan puntualmente casos ya cubiertos por la regla general):

```tsx
<ul id="sessions-list">
  {sessions.map((session) => (
    <li key={session.id}>
      <div>
        <span>{session.userAgent ?? 'Dispositivo desconocido'}</span>
        {session.ipAddress && <span> · {session.ipAddress}</span>}
        <span> · última actividad: {formatDateTime(session.lastUsedAt)}</span>
      </div>
      <div>
        <button type="button" disabled={revokingId === session.id} onClick={() => void handleRevoke(session.id)}>
          {revokingId === session.id ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </li>
  ))}
</ul>
```

```css
@media (max-width: 768px) {
  #sessions-list li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }
  #sessions-list li > div:first-child {
    overflow-wrap: anywhere;
  }
}
```

### 3.5 `DashboardPage.tsx` — las dos `<table>` (JSX + CSS, técnica `data-label`)

Las tablas (`pages/DashboardPage.tsx:201-217` y `260-280`) son la única
estructura realmente tabular (columnas alineadas con cabecera). Se aplica
la técnica estándar de tabla responsive con `data-label`, que apila cada
fila en un bloque sin tocar la semántica de tabla para lectores de
pantalla (el `<table>`/`<th scope="col">` no cambian, solo su presentación
visual bajo el breakpoint):

```tsx
<tr key={entry.name}>
  <td data-label="Categoría">{entry.name}</td>
  <td data-label="Total">{entry.total.toFixed(2)}</td>
</tr>
```

```tsx
<tr key={entry.month}>
  <td data-label="Mes">{entry.month}</td>
  <td data-label="Ingresos">{entry.income}</td>
  <td data-label="Gastos">{entry.expense}</td>
  <td data-label="Ahorro">{entry.savings}</td>
</tr>
```

```css
@media (max-width: 768px) {
  main table thead {
    /* Oculta visualmente la cabecera sin quitarla del árbol de
       accesibilidad — mismas propiedades que .sr-only (spec 007), pero
       aplicadas por selector de descendencia en vez de reutilizar la
       clase: thead no es un elemento que hoy lleve className en ningún
       componente. */
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  main table,
  main table tbody,
  main table tr {
    display: block;
    width: 100%;
  }
  main table tr {
    margin-bottom: 12px;
  }
  main table td {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 4px;
    border-bottom: none;
  }
  main table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--text-h);
  }
}
```

`main table` (no un id nuevo) porque ambas tablas de `DashboardPage` ya
comparten el selector genérico de `index.css:242`; no hay otras tablas en
la app hoy, así que acotar por `main table` es equivalente a acotar a
Dashboard sin necesitar un id nuevo.

## 4. H4 — Auditoría de páginas sin menú lateral

Páginas fuera de `AppLayout` (`App.tsx:48-54`): `RegisterPage`,
`VerifyEmailPage`, `ResendVerificationPage`, `LoginPage`,
`OAuthCallbackPage`, `ForgotPasswordPage`, `ResetPasswordPage`. Todas
comparten `#root > main` (spec 008 T8), así que las reglas de §2
(padding, `h1`/`h2`, `overflow-wrap`) ya se les aplican sin cambio
adicional. La auditoría (parte de tasks.md, no de este plan) es visual:
capturar cada una a 390px y 430px y comprobar los mismos tres criterios de
H2 (sin scroll horizontal, sin partir palabras en el título, formulario a
ancho completo — ya cubierto por `main form { max-width: none }`).
`LoginPage` se usó ya para autenticar en las capturas previas de esta
spec, pero no se revisó específicamente su propio layout a ese ancho — se
audita igual que el resto, sin darla por buena de antemano.

## 5. Resumen de ficheros a tocar

- `frontend/src/components/AppLayout.tsx` — estado `isMobileMenuOpen`,
  refs, botón de apertura, backdrop, atributo `data-mobile-open`,
  `onClick` de cierre en enlaces/logout, `useEffect` de foco y Escape.
- `frontend/src/pages/MovementsListPage.tsx` — reagrupar el `<li>` en
  `<div>`s; añadir `id="movements-list"`.
- `frontend/src/pages/CategoriesPage.tsx` — reagrupar `renderCategory` en
  `<div>`s; añadir `id` a los dos `<ul>` de nivel superior.
- `frontend/src/pages/SessionsPage.tsx` — reagrupar el `<li>` en `<div>`s;
  añadir `id="sessions-list"`.
- `frontend/src/pages/DashboardPage.tsx` — añadir `data-label` a los 6+4
  `<td>` de las dos tablas.
- `frontend/src/index.css` — todas las reglas nuevas, agrupadas dentro de
  `@media (max-width: 768px)` por sección (menú, tipografía/formularios,
  cada listado, tablas), más `#app-mobile-menu-toggle { display: none }`
  fuera del media query (para escritorio).
- Tests a actualizar/añadir: `AppLayout.test.tsx` (abrir/cerrar el menú
  móvil, Escape, backdrop, foco, y confirmar que el comportamiento de
  escritorio no cambia), `MovementsListPage.test.tsx`,
  `CategoriesPage.test.tsx`, `SessionsPage.test.tsx` (ajustar selectores si
  hiciera falta tras envolver en `<div>`, y confirmar que el texto/orden
  accesible no cambia), `DashboardPage.test.tsx` (confirmar que
  `data-label` no cambia el texto de las celdas, solo añade un atributo).

## 6. Casos de prueba (además de lo ya cubierto en `tasks.md`)

- **Automatizados (Vitest/Testing Library):**
  - `AppLayout`: el botón "Abrir menú" existe y empieza con
    `aria-expanded="false"`; al pulsarlo pasa a `"true"` y `#app-sidebar`
    recibe `data-mobile-open="true"`; un clic en el backdrop o pulsar
    Escape lo cierra; un clic en un enlace de navegación también lo cierra;
    el comportamiento de `isCollapsed` (tests ya existentes) no cambia.
  - Cada página con listado reestructurado: el texto visible y los botones
    siguen siendo los mismos tras envolver en `<div>` (no debería requerir
    tests nuevos, solo confirmar que los existentes siguen en verde).
  - `DashboardPage`: los valores de cada `<td>` siguen siendo accesibles
    por `getByText`/`getByRole('cell', ...)` con `data-label` presente.
- **Manual/visual (Playwright a 390×844 y 430×932, claro y oscuro,
  reutilizando el patrón de script de spec 008 T8 con navegación SPA en vez
  de recargas):**
  - Las 8 páginas autenticadas: menú cerrado por defecto, se abre con el
    botón, tapa el contenido con el backdrop, se cierra con backdrop/enlace/
    Escape; sin scroll horizontal en ninguna; títulos sin partir palabras;
    formularios a ancho completo; listados/tablas apiladas en bloque sin
    perder botones de acción.
  - Las 7 páginas sin menú lateral: sin scroll horizontal; formulario a
    ancho completo; título sin partir palabras.
  - Confirmar en escritorio (1440px, capturas ya existentes de spec 008 T8
    como referencia) que nada cambia visualmente.

---
**Pendiente de aprobación por Diego.** Siguiente paso tras aprobar:
`tasks.md` (desglose en tareas, una por commit, con su criterio de
aceptación).
