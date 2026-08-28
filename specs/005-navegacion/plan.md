# Plan 005 — Navegación de la app

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H2)
**Stack de referencia:** `specs/constitution.md` §3 — sin cambios: sigue sin haber ninguna librería de UI/CSS en el stack. Este plan no introduce ninguna.

## 1. Dónde vive el menú: rutas anidadas con layout, no un componente repetido en cada página

`react-router-dom` (v7, ya en el stack) soporta **rutas de layout**: una `<Route element={<AppLayout />}>` que envuelve un grupo de rutas hijas, cada una renderizada dentro de un `<Outlet />` que vive dentro de `AppLayout`. Esto es importante para el criterio de plegado/desplegado de `spec.md` §4 ("el estado se mantiene mientras se navega dentro de la app, pero vuelve al estado por defecto al recargar"): si `AppLayout` es la capa de layout de la ruta, React Router lo mantiene **montado** al navegar entre rutas hijas (`Outlet` solo cambia el contenido de dentro) — el estado de plegado, al vivir en `AppLayout`, sobrevive a la navegación de forma natural, sin `localStorage` ni contexto global. Si en cambio cada página incluyera su propio `<AppLayout>` (como hace cada página hoy con su propio `<main>`), cada navegación desmontaría y volvería a montar el layout, perdiendo el estado plegado/desplegado en cada clic — el criterio de spec.md no se cumpliría. Recargar la página sí reinicia todo el árbol de React (incluido `AppLayout`), así que el "vuelve al estado por defecto al recargar" sale gratis, sin código explícito para ello.

`App.tsx` pasa a agrupar las 8 páginas de `spec.md` H1 criterio 1 (Categorías, Movimientos, Dashboard, Importar Excel, Objetivos y presupuestos, Perfil, Dispositivos y sesiones, y Home) bajo una única `<Route element={<AppLayout />}>`, dejando el resto de rutas (registro, login, verificación, recuperar contraseña, callback de OAuth) fuera, tal cual están hoy — nunca envueltas en `AppLayout` (H1 criterio 4: sin menú en páginas sin sesión):

```tsx
<Routes>
  <Route element={<AppLayout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/categories" element={<CategoriesPage />} />
    <Route path="/movements" element={<MovementsPage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/import" element={<ImportPage />} />
    <Route path="/goals" element={<GoalsPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/sessions" element={<SessionsPage />} />
  </Route>

  <Route path="/register" element={<RegisterPage />} />
  <Route path="/login" element={<LoginPage />} />
  {/* resto de rutas sin sesión, sin cambios */}
</Routes>
```

Cada página sigue renderizando su propio `<main>` exactamente igual que hoy (`CategoriesPage`, `MovementsPage`, etc. no cambian su estructura interna) — `AppLayout` solo añade el `<nav>` al lado, no sustituye nada dentro de las páginas.

## 2. Componente `AppLayout` (nuevo, `frontend/src/components/AppLayout.tsx`)

```tsx
export function AppLayout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const showSidebar = !isLoading && isAuthenticated; // igual criterio que HomePage usa hoy

  return (
    <div id="app-shell">
      {showSidebar && (
        <nav id="app-sidebar" aria-label="Navegación principal">
          <button type="button" onClick={() => setIsCollapsed((c) => !c)} aria-expanded={!isCollapsed}>
            {isCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
          </button>
          {!isCollapsed && (
            <ul>
              <li><NavLink to="/" end>Inicio</NavLink></li>
              <li><NavLink to="/categories">Categorías</NavLink></li>
              <li><NavLink to="/movements">Ingresos y gastos</NavLink></li>
              <li><NavLink to="/dashboard">Dashboard</NavLink></li>
              <li><NavLink to="/import">Importar Excel</NavLink></li>
              <li><NavLink to="/goals">Objetivos y presupuestos</NavLink></li>
              <li><NavLink to="/profile">Tu perfil</NavLink></li>
              <li><NavLink to="/sessions">Dispositivos y sesiones</NavLink></li>
              <li>
                <button type="button" onClick={() => void logout()}>Cerrar sesión</button>
              </li>
            </ul>
          )}
        </nav>
      )}
      <div id="app-content">
        <Outlet />
      </div>
    </div>
  );
}
```

(Pseudocódigo simplificado — el aviso de `PENDING_VERIFICATION` no se toca, sigue viviendo dentro de `HomePage`, ver §5.)

Reutiliza `useAuth()` (mismo hook que ya usa cada página) y el mismo patrón `onClick={() => void logout()}` que hoy tiene `HomePage` — el botón de cerrar sesión se traslada tal cual, sin cambiar su comportamiento.

## 3. Enlaces del menú: orden y alcance

8 enlaces en total: "Inicio" primero, seguido de las 7 secciones en el orden en que `spec.md` H1 criterio 1 las enumera (Categorías → Movimientos → Dashboard → Importar Excel → Objetivos y presupuestos → Perfil → Dispositivos y sesiones), no el orden que tenía `HomePage` hoy (que empezaba por Perfil/Sesiones) — agrupa primero las secciones de datos económicos, después las de cuenta. `spec.md` (actualizada tras revisar este plan con Diego) recoge explícitamente el enlace "Inicio" en H1 criterio 1.

