# Tasks — Spec 009 (Adaptación a móvil)

**Estado:** Cerrada
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

Cada tarea = un commit (Conventional Commits), validada contra su criterio
antes de pasar a la siguiente (`constitution.md §1`). Tras cada tarea:
`npm run test` (frontend) y `npx oxlint` en el/los ficheros tocados;
`npm run build` al final de todo (T8, misma rutina desde spec 007).

## T1 — Menú lateral en móvil (H1)

- `frontend/src/components/AppLayout.tsx`: estado `isMobileMenuOpen`, refs
  `toggleButtonRef`/`sidebarRef`, botón `#app-mobile-menu-toggle` fuera de
  `#app-sidebar`, `<div id="app-sidebar-backdrop">` condicional,
  `data-mobile-open` en `#app-sidebar`, `onClick` de cierre en cada
  `NavLink` y en "Cerrar sesión", `useEffect` de foco (al abrir → primer
  enlace; al cerrar → botón de apertura, sin robar el foco en el montaje
  inicial) y `useEffect` de Escape (`plan.md §1.1-1.4`).
- `frontend/src/index.css`: reglas de `plan.md §1.3` dentro de
  `@media (max-width: 768px)`, más `#app-mobile-menu-toggle { display: none
  }` fuera del media query.
- `frontend/src/components/AppLayout.test.tsx`: tests nuevos — el botón
  "Abrir menú" existe con `aria-expanded="false"`; al pulsarlo,
  `aria-expanded="true"` y `#app-sidebar` con `data-mobile-open="true"`;
  clic en el backdrop cierra el menú; pulsar Escape cierra el menú; clic en
  un enlace de navegación cierra el menú; los tests existentes de
  plegado/desplegado (`isCollapsed`) siguen pasando sin modificarse (H1
  criterio 4).
- **Criterio de aceptación**: H1 criterios 1 a 4 de `spec.md` cumplidos;
  `npm run test` en verde.

## T2 — Overflow, tipografía y formularios en móvil (H2)

- `frontend/src/index.css`: reglas de `plan.md §2` dentro de
  `@media (max-width: 768px)` (`h1`/`h2` más pequeños, `main form
  { max-width: none }`, `#root > main { padding: 20px }`, `main
  { overflow-wrap: anywhere }`); `#app-content` ya se ajusta en T1 (hueco
  del botón fijo).
- **Criterio de aceptación**: `npm run test` sigue en verde (ningún test
  depende de tamaños de letra ni de `max-width`); revisión visual manual a
  390px de al menos 3 páginas autenticadas y 1 página sin menú, confirmando
  que ningún título parte palabras y que los formularios ocupan el ancho
  disponible.

## T3 — Listado de Movimientos apilado en móvil (H3)

- `frontend/src/pages/MovementsListPage.tsx`: reagrupar el `<li>` en tres
  `<div>` (fecha/categoría, concepto/importe/comercio/forma de pago,
  acciones), según `plan.md §3.2`; añadir `id="movements-list"` al `<ul>`.
- `frontend/src/index.css`: regla `#movements-list li` (`plan.md §3.2`).
- `frontend/src/pages/MovementsListPage.test.tsx`: confirmar que los tests
  existentes (texto de cada fila, botones "Editar"/"Eliminar") siguen en
  verde tras envolver en `<div>` — sin cambiar su intención, solo ajustar
  selectores si algún `getByText` dejara de ser único.
- **Criterio de aceptación**: H3 criterios 1 a 3 cumplidos para esta
  página; `npm run test` en verde.

## T4 — Listado de Categorías apilado en móvil (H3)

- `frontend/src/pages/CategoriesPage.tsx`: reagrupar `renderCategory` en
  dos `<div>` (nombre/badge, acciones), según `plan.md §3.3`; añadir
  `id="categories-income-list"` / `id="categories-expense-list"` a los dos
  `<ul>` de nivel superior.
- `frontend/src/index.css`: reglas de `plan.md §3.3` (nivel superior y
  `<ul>` anidados de subcategorías).
- `frontend/src/pages/CategoriesPage.test.tsx`: confirmar que los tests
  existentes siguen en verde tras envolver en `<div>`.
- **Criterio de aceptación**: H3 criterios 1 a 3 cumplidos para esta
  página; `npm run test` en verde.

## T5 — Listado de Sesiones apilado en móvil (H3)

