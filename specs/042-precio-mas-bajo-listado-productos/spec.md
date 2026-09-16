# Spec 042 — Precio más bajo reciente en el listado de productos

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Significado de "último precio más bajo" confirmado con `AskUserQuestion`: para cada supermercado donde se ha comprado el producto, su precio más reciente; de esos (uno por súper), el más barato — mismo criterio ya usado en "Precio por supermercado" del detalle de producto (spec 034 H4) y en el simulador de cesta (spec 039).

## 1. Historia de usuario

**H1 — Ver el precio más barato reciente en el listado**

Como usuario quiero ver, en el listado de productos (`/tickets/productos`), el precio más bajo entre los precios más recientes de cada supermercado y en qué supermercado, para saber de un vistazo dónde me sale más barato sin entrar al detalle de cada producto.

- Criterio 1: junto a cada producto del listado se muestra su precio más bajo (de los más recientes por supermercado) y el nombre de ese supermercado.
- Criterio 2: un producto sin ningún ticket todavía no muestra ningún precio — se indica claramente que no hay datos (p. ej. "—"), sin error ni hueco vacío sin explicar.
- Criterio 3: si el producto solo se ha comprado en un supermercado, ese es el que se muestra (no hay comparación posible, pero sigue siendo el "más bajo reciente").
- Criterio 4: sin cambios en el comportamiento de búsqueda del listado ya existente (spec 034 H4 criterio 1) — el precio se calcula sobre los productos que devuelve la búsqueda en cada momento.

## 2. Fuera de alcance

- Mostrar el desglose completo por supermercado en el listado (eso ya existe en el detalle del producto) — aquí solo el más barato.
- Ordenar el listado por precio — sigue ordenado por nombre, sin cambios.
- Actualizar el precio en tiempo real sin recargar tras importar un ticket nuevo desde otra pestaña — se recalcula al cargar/buscar, igual que el resto de datos del listado.

---
**Siguiente paso:** `plan.md`.
