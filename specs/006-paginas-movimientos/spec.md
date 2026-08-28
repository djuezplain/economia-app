# Spec 006 — Separar "Ingresos y gastos" en páginas independientes

**Estado:** Aprobado
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** feedback directo de Diego — hoy `/movements` (spec 002, H1/H2) muestra a la vez, en una sola pantalla con scroll: selector de tipo (Gastos/Ingresos), filtros, resumen, listado de movimientos y formulario de registro/edición. Pide que Resumen, Movimientos y Registrar sean páginas independientes.

## 1. Por qué

La página actual amontona 3 tareas distintas (ver una foto agregada del periodo, buscar/filtrar el detalle de movimientos, y registrar uno nuevo) en una sola pantalla larga. Separarlas en páginas independientes permite ir directamente a la que se necesita, sin desplazarse por secciones que no interesan en ese momento.

## 2. Historias de usuario

**H1 — Tres páginas, una por tarea**

Como usuario autenticado, quiero que "Resumen", "Movimientos" y "Registrar" sean pantallas independientes dentro de la sección de ingresos y gastos, para poder ir directamente a la que necesito sin cargar ni desplazarme por las demás.

- Criterio de aceptación 1: "Resumen" muestra el total, la media mensual y el desglose por categoría/subcategoría del tipo seleccionado — mismo contenido que hoy la sección "Resumen" de `/movements`, sin el listado detallado ni el formulario.
- Criterio de aceptación 2: "Movimientos" muestra los filtros (fechas, categoría, comercio, búsqueda en concepto) y el listado resultante, con sus acciones de editar y eliminar — sin el resumen ni el formulario de registro visibles a la vez.
- Criterio de aceptación 3: "Registrar" muestra solo el formulario de alta — sin resumen ni listado.
- Criterio de aceptación 4: cada una de las 3 páginas mantiene su propio selector Gastos/Ingresos, independiente de las demás — entrar en cualquiera de las 3 empieza siempre en "Gastos" por defecto, igual que hace hoy `/movements` (decisión tomada explícitamente con Diego, ver §5).

**H2 — Sub-navegación propia para moverse entre las 3**

Como usuario autenticado, quiero poder moverme entre Resumen, Movimientos y Registrar sin pasar por el menú lateral general, para no perder el contexto de que las tres pertenecen a la misma sección.

- Criterio de aceptación 1: el menú lateral (spec 005) sigue teniendo un único enlace "Ingresos y gastos" — no se convierte en 3 enlaces sueltos (decisión tomada explícitamente con Diego, ver §5).
- Criterio de aceptación 2: dentro de cualquiera de las 3 páginas hay una sub-navegación propia (p. ej. pestañas) con enlaces a las otras dos, visible en todo momento.
- Criterio de aceptación 3: la sub-página activa se distingue visualmente de las otras dos — mismo criterio que ya aplica al enlace activo del menú lateral (spec 005, H1 criterio 2).

**H3 — Editar un movimiento existente sigue siendo posible**

Como usuario autenticado, quiero poder editar un movimiento desde el listado de "Movimientos" aunque el formulario viva en otra página, para no perder esa función al separar las páginas.

- Criterio de aceptación 1: al pulsar "Editar" en un movimiento del listado de "Movimientos", se navega a "Registrar" con el formulario pre-rellenado con los datos de ese movimiento — mismo campo a campo que rellena hoy "Editar" dentro de la única página (decisión tomada explícitamente con Diego, ver §5).
- Criterio de aceptación 2: desde "Registrar" en modo edición se puede volver a "Movimientos" (al guardar, al cancelar, o directamente por la sub-navegación) — el sitio natural donde se iba a editar.
- Criterio de aceptación 3: "Registrar" en modo edición se distingue claramente de "Registrar" en modo alta — mismo título condicional ("Editar movimiento" / "Registrar gasto|ingreso") que ya usa la página de hoy.

## 3. Fuera de alcance de esta spec

- **Cambiar qué datos se muestran** en el resumen, los filtros o el formulario — se trata de mover el contenido ya existente a 3 páginas, no de rediseñarlo.
- **Compartir el tipo Gastos/Ingresos seleccionado entre las 3 páginas** — H1 criterio 4 ya fija que cada página es independiente.
- **Cualquier cambio a la spec 005** más allá de mantener un único enlace "Ingresos y gastos" en el menú lateral (H2 criterio 1) — la sub-navegación de H2 es propia de esta spec, no del menú lateral general.

## 4. Nota sobre la interacción con spec 005

`spec.md` de la spec 005 (§4, "Fuera de alcance") justifica no usar breadcrumbs con que las secciones son "de un único nivel (sin sub-páginas dentro de cada sección)". Con esta spec, "Ingresos y gastos" pasa a tener 3 sub-páginas — ese supuesto deja de ser estrictamente cierto para esa sección en concreto. No se propone añadir breadcrumbs (la sub-navegación de H2 ya cumple la misma función de saber dónde estás y poder moverte), pero se deja constancia aquí explícitamente en vez de dejar que el razonamiento de spec 005 quede desactualizado en silencio.

## 5. Decisiones

1. **Sub-navegación propia dentro de la sección, no 3 enlaces sueltos en el menú lateral** — decisión tomada explícitamente con Diego, frente a la alternativa de aplanar el menú lateral de spec 005 a 9 enlaces.
2. **Editar navega a "Registrar" con el formulario relleno, reutilizando el mismo formulario que el alta** — decisión tomada explícitamente con Diego, frente a duplicar un formulario de edición inline dentro de "Movimientos".
3. **El selector Gastos/Ingresos no se comparte entre páginas** — decisión tomada explícitamente con Diego, frente a compartirlo vía parámetro de URL.

---
**Aprobada por Diego.** Siguiente paso: `plan.md` (rutas exactas de las 3 páginas, dónde vive el componente de sub-navegación, cómo se pasa a "Registrar" el movimiento que se está editando).
