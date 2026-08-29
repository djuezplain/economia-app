# Spec 009 — Adaptación a móvil

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** verificación visual hecha a petición de Diego tras cerrar spec 008 — capturas de la app en un viewport de 390px de ancho (tamaño habitual de móvil) muestran que el menú lateral (ancho fijo, spec 005/007/008) nunca se adapta, empuja el contenido a una columna estrecha, provoca scroll horizontal y hace que títulos y listados se partan palabra a palabra. Solo existe una media query en toda la app (a 1024px, que reduce el tamaño de letra) — nada pensado para pantallas de teléfono.

## 1. Por qué

La app se ha construido y probado siempre pensando en escritorio. Nadie ha revisado hasta ahora si es usable en un móvil, y no lo es: el menú lateral de ancho fijo (`#app-sidebar`, 220px) y las tablas/listados de varias columnas (Movimientos, Dashboard, Categorías, Inicio) no caben en una pantalla de teléfono y quedan ilegibles. Esta spec adapta la app existente a móvil sin cambiar qué hace cada página ni su diseño en escritorio (spec 008) — es una capa de responsive, no un rediseño.

## 2. Historias de usuario

**H1 — Menú lateral utilizable en móvil**

Como usuario autenticado en un móvil, quiero acceder al menú de navegación sin que ocupe permanentemente parte de la pantalla, para poder leer y usar el contenido de cada página con todo el ancho disponible.

- Criterio de aceptación 1: por debajo de un ancho de pantalla a definir en `plan.md`, el menú lateral no empuja el contenido — permanece oculto hasta que el usuario lo abre.
- Criterio de aceptación 2: existe un control siempre visible y accesible (botón "menú", con su nombre accesible) para abrir el menú; una vez abierto, se puede cerrar tanto con ese mismo control como seleccionando una sección de la navegación.
- Criterio de aceptación 3: con el menú abierto en móvil, el resto de la página queda claramente distinguible como "detrás" (p. ej. una capa de fondo) y no se puede interactuar con el contenido de detrás hasta cerrarlo.
- Criterio de aceptación 4: en pantallas de escritorio (por encima del ancho definido en criterio 1), el comportamiento actual del menú (plegar/desplegar sin ocultarse del todo, spec 005/007) no cambia.

**H2 — Contenido legible sin desbordamiento horizontal**

Como usuario en un móvil, quiero que ninguna página necesite desplazamiento horizontal ni parta palabras sueltas en una línea, para poder leer con comodidad.

- Criterio de aceptación 1: en anchos de móvil habituales (360-430px), ninguna página autenticada ni de acceso (login, registro, verificación, etc.) provoca scroll horizontal de la página completa.
- Criterio de aceptación 2: los títulos (`h1`/`h2`) reducen su tamaño lo suficiente para no partirse en una palabra por línea en esos anchos.
- Criterio de aceptación 3: los formularios (Registrar movimiento, Objetivos, Perfil...) ocupan el ancho disponible en móvil en vez de mantener el `max-width` pensado para escritorio (spec 008 H2).

**H3 — Tablas y listados de varias columnas, legibles en móvil**

Como usuario en un móvil, quiero que los listados y tablas con varias columnas de información (Movimientos, desglose del Dashboard, últimos movimientos de Inicio, Categorías) se puedan leer sin comprimirse ni desbordarse, para encontrar la información de cada fila sin esfuerzo.

- Criterio de aceptación 1: por debajo del ancho definido en H1, cada fila de una tabla o listado con varias columnas pasa a mostrarse como un bloque apilado (una pieza de información debajo de otra) en vez de columnas una junto a otra.
- Criterio de aceptación 2: no se pierde ninguna información ni acción disponible hoy en escritorio (p. ej. los botones "Editar"/"Eliminar" de Movimientos siguen presentes y utilizables).
- Criterio de aceptación 3: el cambio es puramente de presentación — no cambia qué datos se muestran ni el comportamiento de filtros, formularios o acciones.

**H4 — Auditoría de las páginas sin menú lateral**

Como usuario en un móvil, quiero que las páginas de acceso (login, registro, verificación de email, recuperación de contraseña, callback de Google) también se vean bien, para no encontrarme con una sola pantalla mal adaptada en medio de un flujo por lo demás correcto.

- Criterio de aceptación 1: se revisan todas las páginas fuera del menú lateral en los mismos anchos de móvil que el resto de la app.
- Criterio de aceptación 2: cualquier problema encontrado (desbordamiento, texto cortado, controles inaccesibles) se corrige con el mismo criterio de H2.

## 3. Fuera de alcance de esta spec

- **Cambiar el diseño visual de escritorio** (spec 008) — esta spec añade comportamiento responsive, no toca colores, tipografía base ni el layout en pantallas grandes.
- **Una "app" o experiencia nativa/PWA** — sigue siendo la misma aplicación web, solo adaptada a anchos estrechos.
- **Gestos táctiles avanzados** (deslizar para abrir/cerrar el menú, pull-to-refresh, etc.) — el menú de H1 se abre y cierra con controles pulsables, no gestos.
- **Cambiar qué datos o funcionalidades existen en cada página** — H3 es puramente de presentación (spec.md H3 criterio 3).
- **Optimizar para tablets** de forma específica — se trabaja sobre el rango de móvil y se confirma que el comportamiento de escritorio (spec 005/007/008) sigue intacto por encima de él; un rango intermedio de tablet no se diseña a propósito.

## 4. Decisiones

Tomadas explícitamente con Diego antes de escribir esta spec:

1. **Menú lateral en móvil: oculto tras un botón**, no una franja de iconos siempre visible — se abre como panel superpuesto (patrón "hamburguesa"), en vez de mantenerse visible y estrecho.
2. **Tablas y listados: se apilan en bloques** en móvil, en vez de permitir scroll horizontal manteniendo las columnas.
3. **Alcance: toda la app** — las 8 páginas autenticadas más todas las páginas de acceso sin menú (H4), no solo las páginas con menú lateral.

---
**Pendiente de aprobación por Diego.** Siguiente paso: `plan.md` (breakpoint exacto, estructura del menú superpuesto y su gestión de foco/accesibilidad, qué tablas/listados concretos se apilan y cómo, ajustes de tipografía por breakpoint).
