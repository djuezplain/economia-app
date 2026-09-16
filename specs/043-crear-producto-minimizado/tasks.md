# Tasks — Spec 043 (Sección "Crear producto" minimizada por defecto)

**Fase:** 3 de 4

## Grupo 1 — Frontend

- **T1.1** — `ProductsPage.tsx`: envolver la sección "Crear producto" en `<details className="dashboard-section">`/`<summary>` (plan.md §1), sin `open`. Tests: la sección empieza plegada (el formulario no es visible/accesible hasta desplegar); un clic en el título la despliega y el formulario sigue funcionando igual que antes (regresión de los tests ya existentes de spec 041, adaptados si hace falta abrir la sección primero).

## Grupo 2 — Cierre

- **T2.1** — Checklist de cierre H1 + `npm run lint`, `tsc -b`, `npm test` en verde. Verificación manual: la sección aparece plegada al cargar `/tickets/productos`, se despliega con un clic, y crear un producto (con y sin precio) sigue funcionando igual que antes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.
