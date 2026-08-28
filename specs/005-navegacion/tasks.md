# Tasks 005 — Navegación de la app

**Estado:** Listo para implementar
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

## Grupo 1 — Menú lateral (H1)

- [x] **T1.1** — `frontend/src/components/AppLayout.tsx` (nuevo, `plan.md` §2): menú lateral con los 8 enlaces (`Inicio` con `NavLink to="/" end`, más las 7 secciones, `plan.md` §3), botón de plegar/desplegar (H1 criterio 3), botón "Cerrar sesión" (mismo `onClick={() => void logout()}` que hoy usa `HomePage`). Visible solo con `!isLoading && isAuthenticated` (H1 criterio 4). `App.tsx`: reestructura de rutas con `<Route element={<AppLayout />}>` envolviendo las 8 páginas autenticadas (`plan.md` §1) — el resto de rutas (registro, login, verificación, recuperar/resetear contraseña, callback OAuth) se quedan fuera, sin cambios. `frontend/src/index.css`: reglas nuevas por `id` (`#app-shell`, `#app-sidebar`, `#app-sidebar a[aria-current="page"]`, `#app-content`, `plan.md` §6) — ninguna página existente cambia su propio marcado interno.
  *Verificación (`AppLayout.test.tsx`, Testing Library, 6 tests):* sin sesión (`isAuthenticated: false`, `isLoading: false`) → no se renderiza `#app-sidebar`; con sesión → los 8 enlaces y "Cerrar sesión" presentes; el enlace de la ruta activa tiene `aria-current="page"` y "Inicio" no lo tiene fuera de `/` (gracias a `end`); pulsar "Ocultar menú" retira los enlaces y "Cerrar sesión" del DOM (queda solo el botón, ahora "Mostrar menú"), pulsarlo de nuevo los devuelve; navegar a otra ruta hija con un enlace ajeno al menú (para probar el caso incluso con el menú plegado, donde sus propios enlaces están ocultos) conserva el estado plegado — verifica la decisión de arquitectura de `plan.md` §1 (layout route con `Outlet`, `AppLayout` no se desmonta); pulsar "Cerrar sesión" llama a `logout()`. Suite completa del frontend en verde tras el cambio: 85/85 tests, 16 ficheros (los 79 ya existentes, sin ninguno roto, más los 6 nuevos de `AppLayout.test.tsx`) — ninguna página con test propio pasa por `AppLayout` en su propio test (se siguen renderizando solas dentro de `MemoryRouter`), así que no hubo que tocarlas. Lint (oxlint, sin avisos nuevos) y build (`tsc -b && vite build`) en verde.

## Grupo 2 — `HomePage` deja de ser el único punto de navegación (H2)

- [x] **T2.1** — `HomePage.tsx`: se retira el `<p>` con la lista de enlaces a secciones y el botón "Cerrar sesión" (ya viven en `AppLayout` desde T1.1). Se conservan el saludo, el aviso `role="alert"` de cuenta sin verificar, y los enlaces "Crear cuenta"/"Iniciar sesión" para quien no tiene sesión (H2 criterio 2, sin cambios).
  *Verificación:* `HomePage.test.tsx` actualizado — el test "con sesión activa..." ya no busca el botón "Cerrar sesión" dentro de `HomePage` (comprueba explícitamente que ya NO está ahí; se prueba en `AppLayout.test.tsx` desde T1.1) y elimina la comprobación redundante que quedó al simplificar el `<p>` (ya no intercala texto con enlaces, así que `getByText` con regex dejó de ser necesario dos veces). El resto de tests de `HomePage.test.tsx` (título, aviso de verificación, enlaces sin sesión) no cambian y siguen en verde. Suite completa del frontend en verde tras el cambio: 85/85 tests, 16 ficheros. Lint y build limpios.

## Grupo 3 — Cierre de la spec

