# Tasks — Spec 008 (Rediseño visual "Broadsheet")

**Estado:** Aprobada — en curso
**Fase:** 3 de 4 (Spec → Plan → Tasks → Implementación)

Cada tarea = un commit (Conventional Commits), validada contra su criterio antes de pasar a la siguiente (`constitution.md §1`). Tras cada tarea: `npm run test` (frontend) y `npx oxlint` en el/los ficheros tocados; `npm run build` al final de todo (T8), como añadió spec 007 a la rutina tras el fallo de tipos que solo `tsc -b` detectaba.

## T1 — Tokens de color y tipografía (H1)

- Sustituir en `frontend/src/index.css` (`:root` y bloque `@media (prefers-color-scheme: dark)`) los valores descritos en `plan.md §1`: `--text`, `--text-h`, `--bg`, `--border`, `--code-bg`, `--accent`, `--accent-bg`, `--accent-border`, nueva `--card-bg`; `--heading` pasa a la pila serif.
- `h1`, `h2`: `font-weight: 700` (antes 500).
- **Criterio de aceptación**: `npm run test` sigue en verde (ningún test depende de valores de color); revisión visual manual de `/` (aún con el `HomePage` actual, antes de T4) y `/dashboard` para confirmar que el contraste de texto sigue siendo legible en claro y oscuro.

## T2 — Layout a ancho completo (H2)

- `#root`: quitar `width: 1126px`, `margin: 0 auto`, `text-align: center`, `border-inline`.
- `#app-sidebar`: quitar `border-inline-end`; añadir `width: 220px`, `padding: 24px 20px`.
- `#app-content`: añadir `padding: 32px 40px`.
- `main form`: añadir `max-width: 640px`.
- **Criterio de aceptación**: `npm run test` en verde; revisión visual manual de al menos 3 páginas autenticadas (`/`, `/movements`, `/goals`) confirmando que el contenido ocupa el ancho completo y los formularios no se estiran de forma ilegible.

## T3 — `formatCurrency` (base de H3)

- Crear `frontend/src/pages/home-shared.ts` con `formatCurrency()` (`plan.md §3`).
- Crear `frontend/src/pages/home-shared.test.ts`: formatea enteros, decimales de un dígito, negativos y cero; confirma el separador decimal `,` y el símbolo `€` (locale `es-ES`/`EUR` fijo).
- **Criterio de aceptación**: tests nuevos en verde; no se toca ningún fichero más (helper aislado, sin consumidores todavía).

## T4 — Página de Inicio rediseñada (H3)

- Reescribir `frontend/src/pages/HomePage.tsx` según `plan.md §3`: tarjetas de resumen del mes (`getMonthSummary`), referencia al objetivo de ahorro si existe (`getMonthProgress`), listado de últimos 5 movimientos (`listTransactions({ limit: 5 })`), estado vacío si el mes no tiene movimientos, aviso de verificación pendiente y enlaces de registro/login sin cambios de comportamiento.
- Añadir a `frontend/src/index.css`: `#home-summary` (grid/flex de tarjetas, usando `--card-bg`), `#home-recent-list li` (layout de fila, `plan.md §3`).
- Actualizar `frontend/src/pages/HomePage.test.tsx`: los 3 tests existentes seguirán pasando si el texto/estructura que comprueban (título, enlaces, aviso de verificación, "Sesión iniciada como X") se conserva tal cual dentro del nuevo layout; añadir tests nuevos para: tarjetas de resumen con datos, listado de últimos movimientos, estado vacío (mes sin movimientos), ausencia de objetivo de ahorro configurado, y que un fallo de una de las 3 llamadas no bloquea las otras dos.
- **Criterio de aceptación**: todos los criterios H3.1 a H3.6 de `spec.md` cumplidos; `npm run test` en verde.

## T5 — Marca "Ledger" (H4)

- `frontend/src/components/AppLayout.tsx`: añadir `<p id="app-sidebar-brand">Ledger</p>` dentro de `#app-sidebar`, antes del botón de plegar/desplegar; sin condicionar a `isCollapsed`.
- `frontend/src/index.css`: regla `#app-sidebar-brand` (`plan.md §4`).
- `frontend/src/components/AppLayout.test.tsx`: nuevo test — "Ledger" visible tanto plegado como desplegado.
- **Criterio de aceptación**: criterios H4.1 y H4.2 cumplidos; `npm run test` en verde.

## T6 — Punto de color en vez de iconos (H5)

- `frontend/src/components/AppLayout.tsx`: quitar el import de `lucide-react` y el campo `Icon` de `NAV_ITEMS`; sustituir `<Icon aria-hidden="true" size={18} />` por `<span className="dot" aria-hidden="true" />` en enlaces y en el botón de cerrar sesión.
- `frontend/src/index.css`: reglas `.dot` y `.dot-accent` / `#app-sidebar a[aria-current='page'] .dot` (`plan.md §5`), documentadas en comentario como 3ª/4ª excepción a "sin className" (junto a `.progress-bar`/`.sr-only`).
- `frontend/src/components/AppLayout.test.tsx`: el test "cada uno con su icono" pasa a comprobar la presencia de `.dot` en vez de `<svg>`; el resto de tests de plegado/activo no cambian de intención.
- **Criterio de aceptación**: criterios H5.1, H5.2 y H5.4 cumplidos; `npm run test` en verde.

## T7 — Retirar `lucide-react` (H5 criterio 3)

- Confirmar de nuevo (tras T6) que ningún fichero del frontend importa `lucide-react`.
- Quitar la dependencia de `frontend/package.json` y del `package-lock.json` raíz (`npm uninstall lucide-react` desde `frontend/`, o edición manual + `npm install` para regenerar el lockfile).
- Quitar la fila "Iconos" de la tabla de stack en `specs/constitution.md §3` (ya no forma parte del stack — se documenta su retirada en el propio commit, no hace falta más).
- **Criterio de aceptación**: `npm run build` sigue en verde sin la dependencia; `grep -r lucide-react frontend/` no devuelve nada salvo, si acaso, este propio `tasks.md`.

## T8 — Cierre: verificación final y documentación

- `npm run build` (frontend) — comprobación de tipos completa, no solo `vitest`/`oxlint` (lección de spec 007).
- `npm run test` y `npx oxlint` sobre todo el frontend.
- Revisión visual manual final de las 8 páginas autenticadas + `HomePage` sin sesión, en claro y oscuro.
- Actualizar `README.md`: spec 008 como cerrada, con un resumen de una línea por historia (H1-H5).
- Checklist de cierre (se añade a este mismo fichero al completar T8, con el mismo formato que spec 007).

---
**Pendiente de aprobación por Diego.** Tras aprobar, se ejecutan T1 a T8 en orden, cada una en su propio commit.