- `frontend/src/pages/SessionsPage.tsx`: reagrupar el `<li>` en dos `<div>`
  (datos del dispositivo, acción de cerrar sesión), según `plan.md §3.4`;
  añadir `id="sessions-list"` al `<ul>`.
- `frontend/src/index.css`: reglas de `plan.md §3.4`, incluida
  `overflow-wrap: anywhere` explícita en el bloque de datos (user-agent).
- `frontend/src/pages/SessionsPage.test.tsx`: confirmar que los tests
  existentes siguen en verde tras envolver en `<div>`.
- **Criterio de aceptación**: H3 criterios 1 a 3 cumplidos para esta
  página; `npm run test` en verde.

## T6 — Tablas del Dashboard apiladas en móvil (H3)

- `frontend/src/pages/DashboardPage.tsx`: añadir `data-label` a cada `<td>`
  de las dos tablas (Categoría/Total; Mes/Ingresos/Gastos/Ahorro), según
  `plan.md §3.5`.
- `frontend/src/index.css`: reglas de `plan.md §3.5` (`main table thead`
  oculto visualmente sin perder semántica, filas en bloque,
  `td::before { content: attr(data-label) }`).
- `frontend/src/pages/DashboardPage.test.tsx`: confirmar que los valores de
  cada celda siguen siendo accesibles por texto/rol tras añadir
  `data-label` (no cambia el texto visible de la celda, solo añade un
  atributo).
- **Criterio de aceptación**: H3 criterios 1 a 3 cumplidos para las dos
  tablas; `npm run test` en verde.

## T7 — Auditoría de páginas sin menú lateral (H4) — ✅ sin cambios de código

- Revisión visual (Playwright, 390px y 430px de ancho) de las 7 páginas
  listadas en `plan.md §4`: `RegisterPage`, `VerifyEmailPage`,
  `ResendVerificationPage`, `LoginPage`, `OAuthCallbackPage`
  (incluido su estado de error, sin backend de Google real),
  `ForgotPasswordPage`, `ResetPasswordPage` (tanto con token en la URL,
  mostrando el formulario, como sin él, mostrando su aviso de enlace
  incompleto).
- **Resultado**: `document.documentElement.scrollWidth >
  document.documentElement.clientWidth` es `false` en las 14 combinaciones
  (7 páginas × 2 anchos); ningún título parte palabras; los formularios
  ocupan el ancho disponible. No se encontró ningún problema — las reglas
  de T2 (`#root > main`, tipografía, `overflow-wrap`) ya cubren estas
  páginas por completo, sin necesitar ningún ajuste específico. Sin commit
  de código para esta tarea.
- **Criterio de aceptación**: H4 criterios 1 y 2 cumplidos.

## T8 — Cierre: verificación final y documentación

- `npm run build` (frontend) — comprobación de tipos completa.
- `npm run test` y `npx oxlint` sobre todo el frontend.
- Revisión visual manual final con Playwright de las 8 páginas autenticadas
  (menú cerrado y abierto) más las 7 páginas sin menú, a 390×844 y
  430×932, claro y oscuro — confirmando H1 a H4 juntos y que el
  comportamiento de escritorio (1440px) no cambió respecto a las capturas
  de spec 008 T8.
- Actualizar `README.md`: spec 009 como cerrada, con un resumen de una
  línea por historia (H1-H4).
- Checklist de cierre (se añade a este mismo fichero al completar T8, con
  el mismo formato que spec 008).

---
**Aprobada por Diego.** Ejecutada T1 a T7 en orden, cada una en su propio
commit (T7 sin cambios de código); T8 cierra la spec.

## Checklist de cierre

Verificación final contra cada criterio de aceptación de `spec.md`:

**H1 — Menú lateral utilizable en móvil**
- [x] Criterio 1: por debajo de 768px el menú no empuja el contenido —
  permanece oculto (`transform: translateX(-100%)`) hasta abrirse — T1.
- [x] Criterio 2: botón "Abrir/Cerrar menú" siempre visible y accesible
  (`aria-expanded`, nombre accesible propio), fuera de `#app-sidebar`; se
  cierra con el mismo control o seleccionando una sección — T1.
- [x] Criterio 3: backdrop de fondo mientras el menú está abierto,
  intercepta los clics al contenido de detrás — T1.
