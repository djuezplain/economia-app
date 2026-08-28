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

- [ ] **T3.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1-H2) y marcar cada criterio de aceptación como cubierto por al menos un test automático, igual que en el cierre de las specs 001-004 y 006.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, la marco `[x]` aquí y hago commit; solo entonces paso a la siguiente. Si algo del plan no encaja al implementarlo, paramos y ajustamos `plan.md` antes de seguir (no se parchea "en silencio").
