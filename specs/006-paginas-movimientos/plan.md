# Plan 006 — Separar "Ingresos y gastos" en páginas independientes

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H3)
**Stack de referencia:** `specs/constitution.md` §3 — sin cambios de stack.

## 1. Rutas nuevas (frontend)

`/movements` deja de ser una única página y pasa a ser, igual que `AppLayout` de spec 005, una **ruta de layout** con sub-rutas propias — mismo mecanismo (`<Outlet />`), a un nivel dentro de `AppLayout`:

```tsx
<Route path="/movements" element={<MovementsLayout />}>
  <Route index element={<MovementsListPage />} />           {/* "Movimientos" — mismo path que hoy */}
  <Route path="summary" element={<MovementsSummaryPage />} />   {/* "Resumen" */}
  <Route path="register" element={<RegisterMovementPage />} />  {/* "Registrar", alta */}
  <Route path="register/:id" element={<RegisterMovementPage />} /> {/* "Registrar", edición (H3) */}
</Route>
```

`index` (es decir, `/movements` tal cual) se asigna a **Movimientos** (el listado), no a Resumen: mantiene el mismo path que ya usa hoy el enlace "Ingresos y gastos" del menú lateral (spec 005), y es la vista que ya se usaba con más frecuencia día a día (consultar/filtrar lo registrado) — Resumen y Registrar pasan a ser sub-rutas explícitas (`/summary`, `/register`).

`RegisterMovementPage` sirve tanto el alta como la edición (H3 criterio 1: mismo formulario) — decide su modo mirando si `useParams().id` existe, igual que hoy `MovementsPage` decide con `editingId !== null`.

## 2. `MovementsLayout` (nuevo, `frontend/src/components/MovementsLayout.tsx`)

Mismo patrón que `AppLayout` (spec 005, §2): un componente de layout de ruta con `<Outlet />`, que aquí además renderiza la sub-navegación de H2:

```tsx
export function MovementsLayout() {
  return (
    <>
      <nav aria-label="Ingresos y gastos">
        <ul>
          <li><NavLink to="/movements" end>Movimientos</NavLink></li>
          <li><NavLink to="/movements/summary">Resumen</NavLink></li>
          <li><NavLink to="/movements/register">Registrar</NavLink></li>
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
```

Mismo mecanismo que ya se decidió para el menú lateral de spec 005 (§4 de ese plan): `NavLink` marca automáticamente la pestaña activa con `aria-current="page"` (H2 criterio 3), sin `useState` ni clase CSS propia — `end` en "Movimientos" para que no quede marcada como activa también en `/movements/register` (mismo motivo que "Inicio" en el menú lateral). Al estar en `/movements/register/:id`, ninguna de las 3 pestañas coincide exactamente con la URL (es una sub-ruta de "Registrar", no la propia "Registrar") — se resuelve con `<NavLink to="/movements/register" className={...}>`... en realidad no hace falta clase manual: `NavLink` considera activa una ruta cuando la URL actual **empieza** por su `to` (comportamiento por defecto, sin `end`), así que `/movements/register/abc-123` also activa la pestaña "Registrar" de forma automática, sin código adicional.

Este `<nav>` es un nivel de navegación **dentro** de la sección "Ingresos y gastos", distinto del `<nav id="app-sidebar">` de spec 005 — ambos conviven (el lateral no desaparece al entrar en `/movements/*`, spec.md H2 criterio 1).

## 3. Backend: nuevo endpoint `GET /transactions/:id` (necesario para H3, no estaba en spec 002)

`RegisterMovementPage` en modo edición necesita los datos del movimiento a partir del `:id` de la URL. Se descarta pasar el `Transaction` completo por `navigate(..., { state })` (opción explorada y rechazada): funcionaría para el caso de pulsar "Editar" desde el listado en la misma sesión de navegador, pero se rompería si el usuario recarga la página de edición o llega a `/movements/register/:id` por un enlace directo — `state` no sobrevive a una recarga. Se añade en su lugar:

- `GET /transactions/:id` (`TransactionsController`/`TransactionsService`, mismo guard `@UseGuards(AuthGuard, RequireActiveUserGuard)` que el resto de `/transactions`) — 404 si no existe o pertenece a otro usuario, mismo criterio de "no confirmar recursos ajenos" que ya usan `update`/`remove` en este mismo servicio (reutiliza el helper interno que ya lanza `NotFoundException('Movimiento no encontrado.')`).
- `frontend/src/api/transactions.ts`: nueva función `getTransaction(id: string): Promise<Transaction>`.

Esto es una adición pequeña y acotada (una consulta de solo lectura, mismo aislamiento que todo lo demás), no un cambio de alcance de `spec.md` §3 ("no es rediseñar contenido") — es infraestructura necesaria para que H3 funcione de forma robusta, no una nueva funcionalidad de negocio.