- [x] Criterio 4: comportamiento de plegado en escritorio (`isCollapsed`)
  sin cambios — verificado con los tests existentes de `AppLayout.test.tsx`
  (sin modificar) y revisión visual a 1440px (T8).

**H2 — Contenido legible sin desbordamiento horizontal**
- [x] Criterio 1: sin scroll horizontal en 390-430px en ninguna de las 15
  páginas (8 autenticadas + 7 sin menú) — verificado con
  `scrollWidth`/`clientWidth` en cada una (T2, T7, T8).
- [x] Criterio 2: `h1`/`h2` reducidos (28px/18px) bajo 768px; ningún título
  se parte en una palabra por línea en la revisión visual — T2.
- [x] Criterio 3: `main form { max-width: none }` bajo 768px — formularios
  a ancho completo — T2.

**H3 — Tablas y listados de varias columnas, legibles en móvil**
- [x] Criterio 1: cada fila pasa a bloque apilado bajo 768px — Movimientos
  (T3), Categorías (T4), Dispositivos y sesiones (T5), tablas del Dashboard
  con `data-label` (T6); Inicio no lo necesitó (ya era una fila tipo
  tarjeta, no columnas alineadas), pero `#home-summary` sí se apiló al
  encontrarse un problema de legibilidad en la revisión de T2.
- [x] Criterio 2: ningún dato ni acción se pierde — botones
  "Editar"/"Eliminar"/"Renombrar"/"Cerrar sesión" siguen presentes y
  utilizables en todas las páginas reestructuradas — verificado por los
  tests existentes de cada página (T3-T6), sin modificar su intención.
- [x] Criterio 3: cambio puramente presentacional — ningún test de
  comportamiento (filtros, formularios, acciones) cambió su aserción, solo
  se ajustó el árbol de elementos envolventes.

**H4 — Auditoría de las páginas sin menú lateral**
- [x] Criterio 1: las 7 páginas (`RegisterPage`, `VerifyEmailPage`,
  `ResendVerificationPage`, `LoginPage`, `OAuthCallbackPage`,
  `ForgotPasswordPage`, `ResetPasswordPage`) revisadas a 390px y 430px,
  incluidos los estados con y sin parámetros de la URL — T7.
- [x] Criterio 2: no se encontró ningún problema — las reglas de H2 (T2) ya
  las cubrían por completo; sin cambios de código para esta historia.

**Verificación técnica final**
- [x] `npm run build` (tipos + build de producción) en verde.
- [x] `npm run test` — 156/157 en verde; el único fallo es el flake
  intermitente preexistente de `RegisterMovementPage.test.tsx`
  (documentado desde spec 007, reproducido también en una rama sin
  cambios de esta spec).
- [x] `npx oxlint` sin avisos nuevos (los 5 avisos `set-state-in-effect`
  preexistentes, ninguno en los ficheros tocados por esta spec).
- [x] Revisión visual manual con backend real (Playwright, Chromium),
  390×844 y 430×932: las 8 páginas autenticadas con el menú cerrado y
  abierto (Inicio, Categorías, Movimientos, Dashboard, Importar Excel,
  Objetivos y presupuestos, Tu perfil, Dispositivos y sesiones) y las 7
  páginas sin menú lateral — sin scroll horizontal en ninguna. Un problema
  encontrado y corregido fuera de lo previsto en `plan.md` (T6): el
  `<caption>` de las tablas del Dashboard quedaba con el texto partido
  letra a letra al apilar la tabla; se oculta visualmente junto con
  `thead`, mismo criterio de accesibilidad.
- [x] Revisión visual a 1440px (escritorio): sin cambios respecto a las
  capturas de spec 008 T8 — el botón de menú móvil permanece oculto, el
  menú lateral y el contenido se comportan exactamente igual que antes de
  esta spec.
- [x] `README.md` actualizado con spec 009 cerrada.

**Nota de alcance**: el modo oscuro no se revisó página a página como el
claro (T2-T7 se hicieron en claro); se comprobó puntualmente en T8 con
capturas de Inicio (menú abierto) y Dashboard a 390px en oscuro — panel,
fondo/backdrop y tabla apilada se ven correctos, ningún CSS nuevo de esta
spec depende del esquema de color (usa las mismas variables `--bg`/
`--text`/`--text-h`/`--border` que ya tienen su variante oscura desde spec
008).
