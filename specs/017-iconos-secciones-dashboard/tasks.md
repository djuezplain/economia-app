# Tasks — Spec 017 (Iconos en las secciones plegables)

**Fase:** 3 de 4

## Grupo 1 — Implementación

- **T1.1** — Prefijo de emoji en el `<h2>` de las 5 cabeceras de `DashboardPage.tsx`.
- **T1.2** — `.dashboard-section > summary::after`/`.dashboard-section[open] > summary::after` en `index.css`: `content` distinto por estado en vez de rotación.
- **T1.3** — Ajustar los 3 `getByRole('heading', { name: … })` de `DashboardPage.test.tsx` a expresión regular.

## Grupo 2 — Cierre

- **T2.1** — `npm test` (frontend) y `tsc --noEmit` en verde; revisión visual en el navegador: los 5 iconos correctos, "+" minimizada → "−" al maximizar.
