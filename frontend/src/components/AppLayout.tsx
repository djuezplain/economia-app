import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ArrowLeftRight, FileUp, Home, LayoutDashboard, LogOut, Monitor, Tags, Target, User } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

// Spec 007 (mejoras visuales), H5 / plan.md §5. Un icono por sección del
// menú lateral (spec 005) — decorativo, el nombre accesible del enlace
// sigue siendo `label` (el texto visible, o `aria-label` con el menú
// plegado, T6.2). `end` solo hace falta en "Inicio" (mismo motivo que
// `AppLayout` original: sin él, "/" quedaría activo en cualquier ruta).
const NAV_ITEMS = [
  { to: '/', end: true, label: 'Inicio', Icon: Home },
  { to: '/categories', end: false, label: 'Categorías', Icon: Tags },
  { to: '/movements', end: false, label: 'Ingresos y gastos', Icon: ArrowLeftRight },
  { to: '/dashboard', end: false, label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/import', end: false, label: 'Importar Excel', Icon: FileUp },
  { to: '/goals', end: false, label: 'Objetivos y presupuestos', Icon: Target },
  { to: '/profile', end: false, label: 'Tu perfil', Icon: User },
  { to: '/sessions', end: false, label: 'Dispositivos y sesiones', Icon: Monitor },
] as const;

/**
 * Spec 005 (navegación), H1/H2. Ruta de layout (envuelve las 8 páginas
 * autenticadas vía `<Outlet />`, ver `App.tsx`) en vez de un componente que
 * cada página incluya por separado: así React Router mantiene `AppLayout`
 * montado al navegar entre rutas hijas, y el estado de plegado/desplegado
 * (`isCollapsed`) sobrevive a la navegación sin necesidad de `localStorage`
 * (plan.md §1) — una recarga de página sí lo reinicia, porque desmonta y
 * vuelve a montar todo el árbol de React, tal como pide spec.md §4.
 */
export function AppLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // H1 criterio 4: sin menú mientras no se sabe si hay sesión (evita
  // parpadeo) ni cuando no la hay — mismo criterio que ya usaba `HomePage`.
  const showSidebar = !isLoading && isAuthenticated;

  // H5 criterio 2 (spec 007): con el menú plegado, el `<ul>` ya no se oculta
  // por completo (antes sí, spec 005) — cada icono sigue siendo visible y
  // accesible. `aria-label`/`title` solo se fijan estando plegado: así el
  // nombre accesible en modo desplegado sigue siendo exactamente el mismo
  // de siempre (el texto visible), sin ningún cambio de comportamiento ahí.
  const collapsedLabel = (label: string) => (isCollapsed ? { 'aria-label': label, title: label } : {});

  return (
    <div id="app-shell">
      {showSidebar && (
        <nav id="app-sidebar" aria-label="Navegación principal">
          {/* Spec 008 (rediseño Broadsheet), plan.md §4 (H4). Siempre visible,
              plegado o no — a diferencia del texto de los enlaces, no depende
              de `isCollapsed`. */}
          <p id="app-sidebar-brand">Ledger</p>
          <button type="button" onClick={() => setIsCollapsed((collapsed) => !collapsed)} aria-expanded={!isCollapsed}>
            {isCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
          </button>
          <ul>
            {NAV_ITEMS.map(({ to, end, label, Icon }) => (
              <li key={to}>
                <NavLink to={to} end={end} {...collapsedLabel(label)}>
                  <Icon aria-hidden="true" size={18} /> <span className={isCollapsed ? 'sr-only' : undefined}>{label}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => void logout()} {...collapsedLabel('Cerrar sesión')}>
                <LogOut aria-hidden="true" size={18} />{' '}
                <span className={isCollapsed ? 'sr-only' : undefined}>Cerrar sesión</span>
              </button>
            </li>
          </ul>
        </nav>
      )}
      <div id="app-content">
        <Outlet />
      </div>
    </div>
  );
}