El enlace "Inicio" usa `<NavLink to="/" end>` — el modificador `end` es necesario porque, sin él, `NavLink` marca `/` como activo en *cualquier* ruta (por ser prefijo de todas), lo cual rompería el criterio de "solo la sección activa se distingue" (H1 criterio 2) en cuanto se esté en cualquier otra página.

## 4. Sección activa (H1 criterio 2): `aria-current`, no una clase nueva

Ninguna página del proyecto usa `className` hoy (HTML semántico plano, confirmado en el código — ver `specs/constitution.md` §5, "detalles de estilo se deciden en el plan de cada feature"). En vez de introducir una convención de clases CSS solo para esto, se usa `NavLink` de `react-router-dom`, que ya marca automáticamente el enlace de la ruta activa con `aria-current="page"` sin código adicional. El único CSS nuevo (§6) usa el selector de atributo `#app-sidebar a[aria-current="page"]` para distinguirlo visualmente (p. ej. color de acento, ya definido en `index.css` como `--accent`) — cumple el criterio con una sola fuente de verdad (la ruta activa la calcula React Router, no un `useState` propio que se pueda desincronizar) y de paso mejora la accesibilidad (un lector de pantalla anuncia "página actual").

## 5. Cambios en páginas existentes

- **`HomePage.tsx`** (H2 criterio 1): se retira el `<p>` con la lista de enlaces a secciones y el botón "Cerrar sesión" (ambos se trasladan al `AppLayout`). Se conservan tal cual: el saludo (`Sesión iniciada como {nombre}`), el aviso `role="alert"` de cuenta sin verificar (H2 criterio 3 de spec 001), y — para quien no tiene sesión — los enlaces "Crear cuenta"/"Iniciar sesión" (H2 criterio 2 de esta spec; no cambian).
- **`App.tsx`**: reestructura de rutas descrita en §1. Ninguna página cambia su ruta (`/categories` sigue siendo `/categories`, etc.).
- Ninguna otra página (`CategoriesPage`, `MovementsPage`, `DashboardPage`, `ImportPage`, `GoalsPage`, `ProfilePage`, `SessionsPage`) cambia — ya renderizan su propio `<main>` con su propio contenido, que sigue apareciendo dentro de `<div id="app-content">` sin que la página necesite saber que el menú existe.

## 6. Estilos (mínimo, en `index.css`, sin framework)

Se añaden reglas nuevas a `frontend/src/index.css` (el único fichero de estilos del proyecto, sin CSS-in-JS ni módulos por componente), dirigidas por `id` — coherente con que hoy `index.css` ya usa selectores de elemento/`id` (`#root`, `#social`) y ninguna página usa `className`:

- `#app-shell`: `display: flex` (menú a la izquierda, contenido a la derecha) dentro del `#root` existente (que ya es `flex-direction: column` para el conjunto de la página — `#app-shell` es un hijo más de ese flex, no lo sustituye).
- `#app-sidebar`: ancho fijo cuando está desplegado, `border-inline-end` a juego con `--border` (mismo tono ya usado en `#root`).
- `#app-sidebar a[aria-current="page"]`: distinción visual del enlace activo (H1 criterio 2), con `--accent`/`--accent-bg` ya definidos.
- `#app-content`: `flex: 1` para ocupar el espacio restante.

No se necesita ninguna media query nueva (spec.md §4: el menú responsive queda fuera de alcance) ni ninguna dependencia nueva.

## 7. Casos límite a cubrir con tests

- Sin sesión (`isAuthenticated: false`, `isLoading: false`) en una página envuelta en `AppLayout` (p. ej. Home sin login) → no se renderiza `#app-sidebar`.
- Mientras `isLoading` es `true` (comprobación de sesión en curso) → tampoco se renderiza el menú (evita parpadeo, mismo criterio que ya usa `HomePage` hoy).
- Con sesión → los 8 enlaces (Inicio + 7 secciones) y "Cerrar sesión" están presentes; el enlace de la ruta activa tiene `aria-current="page"`, ninguno de los demás (incluido el caso "Inicio" activo solo en `/`, no en el resto de rutas, gracias a `end`).
- Pulsar "Ocultar menú" retira la lista de enlaces (y "Cerrar sesión") del DOM, dejando solo el botón, ahora con texto "Mostrar menú"; pulsarlo de nuevo la devuelve.
- Navegar de una sección a otra (simulando un clic en un enlace del menú) conserva el estado plegado/desplegado — verifica explícitamente la decisión de arquitectura de §1 (layout route con `Outlet`, no un `AppLayout` repetido por página).
- Pulsar "Cerrar sesión" desde el menú llama a `logout()` (mismo test que hoy tiene `HomePage.test.tsx` para el botón, trasladado a `AppLayout.test.tsx`).
- `HomePage.test.tsx`: el test existente "con sesión activa muestra ... un botón de cerrar sesión" deja de aplicar tal cual (ese botón ya no vive en `HomePage`) — se actualiza para dejar de buscarlo ahí; el resto de tests de `HomePage.test.tsx` (título, aviso de verificación, enlaces sin sesión) no cambian.

---
**Aprobado por Diego.** Siguiente paso: `tasks.md` con el desglose de tareas.
