# Tasks — Spec 009 (Adaptación a móvil)

**Estado:** Aprobada
**Fase:** 3 de 4 (Spec → Plan → Tasks → Implementación)

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

## T7 — Auditoría de páginas sin menú lateral (H4)

- Revisión visual (Playwright, 390×844 y 430×932, claro y oscuro) de las 7
  páginas listadas en `plan.md §4`: `RegisterPage`, `VerifyEmailPage`,
  `ResendVerificationPage`, `LoginPage`, `OAuthCallbackPage`,
  `ForgotPasswordPage`, `ResetPasswordPage`.
- Corregir cualquier problema encontrado (desbordamiento, texto cortado,
  control inaccesible) con el mismo criterio que H2 — normalmente ya
  cubierto por las reglas de T2 (`#root > main`), pero se verifica cada
  página en vez de asumirlo.
- **Criterio de aceptación**: H4 criterios 1 y 2 cumplidos; capturas
  guardadas como evidencia de la revisión (no se versionan, solo sirven
  para esta verificación); cualquier corrección aplicada queda en este
  mismo commit.

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
**Aprobada por Diego.** Pendiente de ejecutar T1 a T8 en orden, cada una en
su propio commit.
