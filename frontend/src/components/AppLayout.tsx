import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

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

  return (
    <div id="app-shell">
      {showSidebar && (
        <nav id="app-sidebar" aria-label="Navegación principal">
          <button type="button" onClick={() => setIsCollapsed((collapsed) => !collapsed)} aria-expanded={!isCollapsed}>
            {isCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
          </button>
          {!isCollapsed && (
            <ul>
              <li>
                <NavLink to="/" end>
                  Inicio
                </NavLink>
              </li>
              <li>
                <NavLink to="/categories">Categorías</NavLink>
              </li>
              <li>
                <NavLink to="/movements">Ingresos y gastos</NavLink>
              </li>
              <li>
                <NavLink to="/dashboard">Dashboard</NavLink>
              </li>
              <li>
                <NavLink to="/import">Importar Excel</NavLink>
              </li>
              <li>
                <NavLink to="/goals">Objetivos y presupuestos</NavLink>
              </li>
              <li>
                <NavLink to="/profile">Tu perfil</NavLink>
              </li>
              <li>
                <NavLink to="/sessions">Dispositivos y sesiones</NavLink>
              </li>
              <li>
                <button type="button" onClick={() => void logout()}>
                  Cerrar sesión
                </button>
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
