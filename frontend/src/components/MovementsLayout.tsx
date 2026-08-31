import { NavLink, Outlet } from 'react-router-dom';

/**
 * Spec 006 (páginas de movimientos), plan.md §2. Sub-navegación propia de
 * "Ingresos y gastos" (H2) — un nivel de navegación distinto del menú
 * lateral general de spec 005 (`AppLayout`); ambos conviven, `AppLayout`
 * sigue envolviendo esta ruta igual que las demás (spec.md H2 criterio 1).
 *
 * Mismo mecanismo que `AppLayout`: ruta de layout con `<Outlet />`, para que
 * la sub-navegación se mantenga montada al pasar de una sub-página a otra.
 * `NavLink` marca automáticamente la pestaña activa con `aria-current="page"`
 * (H2 criterio 3) sin `useState` propio. `end` en "Movimientos" evita que
 * quede marcada como activa también en `/movements/register` (mismo motivo
 * que "Inicio" en `AppLayout`); "Registrar" no lleva `end`, así que también
 * queda marcada como activa en `/movements/register/:id` (modo edición).
 */
export function MovementsLayout() {
  return (
    <>
      {/* Spec 010 (rediseño editorial), plan.md §4.3. `.nav a` evita el
          azul/subrayado por defecto del navegador en enlaces sin estilo
          propio (mismo problema que spec 008 T8 corrigió para el menú
          lateral, aquí corregido desde el principio). */}
      <nav className="nav" aria-label="Ingresos y gastos">
        <ul>
          <li>
            <NavLink to="/movements" end>
              Movimientos
            </NavLink>
          </li>
          <li>
            <NavLink to="/movements/summary">Resumen</NavLink>
          </li>
          <li>
            <NavLink to="/movements/register">Registrar</NavLink>
          </li>
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
