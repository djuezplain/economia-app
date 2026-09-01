import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

// Spec 008 (rediseño Broadsheet), plan.md §5. Sustituye a los iconos de
// `lucide-react` de spec 007 H5 (retirados en T7) por un punto de color
// (`.dot`, ver el `<span>` de más abajo) — decorativo, el nombre accesible
// del enlace sigue siendo `label` (el texto visible, o `aria-label` con el
// menú plegado). `end` solo hace falta en "Inicio" (mismo motivo que
// `AppLayout` original: sin él, "/" quedaría activo en cualquier ruta).
const NAV_ITEMS = [
  { to: '/', end: true, label: 'Inicio' },
  { to: '/categories', end: false, label: 'Categorías' },
  { to: '/movements', end: false, label: 'Ingresos y gastos' },
  { to: '/dashboard', end: false, label: 'Dashboard' },
  { to: '/import', end: false, label: 'Importar Excel' },
  { to: '/goals', end: false, label: 'Objetivos y presupuestos' },
  { to: '/profile', end: false, label: 'Tu perfil' },
  { to: '/sessions', end: false, label: 'Dispositivos y sesiones' },
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
  const { isAuthenticated, isLoading, isOffline, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Spec 009 (adaptación a móvil), plan.md §1. Estado independiente de
  // `isCollapsed`: en escritorio el menú se pliega a una franja estrecha
  // pero sigue presente; en móvil (por debajo de 768px, CSS) está oculto
  // del todo o abierto como panel superpuesto — son dos conceptos
  // distintos, no un mismo booleano reutilizado.
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  // Evita que el `useEffect` de foco actúe en el montaje inicial (cuando
  // `isMobileMenuOpen` ya vale `false` de por sí, sin que nadie haya
  // cerrado nada) — solo debe mover el foco en una transición real.
  const isFirstRender = useRef(true);

  // H1 criterio 4: sin menú mientras no se sabe si hay sesión (evita
  // parpadeo) ni cuando no la hay — mismo criterio que ya usaba `HomePage`.
  const showSidebar = !isLoading && isAuthenticated;

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  // Spec 009, plan.md §1.4. Foco ligero (sin trap completo, fuera de
  // alcance de esta spec): al abrir, el primer enlace del panel; al
  // cerrar, de vuelta al botón que lo abrió.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isMobileMenuOpen) {
      sidebarRef.current?.querySelector('a')?.focus();
    } else {
      toggleButtonRef.current?.focus();
    }
  }, [isMobileMenuOpen]);

  // Spec 009, plan.md §1.4. Escape cierra el menú móvil, solo mientras está
  // abierto (listener añadido/quitado con el propio estado).
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMobileMenu();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // H5 criterio 2 (spec 007): con el menú plegado, el `<ul>` ya no se oculta
  // por completo (antes sí, spec 005) — cada icono sigue siendo visible y
  // accesible. `aria-label`/`title` solo se fijan estando plegado: así el
  // nombre accesible en modo desplegado sigue siendo exactamente el mismo
  // de siempre (el texto visible), sin ningún cambio de comportamiento ahí.
  const collapsedLabel = (label: string) => (isCollapsed ? { 'aria-label': label, title: label } : {});

  /**
   * Spec 011 (modo offline), plan.md §6, H6 criterio 2. Recargar u abrir la
   * app sin conexión y sin sesión ya cargada en memoria no tiene forma de
   * autenticarse (el access token solo vive en memoria, spec 001) — se
   * avisa con claridad en vez de dejar que cada una de las 8 páginas
   * muestre su propio "tienes que iniciar sesión" (que llevaría a un
   * `/login` igual de inútil sin red).
   */
  if (!isLoading && isOffline && !isAuthenticated) {
    return (
      <main>
        <h1>Sin conexión</h1>
        <p role="alert">Vuelve a conectarte para continuar.</p>
      </main>
    );
  }

  return (
    <div id="app-shell">
      {/* Spec 009, plan.md §1.2. Fuera de `#app-sidebar` a propósito: debe
          seguir siendo alcanzable aunque el panel esté oculto fuera de
          pantalla en móvil. Oculto por CSS en escritorio (`display: none`
          fuera del media query de móvil). */}
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
      {isMobileMenuOpen && <div id="app-sidebar-backdrop" onClick={closeMobileMenu} />}
      {showSidebar && (
        <nav
          id="app-sidebar"
          aria-label="Navegación principal"
          ref={sidebarRef}
          data-mobile-open={isMobileMenuOpen}
          data-collapsed={isCollapsed}
        >
          {/* Spec 008 (rediseño Broadsheet), plan.md §4 (H4). Siempre visible,
              plegado o no — a diferencia del texto de los enlaces, no depende
              de `isCollapsed`. */}
          <p id="app-sidebar-brand">Ledger</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
          </button>
          <ul>
            {NAV_ITEMS.map(({ to, end, label }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="nav-link" onClick={closeMobileMenu} {...collapsedLabel(label)}>
                  <span className="dot" aria-hidden="true" /> <span className={isCollapsed ? 'sr-only' : undefined}>{label}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  closeMobileMenu();
                  void logout();
                }}
                {...collapsedLabel('Cerrar sesión')}
              >
                <span className="dot" aria-hidden="true" />{' '}
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
