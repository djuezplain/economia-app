# Spec 041 — Crear productos desde el listado

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Ampliación decidida con `AskUserQuestion`:
- Sin concepto de "categoría de producto" (no existe hoy; las categorías del proyecto son de ingresos/gastos) — se deja fuera de esta spec.
- El precio inicial (con supermercado y fecha) se registra como un **ticket sintético**: mismo mecanismo que un ticket normal (una `receipt` con una `receiptLine`), con fecha elegida por Diego (no forzada a hoy) — así el precio aparece igual que cualquier otro en el historial de tickets, las estadísticas del producto (spec 037), el simulador de cesta (spec 039) y los filtros del historial (spec 040), sin lógica especial en ningún sitio.

## 1. Historia de usuario

**H1 — Crear un producto nuevo desde el listado**

Como usuario quiero poder crear un producto nuevo directamente desde el listado de productos (`/tickets/productos`), para no depender de que aparezca primero en un ticket importado (única vía de creación hoy) — por ejemplo, para añadirlo de antemano a una lista de la compra (spec 039) antes de haberlo comprado nunca.

- Criterio 1: formulario con el nombre del producto nuevo, y opcionalmente un precio inicial: supermercado (existente o nuevo, igual que al importar un ticket), fecha, unidad (ud./kg) y precio por unidad.
- Criterio 2: si ya existe otro producto con ese nombre (mismo criterio de comparación que renombrar, spec 036 H3: nombre normalizado), no se crea un duplicado — se avisa con un mensaje claro, mismo criterio que ya existe al renombrar.
- Criterio 3: al crear correctamente, el producto nuevo aparece en el listado sin recargar la página, y se puede ir a su detalle igual que cualquier otro.
- Criterio 4: si no se rellena el precio inicial, el producto se crea igual, sin ningún ticket ni precio — su página de detalle debe comportarse igual que ya lo hace hoy para ese caso (spec 037 H1 criterio 5: sin estadísticas vacías, mensaje ya existente).
- Criterio 5: el precio, supermercado y fecha son un grupo: o se rellenan los tres, o no se rellena ninguno — no tiene sentido un precio sin saber en qué supermercado ni cuándo.
- Criterio 6: si el producto se crea pero falla el registro del precio inicial (p. ej. datos del precio inválidos), se avisa del error de precio por separado — el producto ya creado no se deshace ni desaparece.

## 2. Fuera de alcance

- Categoría de producto — no existe ese concepto en el proyecto hoy; quedaría para una spec propia si se decide más adelante.
- Más de un precio inicial (varios supermercados) en la misma creación — para eso ya existe importar tickets o editar el producto después.
- Crear varios productos a la vez.

---
**Siguiente paso:** `plan.md`.
