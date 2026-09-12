# Spec 036 — Listado y edición de productos

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego tras usar spec 034/035 en producción.

## 0. Qué cambia

Hoy, "producto" (spec 034) no tiene ninguna pantalla propia: solo aparece como resultado de una búsqueda dentro de `ProductPricesPage` (spec 034 H4 criterio 3), sin URL propia ni forma de corregir su nombre si quedó mal escrito al importar un ticket (p. ej. un nombre con ruido de OCR que nadie corrigió a tiempo).

Diego quiere:
- Un listado de todos sus productos.
- Una página de detalle de cada producto, con su nombre editable.

## 1. Historias de usuario

**H1 — Ver el listado de todos mis productos**

Como usuario quiero ver la lista completa de productos que tengo dados de alta (creados al importar o editar tickets, spec 034/035), cada uno con un enlace a su propio detalle.

- Criterio 1: lista todos los productos del usuario, ordenados alfabéticamente.
- Criterio 2: se puede buscar por nombre para filtrar la lista (reutiliza la búsqueda ya existente de spec 034 H4 criterio 1).

**H2 — Ver el detalle de un producto**

Como usuario quiero, al entrar en un producto, ver su nombre y su precio en cada supermercado donde lo he comprado — mismo contenido que ya daba `ProductPricesPage` (spec 034 H4 criterio 3), ahora en una página con URL propia en vez de un resultado de búsqueda en la misma pantalla.

- Criterio 1: muestra el nombre del producto.
- Criterio 2: muestra la tabla de precio por supermercado/fecha, ordenada de más barato a más caro (spec 034 H4 criterio 3, sin cambios).

**H3 — Editar el nombre de un producto**

Como usuario quiero poder corregir el nombre de un producto ya creado, por si quedó mal escrito (ruido de OCR sin corregir a tiempo, o simplemente quiero renombrarlo).

- Criterio 1: el nombre es editable desde la página de detalle.
- Criterio 2: si el nuevo nombre coincide (normalizado — mayúsculas/tildes/espacios) con otro producto ya existente del usuario, se rechaza con un aviso claro — no se fusionan dos productos en uno automáticamente, mismo criterio que spec 034 §3 ("sin fusión automática de nombres de producto").
- Criterio 3: renombrar un producto no afecta a los tickets ya guardados que lo usan — sus líneas (`description`, el texto tal como salió en cada ticket) no cambian, solo cambia el nombre del producto en sí (spec 034 plan.md §1: `description` es independiente de `products.name` a propósito).

## 2. Fuera de alcance

- **Fusionar dos productos en uno** — ver H3 criterio 2.
- **Borrar un producto** — no pedido; un producto sin ninguna línea que lo use simplemente no aparece en ninguna comparativa, no hace falta borrarlo explícitamente.
- **Listado/edición de supermercados** — no pedido, solo productos.

---
**Siguiente paso:** `plan.md`.
