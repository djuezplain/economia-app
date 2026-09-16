# Plan 043 — Sección "Crear producto" minimizada por defecto

**Estado:** Aprobado
**Fase:** 2 de 4
**Implementa:** `spec.md` (H1)

## 1. Frontend — `<details>`/`<summary>`, mismo patrón que las secciones plegables de Patrimonio

`ProductsPage.tsx`: la `<section aria-label="Crear producto">` con su `<h2>Crear producto</h2>` pasa a `<details className="dashboard-section"><summary><h2>Crear producto</h2></summary>...</details>` — mismo patrón ya establecido (spec 016) y usado en `WealthPage.tsx` para las secciones de Patrimonio. Sin `open`, así que empieza plegada (criterio 1); el propio elemento nativo del navegador gestiona abrir/cerrar (criterio 2), sin estado de React ni JS adicional.

Sin cambios en el formulario ni su lógica (criterio 3) — solo el elemento contenedor.

## 2. Fuera de este plan

Igual que `spec.md` §2.

---
**Siguiente paso:** `tasks.md`.
