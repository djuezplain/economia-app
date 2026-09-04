# Tasks — Spec 016 (Secciones plegables del Dashboard)

**Fase:** 3 de 4

## Grupo 1 — Implementación

- **T1.1** — Envolver las 5 secciones de `DashboardPage.tsx` en `<details className="dashboard-section">`/`<summary><h2>…</h2></summary>`, sin `open` (minimizadas por defecto).
- **T1.2** — Estilos `.dashboard-section` en `index.css` (marcador propio, cabecera en fila, foco visible, espaciado equivalente al actual).
- **T1.3** — Ajustar `DashboardPage.test.tsx`: abrir la sección correspondiente (`click` en su `summary`) antes de cada interacción/aserción que hoy asume la sección ya visible; correr la suite completa y corregir lo que la propia ejecución señale.

## Grupo 2 — Cierre

- **T2.1** — `npm test` (frontend) y `tsc --noEmit` en verde; revisión manual en el navegador: las 5 secciones arrancan minimizadas, cada una se abre/cierra de forma independiente, y funcionan con teclado (Tab + Intro/Espacio).
