# Tasks — Spec 043 (Sección "Crear producto" minimizada por defecto)

**Fase:** 3 de 4

## Grupo 1 — Frontend

- **T1.1** — `ProductsPage.tsx`: envolver la sección "Crear producto" en `<details className="dashboard-section">`/`<summary>` (plan.md §1), sin `open`. Tests: la sección empieza plegada (el formulario no es visible/accesible hasta desplegar); un clic en el título la despliega y el formulario sigue funcionando igual que antes (regresión de los tests ya existentes de spec 041, adaptados si hace falta abrir la sección primero).

## Grupo 2 — Cierre

- **T2.1** — Checklist de cierre H1 + `npm run lint`, `tsc -b`, `npm test` en verde. Verificación manual: la sección aparece plegada al cargar `/tickets/productos`, se despliega con un clic, y crear un producto (con y sin precio) sigue funcionando igual que antes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 043 (T2.1)

### H1 — La sección "Crear producto" empieza plegada

- [x] Criterio 1 (empieza plegada): `ProductsPage.test.tsx` — "la sección empieza plegada..." (comprueba que `<details>` no tiene el atributo `open` al cargar); verificado manualmente (solo el título con "+" visible al abrir `/tickets/productos`).
- [x] Criterio 2 (un clic despliega/pliega): mismo test (clic en el título añade `open`); verificado manualmente (clic cambió el icono a "−" y mostró el formulario completo).
- [x] Criterio 3 (sin cambios en el formulario): los 12 tests ya existentes de spec 041/042 sobre el formulario siguen en verde sin modificar su lógica.

### Resultado del cierre

Sin huecos encontrados.

### T2.1 — Verificación final

Frontend: `tsc -b` en verde. `oxlint` sin warnings nuevos (los 9 existentes, ya documentados en cierres anteriores). 603/604 en verde (`--no-file-parallelism`) — único fallo, `WealthPage.test.tsx`, mismo test flaky preexistente ya documentado. Sin cambios de backend, no aplica volver a correr esa suite.

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba `diego.prueba.043@example.com` creado, activado y eliminado al terminar): al abrir `/tickets/productos`, "Crear producto" apareció plegada (solo el título y un "+"); un clic la desplegó (icono a "−") mostrando el formulario completo, con el buscador y el listado ya visibles desde el principio sin que el formulario ocupara espacio.

Con esto, **spec 043 queda cerrada**.
