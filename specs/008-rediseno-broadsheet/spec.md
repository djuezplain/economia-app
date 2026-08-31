# Spec 008 — Rediseño visual "Broadsheet"

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** un rediseño hecho por Diego en el canvas de Diseño de Claude (`Gestion Economia.dc.html`, sistema "Broadsheet"). Del archivo solo hay una pantalla realmente maquetada e interactiva — **Inicio** — pese a que el propio historial de esa conversación de diseño afirma haber rediseñado las 8 secciones; el resto de enlaces de su menú lateral no responden a clic y no se ha encontrado ningún otro artboard en el canvas. Diego ha confirmado seguir adelante solo con lo que existe: tokens visuales nuevos para toda la app + Inicio rehecho a fondo (ver `Decisiones`).

## 1. Por qué

Spec 007 mejoró la app dentro de la estética por defecto del navegador (colores de sistema, tipografía `system-ui`, columna centrada de 1126px). El nuevo diseño de Diego propone una identidad visual propia — editorial/"broadsheet" (titulares serif, marca "Ledger", fondo cálido, tarjetas, menú a ancho completo) — que sustituye esa base. Esta spec adopta esos tokens visuales para toda la app y rehace la página de Inicio para igualar el mockup, ya que es la única pantalla de la que existe un diseño real.

## 2. Historias de usuario

**H1 — Sistema visual base (colores, tipografía, tarjetas)**

Como usuario autenticado, quiero que toda la app use la nueva identidad visual (tipografía de titulares con serifa, cuerpo de texto sans-serif, paleta cálida con acento azul-verdoso, tarjetas de fondo gris para agrupar cifras), para que se sienta como una única aplicación coherente y no como el estilo por defecto del navegador.

- Criterio de aceptación 1: se sustituyen los tokens de color y tipografía actuales (`--text`, `--text-h`, `--bg`, `--accent`, `--sans`, `--heading`, etc. en `index.css`) por los del nuevo sistema, con su variante de modo oscuro correspondiente (el proyecto ya detecta modo oscuro automáticamente, spec 001 en adelante; el mockup solo tiene modo claro, así que la variante oscura se deriva del mismo criterio de contraste que ya usan los tokens actuales).
- Criterio de aceptación 2: al ser tokens (variables CSS), toda página existente hereda el cambio automáticamente, sin que cada página necesite tocarse una por una — igual que ya ocurre hoy con el modo oscuro.
- Criterio de aceptación 3: no cambia ningún dato, estructura HTML semántica, comportamiento ni test funcional de las páginas que no se tocan explícitamente en esta spec (H3) — es un cambio puramente visual de tokens.
- Criterio de aceptación 4: se introduce un estilo de "tarjeta" (fondo gris, esquinas redondeadas, sin borde) reutilizable como patrón visual, usado por H3; no se aplica retroactivamente a otras páginas en esta spec.

**H2 — Layout a ancho completo**

Como usuario autenticado, quiero que el menú lateral y el contenido ocupen todo el ancho de la ventana, para aprovechar el espacio en pantallas grandes en vez de ver una columna centrada con marco.

- Criterio de aceptación 1: se elimina el contenedor centrado de ancho fijo (`#root`, 1126px, borde lateral) — el menú lateral y `#app-content` pasan a ocupar el 100% del ancho disponible.
- Criterio de aceptación 2: en pantallas estrechas, el contenido sigue siendo legible (no aparecen líneas de texto absurdamente largas) — se acota el ancho de lectura del contenido de texto (p. ej. párrafos y formularios), no el del contenedor general.
- Criterio de aceptación 3: no cambia el comportamiento de plegado del menú lateral (spec 005/007), solo su anchura relativa al ocupar toda la ventana.

**H3 — Página de Inicio rediseñada**

Como usuario autenticado, quiero que Inicio muestre un resumen del mes (balance, ingresos, gastos) y mis últimos movimientos, en vez del texto genérico actual, para tener de un vistazo la misma primera pantalla que hoy solo obtengo entrando en Dashboard y Movimientos por separado.

- Criterio de aceptación 1: Inicio muestra 3 tarjetas de resumen del mes en curso — Balance del mes, Ingresos, Gastos — con los mismos totales que ya calcula Dashboard (spec 002 H4), reutilizando esa lógica, no una nueva.
- Criterio de aceptación 2: la tarjeta de Balance incluye una referencia al objetivo de ahorro del mes si existe uno configurado (spec 004 H1) — igual que hoy hace Goals, reutilizando ese dato, no un cálculo nuevo.
- Criterio de aceptación 3: Inicio muestra un listado de los últimos movimientos (fecha, categoría/comercio, importe), con un indicador de color por tipo (ingreso vs. gasto) — reutilizando los movimientos ya existentes (spec 002 H1/H2), limitado a un número razonable (p. ej. 5-10), no la lista completa.
- Criterio de aceptación 4: cada fila del listado enlaza o es coherente con la página de Movimientos existente para ver el detalle completo — Inicio no duplica esa funcionalidad, solo adelanta un resumen.
- Criterio de aceptación 5: el aviso de verificación de email pendiente (spec 001 H2) y el enlace a registro/login para usuarios no autenticados se mantienen tal cual funcionan hoy.
- Criterio de aceptación 6: en un mes sin movimientos, se muestra un estado vacío explícito en vez de tarjetas con "0,00 €" sin contexto o un listado en blanco (mismo criterio que spec 007 H2 en Dashboard).