## 4. Reparto del código de `MovementsPage.tsx` actual

| Pieza de la página actual | Página nueva |
|---|---|
| Selector Gastos/Ingresos, filtros, sección "Movimientos" (listado + editar/eliminar) | `MovementsListPage` |
| Selector Gastos/Ingresos, sección "Resumen" (total, media, desglose) | `MovementsSummaryPage` |
| Selector Gastos/Ingresos, formulario (alta y edición) | `RegisterMovementPage` |

Cada página carga sus propias categorías (`listCategories(type)`) de forma independiente — no hay estado compartido entre páginas (spec.md H1 criterio 4) — extraído a un hook común `useCategoriesForType(type)` (`frontend/src/hooks/useCategoriesForType.ts`) solo para no triplicar el mismo `useEffect`; es una extracción de código, no un estado compartido: cada página que llama al hook mantiene su propia instancia de estado, igual que si el código estuviera duplicado literalmente tres veces.

`categoryName(id)` (resolver un id de categoría a su nombre) se necesita en `MovementsListPage` (líneas del listado) y en `MovementsSummaryPage` (desglose) — se mueve a una función pura reutilizable en `frontend/src/pages/movements-shared.ts` junto a `PAYMENT_METHOD_LABELS`, `todayIso` y `emptyForm` (usadas solo por `RegisterMovementPage`, pero se dejan en el mismo fichero por cohesión con el resto de utilidades de la sección).

## 5. `MovementsSummaryPage` sin filtros propios — nota a confirmar

`spec.md` H1 asigna explícitamente los filtros (fechas, categoría, comercio, búsqueda) solo a "Movimientos" (criterio 2), no a "Resumen" (criterio 1 no los menciona). Este plan sigue esa lectura literal: `MovementsSummaryPage` llama a `listTransactions({ type })` **sin** filtros — el resumen de un tipo (Gastos o Ingresos) sobre **todo** el histórico, no sobre un subconjunto filtrado.

Esto es un cambio de comportamiento real respecto a hoy, no solo de maquetación: hoy "Resumen" y "Movimientos" comparten la misma llamada a `listTransactions` (mismos filtros aplicados a ambos a la vez, porque son la misma petición), así que el resumen de hoy **sí** refleja los filtros activos. Al separar en páginas independientes sin estado compartido (H1 criterio 4), o bien el resumen deja de poder filtrarse (esta lectura), o bien "Resumen" necesitaría sus propios filtros propios (no mencionados en `spec.md`). Se sigue la lectura literal de `spec.md` por ahora; si se prefiere que "Resumen" tenga sus propios filtros (duplicando el mismo bloque de filtros de "Movimientos"), es un cambio a `spec.md` antes de pasar a `tasks.md`, no solo a este plan.

## 6. Casos límite a cubrir con tests

- `MovementsListPage`: filtros y listado funcionan igual que hoy (mismos tests migrados de `MovementsPage.test.tsx`); "Editar" navega a `/movements/register/:id` (no abre un formulario inline).
- `MovementsSummaryPage`: sin filtros en la URL ni en la UI; muestra total/media/desglose de todo el tipo seleccionado.
- `RegisterMovementPage` sin `:id` (alta): formulario vacío, título "Registrar gasto"/"Registrar ingreso" según el selector.
- `RegisterMovementPage` con `:id` (edición): llama a `getTransaction(id)` al montar, rellena el formulario con la respuesta, título "Editar movimiento"; `:id` de un movimiento ajeno o inexistente → 404 de la API, mensaje de error visible (mismo criterio que el resto de páginas ante un recurso no encontrado).
- Guardar (alta o edición) en `RegisterMovementPage` navega de vuelta a `/movements` (H3 criterio 2); "Cancelar edición" también.
- La pestaña activa de `MovementsLayout` tiene `aria-current="page"` en las 3 rutas (`/movements`, `/movements/summary`, `/movements/register`) y también en `/movements/register/:id` (activa "Registrar" sin `end`).
- El menú lateral de spec 005 sigue mostrando un único enlace "Ingresos y gastos" que apunta a `/movements`, y el propio menú lateral (`AppLayout`) sigue presente en las 3 páginas nuevas (conviven los dos niveles de navegación, §2).
- Backend: `GET /transactions/:id` — devuelve el movimiento propio; 404 si es ajeno o no existe; 401/403 sin sesión / cuenta no verificada (mismo patrón que el resto de `/transactions`).

---
**Siguiente paso:** revisar este plan con Diego (en particular la nota de §5 sobre "Resumen" sin filtros propios); con su aprobación, se genera `tasks.md`.
