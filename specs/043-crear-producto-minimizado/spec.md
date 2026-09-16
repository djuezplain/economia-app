# Spec 043 — Sección "Crear producto" minimizada por defecto

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Ajuste de UI sobre la sección "Crear producto" ya existente (spec 041).

## 1. Historia de usuario

**H1 — La sección "Crear producto" empieza plegada**

Como usuario quiero que, al abrir el listado de productos (`/tickets/productos`), la sección "Crear producto" aparezca minimizada (plegada) en vez de ocupar espacio con todo el formulario abierto, para ver antes el listado y solo desplegar el formulario cuando de verdad quiero crear un producto.

- Criterio 1: al cargar la página, la sección "Crear producto" está plegada, mostrando solo su título.
- Criterio 2: un clic la despliega, mostrando el formulario completo (nombre + precio inicial); otro clic la vuelve a plegar.
- Criterio 3: sin cambios de comportamiento del formulario en sí (spec 041) — solo cambia si está visible por defecto.

## 2. Fuera de alcance

- Recordar el estado plegado/desplegado entre visitas (siempre empieza plegada al cargar la página).

---
**Siguiente paso:** `plan.md`.
