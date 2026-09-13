# Spec 037 — Estadísticas e historial enlazado en el detalle de producto

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Decisiones concretas confirmadas con `AskUserQuestion`: qué estadísticas (todas las propuestas) y qué le falta al "Historial" ya existente (spec 034 H4 criterio 3, revisado en el cambio posterior de spec 036: enlazar cada línea a su ticket).

## 1. Historias de usuario

**H1 — Ver estadísticas del producto**

Como usuario quiero ver, en el detalle de un producto, un resumen de cómo me ha ido con ese producto en total (no solo el precio actual por supermercado), para tener una foto rápida sin tener que sumar a mano.

- Criterio 1: precio mínimo, máximo y medio pagado, sobre todo el histórico de compras del producto (cualquier supermercado, cualquier fecha).
- Criterio 2: qué supermercado sale más barato **de media** (no solo la última compra) — promedio de precio por supermercado, se destaca el más bajo.
- Criterio 3: gasto total acumulado en ese producto, y número de veces que se ha comprado (número de líneas de ticket con ese producto).
- Criterio 4: gráfico con la evolución del precio a lo largo del tiempo, una serie por supermercado.
- Criterio 5: sin ningún ticket con el producto, no se muestran estadísticas vacías o con NaN — se omite la sección entera con el mismo mensaje ya existente ("Todavía no tienes ningún ticket con este producto").

**H2 — Cada línea del historial enlaza a su ticket**

Como usuario quiero, desde el historial de precios de un producto, poder abrir el ticket concreto de una compra pasada, para ver el resto de lo que compré ese día si me hace falta.

- Criterio 1: cada fila del historial completo (botón "Historial", spec 036) enlaza a `/tickets/:id` del ticket real de esa línea.
- Criterio 2: la vista por defecto (solo el precio más reciente por supermercado) también enlaza igual, mismo criterio.

## 2. Fuera de alcance

- Estadísticas por rango de fechas (p. ej. "último año") — se calculan sobre todo el histórico disponible, sin filtro de fecha.
- Exportar las estadísticas o el gráfico.
- Estadísticas agregadas entre productos (p. ej. "en qué supermercado gasto más en total") — esto es por producto individual, no un resumen global.

---
**Siguiente paso:** `plan.md`.