**H4 — Marca "Ledger" en el menú lateral**

Como usuario autenticado, quiero ver el nombre "Ledger" en la cabecera del menú lateral, para que la app tenga una identidad de marca reconocible en vez de solo enlaces sueltos.

- Criterio de aceptación 1: el menú lateral muestra "Ledger" como cabecera/marca, visible tanto plegado como desplegado (con el mismo criterio de accesibilidad que el resto del menú plegado, spec 007 H5 criterio 2).
- Criterio de aceptación 2: no sustituye el título real de la aplicación en otros lugares (p. ej. `<title>` del documento, metadatos) salvo que se acuerde explícitamente — se limita a la marca visual del menú lateral.

**H5 — Indicador de sección activa por color, sin iconos por sección**

Como usuario autenticado, quiero identificar la sección activa del menú por un indicador de color simple, para un menú más limpio y coherente con el resto del sistema visual.

- Criterio de aceptación 1: cada enlace del menú lateral muestra un punto (bullet) de color junto a su texto; el de la sección activa usa el color de acento, el resto un color neutro — sustituye a los iconos de `lucide-react` introducidos en spec 007 H5.
- Criterio de aceptación 2: con el menú plegado, el punto de color seguirá siendo insuficiente por sí solo para identificar la sección (no es texto ni tiene significado por forma) — se mantiene un `aria-label`/`title` con el nombre completo (igual que ya hace spec 007 H5 criterio 2), y se decide en `plan.md` si además se conserva alguna letra/inicial visible o solo el punto.
- Criterio de aceptación 3: la dependencia `lucide-react` se retira de `package.json` si tras esta spec no queda ningún otro uso en el proyecto (a confirmar en `plan.md`).
- Criterio de aceptación 4: la sección activa se sigue distinguiendo también por el estilo de texto ya existente (spec 005 H1 criterio 2, negrita/color) — el punto es un añadido, no la única señal.

## 3. Fuera de alcance de esta spec

- **Rediseño pantalla a pantalla de Categorías, Movimientos, Dashboard, Importar Excel, Objetivos y presupuestos, Perfil y Dispositivos y sesiones** — no existe mockup real de ellas (ver `Basado en`); solo heredan los tokens visuales de H1 (colores, tipografía, layout de H2), no una nueva estructura de página. Cada una podrá ser objeto de una spec propia más adelante si Diego decide completarlas en el canvas de Diseño o directamente en código.
- **Cambiar qué datos se calculan o de dónde vienen** — H3 reutiliza cálculos y datos ya existentes (specs 002/004), no introduce ninguno nuevo.
- **Modo claro/oscuro como concepto** — se mantiene la detección automática ya existente; solo cambian los valores de los tokens de color.
- **Renombrar la aplicación de forma oficial** (dominio, metadatos, comunicación a usuarios) — H4 se limita a la marca visual del menú lateral.
- **Colores por categoría configurables por el usuario** — el indicador de color de H3 (ingreso/gasto) y H5 (activo/inactivo) es fijo por tipo, no una paleta personalizable por categoría.

## 4. Decisiones

Todas tomadas explícitamente con Diego antes de escribir esta spec:

1. **Iconos del menú (spec 007 H5) → punto de color (H5 de esta spec)**: se sustituyen los iconos de `lucide-react` por el indicador de punto de color del mockup, en vez de mantenerlos o combinarlos con el punto.
2. **Marca "Ledger"**: se adopta como marca visual del menú lateral (H4), tal como aparece en el mockup.
3. **Alcance**: tokens visuales globales (H1/H2) para toda la app + rediseño a fondo de Inicio (H3), ya que es la única pantalla con mockup real — no solo tokens sin tocar Inicio, ni limitarse a Inicio sin tokens globales.
4. **Layout**: se elimina la columna centrada de ancho fijo (1126px con borde) en favor de un layout a ancho completo (H2), como en el mockup.

## 5. Pendiente de aclarar en `plan.md`

- Valores exactos de los tokens de color (el mockup solo se ha podido inspeccionar visualmente vía capturas de pantalla del canvas de Diseño, no se ha podido leer su CSS real por estar en un iframe aislado de origen cruzado) — se aproximarán por inspección visual y se ajustarán con Diego al revisar el plan.
- Fuente serif concreta para titulares y fuente sans para cuerpo (el mockup no expone qué familia tipográfica usa realmente).
- Tratamiento del punto de color en el menú plegado (criterio H5.2).
- Variante de modo oscuro de la nueva paleta (el mockup no tiene una).

---
**Aprobada por Diego.** Siguiente paso: `plan.md` (tokens exactos de color/tipografía, estructura de `#app-shell`/`#app-sidebar` para el layout a ancho completo, componentes de tarjeta y listado de movimientos de Inicio, retirada de `lucide-react`).
