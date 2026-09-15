# Spec 040 — Filtros en el historial de tickets

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Filtros concretos confirmados con `AskUserQuestion`: supermercado, rango de fechas, producto e importe (rango) — los cuatro, no un subconjunto.

## 1. Historia de usuario

**H1 — Filtrar el historial de tickets**

Como usuario quiero poder filtrar el historial de tickets (`/tickets`, spec 034 H5) por supermercado, rango de fechas, producto e importe, para encontrar tickets concretos sin tener que recorrer todo el historial a mano.

- Criterio 1: filtro por supermercado — desplegable con los supermercados que ya tienen algún ticket del usuario (mismo catálogo que el resto de la app), "todos" por defecto.
- Criterio 2: filtro por rango de fechas — "desde"/"hasta", ambos opcionales de forma independiente (solo "desde", solo "hasta", o ambos).
- Criterio 3: filtro por producto — desplegable/buscador sobre el catálogo de productos (igual que el resto de la app); muestra los tickets que tienen al menos una línea con ese producto.
- Criterio 4: filtro por importe — rango mínimo/máximo, ambos opcionales de forma independiente. El importe usado es la **suma real de las líneas del ticket** (no el total impreso reconocido por OCR, que puede faltar si la lectura falló — `receipts.printedTotal`, spec 034) para que el filtro nunca excluya un ticket real solo porque el OCR no leyó bien el total.
- Criterio 5: los filtros se combinan entre sí con Y lógico (un ticket debe cumplir todos los filtros activos a la vez), nunca O.
- Criterio 6: sin ningún filtro activo, se ve el historial completo, igual que hoy.
- Criterio 7: con filtros activos y ningún ticket que los cumpla, se muestra un mensaje claro de "sin resultados", no una tabla vacía sin explicación.
- Criterio 8: los filtros se pueden limpiar de golpe (volver a ver todo) sin recargar la página.

## 2. Fuera de alcance

- Guardar combinaciones de filtros favoritas.
- Filtrar por texto libre sobre la descripción de las líneas (eso ya lo cubre el filtro por producto, que usa el catálogo ya emparejado).
- Ordenar el historial por columnas distintas de fecha (ya ordenado por fecha descendente, spec 034 H5 — sin cambios).
- Filtros combinados con O (p. ej. "Mercadona o Carrefour") — cada filtro admite un único valor, no varios a la vez.

---
**Siguiente paso:** `plan.md`.
