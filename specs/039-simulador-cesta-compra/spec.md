# Spec 039 — Simulador de cesta de la compra

**Estado:** Aprobada
**Fase:** 1 de 4
**Basado en:** petición directa de Diego. Decisiones concretas confirmadas con `AskUserQuestion`:
- Precio a usar por producto+supermercado cuando hay varias compras históricas: **el más reciente**.
- Cantidades en la lista: **sin cantidad**, se compara por la unidad de referencia (ud./kg tal como se registra el producto), no por importe de una compra real con cantidades.
- Supermercado sin dato de precio para algún producto de la lista: **se excluye de la comparación "todo en un único súper"** (no compite por más barato/más caro de cesta única); sí puede participar en la opción mixta para los productos que sí tiene.
- Al optimizar el número de supermercados a visitar en la cesta repartida: **se muestran dos opciones mixtas por separado** — la más barata sin límite de súpers, y otra que minimiza el número de súpers a visitar (con el precio solo como desempate entre combinaciones que visiten el mismo número mínimo de súpers) — para que Diego compare y decida.

## 1. Historias de usuario

**H1 — Crear y mantener listas de la compra**

Como usuario quiero crear una lista de la compra con productos de mi catálogo existente (el mismo catálogo de `products` usado en tickets, spec 034/036), para poder simular varias veces sin tener que volver a elegir los productos cada vez.

- Criterio 1: una lista tiene un nombre y un conjunto de productos (elegidos del catálogo existente, buscador por nombre igual que en el resto de la app).
- Criterio 2: puedo crear, renombrar, borrar una lista, y añadir/quitar productos de una lista existente.
- Criterio 3: puedo tener varias listas a la vez (p. ej. "compra semanal", "básicos").
- Criterio 4: una lista no puede tener el mismo producto repetido.
- Criterio 5: no hay cantidades por producto — la lista es solo "qué productos", no "cuántos".

**H2 — Generar la simulación de una lista**

Como usuario quiero, desde una lista, pulsar "generar" y ver en qué supermercado me sale más barato hacer toda la compra, en cuál más cara, y cuál sería la forma más barata aunque tenga que repartir la compra entre varios supermercados, para decidir dónde comprar.

- Criterio 1: **Más barato (cesta única)** — de entre los supermercados que tienen precio conocido (el más reciente) para **todos** los productos de la lista, el que suma menos. Se muestra el total y el desglose por producto.
- Criterio 2: **Más caro (cesta única)** — igual que el criterio 1 pero el que suma más, de entre los mismos supermercados candidatos (los que tienen todos los productos).
- Criterio 3: **Opción mixta más barata (cesta repartida)** — para cada producto de la lista, el supermercado más barato en el que hay dato de precio, sin límite de en cuántos supermercados distintos se reparte. Se muestra el total, el ahorro frente a la opción de criterio 1 (importe y %), y el desglose: qué producto comprar en qué supermercado.
- Criterio 4: **Opción mixta con menos súpers (cesta repartida optimizada)** — de entre todas las formas de repartir la lista (con datos disponibles) que cubran todos los productos con precio conocido, la que visita el menor número de supermercados posible; si hay varias combinaciones distintas con ese mismo número mínimo, se elige la más barata de ellas. Se muestra el total, el número de supermercados a visitar, la diferencia en precio frente a la opción del criterio 3, y el mismo desglose por producto.
- Criterio 5: si ningún supermercado tiene precio para todos los productos de la lista, no se puede calcular "más barato"/"más caro" de cesta única — se muestra un aviso explícito en vez de un resultado vacío o erróneo, y las opciones mixtas se siguen mostrando si hay al menos un producto con algún precio.
- Criterio 6: si solo hay un supermercado candidato para cesta única, ese es a la vez el resultado de "más barato" y "más caro" — se muestra así, sin ocultarlo ni tratarlo como error.
- Criterio 7: un producto de la lista sin ningún precio histórico en ningún supermercado se marca claramente como "sin datos" en el desglose y no participa en ningún total (ni cesta única ni las mixtas); si esto deja la lista sin ningún producto con datos, se avisa de que no hay suficiente información para simular.
- Criterio 8: la simulación se calcula al vuelo cada vez que se pulsa "generar" (con los precios más recientes disponibles en ese momento) — no se guarda un histórico de simulaciones pasadas.

## 2. Fuera de alcance

- Cantidades por producto (p. ej. "2kg de tomates") — queda para una futura spec si hace falta comparar importes reales de una compra concreta, no precios de referencia.
- Añadir productos nuevos al catálogo desde la simulación — los productos de la lista siempre vienen del catálogo ya existente (`products`), gestionado en spec 036.
- Tener en cuenta ofertas, cupones o precios no reflejados en tickets ya importados — los precios salen exclusivamente del histórico de tickets (spec 034).
- Guardar o comparar simulaciones anteriores en el tiempo.
- Optimizar el reparto por otros criterios distintos de precio y número de supermercados (p. ej. cercanía, tiempo de desplazamiento, franjas horarias) — solo se consideran precio y número de súpers a visitar.

---
**Siguiente paso:** `plan.md`.