- [x] **T3.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1-H2) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que en el cierre de las specs 001-004.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero.
  *Hallazgo real durante el repaso, encontrado y corregido con test nuevo (no solo documentado):* al contrastar `spec.md` H1 criterio 4 literalmente contra `AppLayout.test.tsx`, faltaba el caso "mientras se comprueba la sesión (`isLoading`) tampoco se muestra el menú" — el código ya lo hacía bien desde T1.1 (`showSidebar = !isLoading && isAuthenticated`, no solo `isAuthenticated`), pero ningún test lo demostraba; el test que había ("sin sesión no muestra el menú") solo cubría el estado ya resuelto de "no autenticado", nunca el estado transitorio de "todavía comprobando, pero acabará habiendo sesión". Añadido: "mientras se comprueba la sesión, no muestra el menú lateral (evita parpadeo, H1 criterio 4)". No cambia comportamiento, solo prueba código que ya era correcto. Suite tras el cierre: 86/86 tests frontend (16 ficheros); lint y build limpios.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").

---

## Checklist de cierre — spec 005 (T3.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático (se cita el fichero), o garantizado por construcción (se explica por qué).

### H1 — Moverme entre secciones sin quedarme atrapado

- [x] Criterio 1 (menú lateral siempre presente en las 8 páginas autenticadas, con enlaces a las 7 secciones, "Inicio" y "Cerrar sesión"): `AppLayout.test.tsx` — "con sesión muestra los 8 enlaces y el botón de cerrar sesión" prueba que `AppLayout` (el componente que envuelve las 8 rutas) los renderiza todos. Que las 8 páginas reales están efectivamente envueltas por `AppLayout` en `App.tsx` se verificó leyendo el propio `App.tsx` tras T1.1 (las 8 rutas listadas dentro de `<Route element={<AppLayout />}>`, exactamente las que enumera este criterio) — no hay un test de integración de `App.tsx` completo (el proyecto no tiene ninguno; tampoco lo tenía para enlazar `/goals` en spec 004), coherente con el resto del proyecto.
- [x] Criterio 2 (sección activa distinguible visualmente, sin breadcrumb aparte): `AppLayout.test.tsx` — "marca como activo solo el enlace de la ruta actual...", vía `aria-current="page"` (`NavLink`, sin `useState` propio). No se comprueba el color exacto (CSS) por test automático, mismo criterio que el resto del proyecto para detalles puramente visuales.
- [x] Criterio 3 (plegar/desplegar con un botón): `AppLayout.test.tsx` — "el botón de plegar oculta los enlaces y el de cerrar sesión, y se puede desplegar de nuevo".
- [x] Criterio 4 (sin menú en páginas sin sesión): dos mecanismos distintos, los dos verificados. (a) Las páginas sin sesión (login, registro, verificar email, reenviar verificación, recuperar/resetear contraseña, callback OAuth) nunca están envueltas por `AppLayout` en `App.tsx` — quedan fuera de `<Route element={<AppLayout />}>` (verificado leyendo `App.tsx`), así que `AppLayout` ni se monta ahí, sea cual sea el estado de sesión. (b) Home sí está envuelta por `AppLayout` y es accesible sin sesión — para ese caso, `AppLayout.test.tsx` prueba "sin sesión no muestra el menú lateral" y, añadido en este cierre, "mientras se comprueba la sesión, no muestra el menú lateral (evita parpadeo)".

### H2 — Home deja de ser el único punto de navegación

- [x] Criterio 1 (Home deja de mostrar el listado de enlaces; conserva saludo, aviso de cuenta sin verificar; el botón de cerrar sesión pasa al menú lateral): `HomePage.test.tsx` — "con sesión activa muestra el nombre del usuario..." comprueba explícitamente que el botón "Cerrar sesión" ya NO está en `HomePage` y que el saludo sigue ahí; "con la cuenta sin verificar, muestra un aviso persistente..." (sin cambios, sigue en verde). El propio botón trasladado se prueba en `AppLayout.test.tsx` — "pulsar 'Cerrar sesión' llama a logout".
- [x] Criterio 2 (enlaces "Crear cuenta"/"Iniciar sesión" se mantienen en Home sin sesión): `HomePage.test.tsx` — "muestra el título de la aplicación y enlaces a crear cuenta e iniciar sesión sin sesión activa" (sin cambios, sigue en verde).
