# Spec 010 — Rediseño visual completo (handoff "Broadsheet" editorial)

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** handoff de Claude Design en `/Users/diego.juez/Downloads/design_handoff_gestion_economia/` (`Gestion Economia.dc.html`, `broadsheet-styles.css`, `README.md`, 8 capturas) — a diferencia de spec 008 (donde solo la pantalla de Inicio estaba realmente maquetada), este handoff trae **las 8 pantallas completas**, un sistema de componentes reutilizables (tarjetas, botones, etiquetas, control segmentado, campos de formulario, tabla) y su propio README con la especificación de cada pantalla.

## 0. Qué cambia respecto a lo que ya existe

Esta spec **sustituye** el sistema visual de spec 008 (paleta cálida + Georgia solo en titulares) por uno nuevo: paleta editorial (papel `#f3f2f2` / tinta `#201e1d`), acentos cian `#0088b0` y magenta `#d6006c` con rampas tonales OKLCH de 9 pasos cada uno, tipografía **Source Serif 4 en titulares y cuerpo de texto** (no solo titulares, a diferencia de spec 008), escala de espaciado propia (`--space-1…8`) y una librería de componentes CSS reutilizables (`.card`, `.btn`, `.tag`, `.seg`, `.field`/`.input`, `.table`) en vez de estilos ad-hoc por página.

También afecta a spec 009 (adaptación a móvil): el menú lateral y las tarjetas/listados que spec 009 apiló en móvil cambian de estructura visual — hay que confirmar que el comportamiento responsive (menú superpuesto, sin scroll horizontal) se conserva sobre el nuevo diseño, no solo que se vea bien en escritorio.

## 1. Decisiones tomadas con Diego antes de escribir esta spec

1. **Se adoptan las clases del sistema de componentes** (`.card`, `.btn-primary/-secondary/-ghost`, `.tag-accent/-neutral`, `.seg`, `.field`/`.input`, `.table`) en vez de mantener la convención "casi sin className, todo por id" que venían siguiendo specs 007-009. Motivo: estos componentes se repiten decenas de veces por pantalla — exactamente el criterio que ya justificaba las excepciones puntuales anteriores (`.dot`, `.progress-bar`, `.sr-only`), aquí llevado a todo el sistema en vez de a 2-3 elementos sueltos. `constitution.md §5` ya deja los detalles de estilo a cada plan de feature, así que no hace falta modificar la constitution — se documenta el cambio de convención en `plan.md` de esta spec.
2. **Se mantienen los puntos de color como indicador de sección/categoría**, no se añade una librería de iconos (Phosphor). El README del handoff los describe como "placeholder a sustituir por iconos" — se descarta esa sugerencia porque revertiría la decisión ya tomada en spec 008 (H5) de quitar `lucide-react` y no depender de una librería de iconos.

## 2. Alcance: reconciliar el handoff con la funcionalidad real ya existente

El handoff es un **prototipo de referencia visual**, no código de producción (así lo dice su propio README): usa datos ficticios, no tiene estados de carga/error, y varias pantallas están simplificadas respecto a lo que la app real ya hace hoy. Mismo criterio que se aplicó en spec 008 para "Inicio": **se recrea el aspecto visual, nunca se elimina funcionalidad real ya implementada** que el handoff no muestra. En concreto:

- **Categorías**: el handoff muestra una cuadrícula de solo lectura (nombre, nº de movimientos, importe, % del gasto). La página real permite además crear, renombrar y eliminar categorías (spec 002 H3) — esa funcionalidad se conserva, añadida a las tarjetas del nuevo diseño (no se pierde ningún botón existente).
- **Ingresos y gastos**: el control segmentado Gastos/Ingresos y los filtros del handoff ya se corresponden con lo que existe (spec 002/006); el botón "+ Añadir movimiento" pasa a enlazar a la página "Registrar" ya existente, sin crear un formulario inline nuevo. Se conservan las pestañas Movimientos/Resumen/Registrar de spec 006 H2, que el handoff no representa por ser una sola pantalla de referencia.
- **Dashboard**: el handoff muestra un gráfico de barras simplificado (sin ejes/leyenda) y una lista de progreso por categoría. Se conservan los gráficos reales con Recharts (spec 002 H4/H5, con tooltip y leyenda, más accesibles que divs coloreados) y la vista anual completa, aplicándoles solo la paleta y tipografía nuevas; la lista de "gasto por categoría" con barra de progreso sí se adopta tal cual el handoff la propone.
- **Importar Excel**: se conserva el flujo completo de vista previa y confirmación (spec 003 H1), que el handoff no representa (su README dice explícitamente que no cubre estados intermedios); solo la zona de arrastrar/soltar y el estilo de las tarjetas de importaciones recientes adoptan el nuevo diseño.
- **Objetivos y presupuestos**: se conservan los formularios de crear/editar objetivo (mensual y anual) y presupuestos (spec 004), aplicando el estilo de tarjeta + etiqueta de estado + barra de progreso del handoff a la parte de resumen.
- **Tu perfil**: el handoff muestra un único formulario (nombre, correo editable, moneda). La app real no permite editar el correo (decisión de spec 001 H7: cambiar email tiene implicaciones propias, no implementado) — el campo de correo se mantiene de solo lectura, mostrado con el estilo del handoff pero sin convertirlo en un `<input>` editable. Se conservan las secciones de cambiar contraseña, exportar datos y eliminar cuenta (spec 001 H7/H8), que el handoff no representa, con el mismo estilo de tarjeta.
- **Dispositivos y sesiones**: coincide casi tal cual con lo ya implementado (spec 001 H6 + spec 009 T5); solo cambia el estilo visual.

## 3. Historias de usuario

**H1 — Sistema visual y componentes base**

Como usuario, quiero que toda la app comparta un mismo lenguaje visual (color, tipografía, espaciado, tarjetas, botones, etiquetas) coherente con el nuevo diseño, para que se sienta como un producto único y cuidado.

- Criterio 1: los tokens de color (papel/tinta/acentos cian y magenta con sus rampas), tipografía (Source Serif 4 en titulares y cuerpo) y espaciado del handoff sustituyen a los de spec 008 en `index.css`.
- Criterio 2: los componentes reutilizables del handoff (tarjeta, botón primario/secundario/ghost, etiqueta, control segmentado, campo de formulario, tabla) quedan disponibles como clases CSS, documentadas igual que las excepciones anteriores a "sin className".
- Criterio 3: ninguna pantalla pierde funcionalidad real existente por adoptar el nuevo estilo (ver §2).

**H2 — Menú lateral rediseñado**

Como usuario, quiero un menú lateral con el aspecto del nuevo diseño (marca "Ledger", puntos de color, plegado a franja estrecha), para navegar igual que hoy pero con el look editorial nuevo.

- Criterio 1: el menú expandido/plegado (236px/68px, spec 005/007) adopta los colores y tipografía nuevos; la marca "Ledger" (spec 008 H4) se conserva.
- Criterio 2: el comportamiento de navegación, plegado y el menú superpuesto de móvil (spec 009 H1) siguen funcionando exactamente igual, solo cambia su aspecto.

**H3 — Inicio rediseñado**

Como usuario, quiero ver el resumen del mes y mis últimos movimientos con el estilo de tarjeta del nuevo diseño.

- Criterio 1: 3 tarjetas de resumen (balance, ingresos, gastos) con el estilo `.card` del handoff.
- Criterio 2: listado de últimos movimientos con punto de color, concepto/comercio/fecha e importe alineado a la derecha, con el estilo del handoff.
- Criterio 3: se conserva todo lo que spec 008 H3 ya implementó y no aparece en el handoff (referencia al objetivo de ahorro, estado vacío, aviso de verificación pendiente).

**H4 — Categorías rediseñada**

Como usuario, quiero ver mis categorías como tarjetas con su gasto y peso relativo, y seguir pudiendo crear, renombrar y eliminar categorías igual que hoy.

- Criterio 1: cuadrícula de tarjetas con punto de color, nombre, nº de movimientos, importe y % del gasto total.
- Criterio 2: las acciones existentes (crear, renombrar, eliminar, subcategorías) se conservan, integradas en el nuevo diseño de tarjeta.

**H5 — Ingresos y gastos rediseñada**

Como usuario, quiero filtrar y ver mis movimientos con el nuevo estilo de tarjeta y controles.

- Criterio 1: control segmentado Gastos/Ingresos y filtros (fecha, categoría, texto) con el estilo del handoff.
- Criterio 2: cada movimiento como tarjeta con punto de color, concepto + etiqueta de categoría, comercio/método/fecha, importe y botones Editar/Eliminar.
- Criterio 3: se conservan las pestañas Movimientos/Resumen/Registrar (spec 006).

**H6 — Dashboard rediseñado**

Como usuario, quiero ver mis gráficos con la paleta y tipografía nuevas, y el desglose por categoría con barra de progreso como en el handoff.

- Criterio 1: los gráficos existentes (Recharts, spec 002/007) adoptan los colores y tipografía del nuevo sistema, sin perder ejes, leyenda ni tooltip.
- Criterio 2: el desglose de gasto por categoría se muestra como lista con barra de progreso de 8px, como en el handoff.
- Criterio 3: la vista anual (tabla/gráfico de evolución mensual) se conserva con el nuevo estilo.

**H7 — Importar Excel rediseñado**

Como usuario, quiero que la zona de subida de archivo y el historial de importaciones tengan el nuevo estilo, sin perder la vista previa y confirmación antes de importar.

- Criterio 1: zona de arrastrar/soltar con borde discontinuo y botón primario, como en el handoff.
- Criterio 2: "importaciones recientes" como tarjetas con etiqueta de estado.
- Criterio 3: se conserva el flujo completo de vista previa/confirmación (spec 003).

**H8 — Objetivos y presupuestos rediseñado**

Como usuario, quiero ver mis objetivos y presupuestos como tarjetas con etiqueta de estado y barra de progreso, y seguir pudiendo crearlos/editarlos igual que hoy.

- Criterio 1: cada objetivo/presupuesto como tarjeta con nombre, etiqueta de estado ("En curso"/"Excedido"), importe gastado de un límite, y barra de progreso coloreada según estado.
- Criterio 2: se conservan los formularios de crear/editar objetivo (mensual/anual) y presupuestos (spec 004).

**H9 — Tu perfil rediseñado**

Como usuario, quiero ver mis datos de cuenta con el nuevo estilo de tarjeta y formulario.

- Criterio 1: datos de cuenta (nombre editable, correo de solo lectura, moneda, idioma) con el estilo del handoff.
- Criterio 2: se conservan las secciones de cambiar contraseña, exportar datos y eliminar cuenta (spec 001 H7/H8), con el mismo estilo de tarjeta.

**H10 — Dispositivos y sesiones rediseñado**

Como usuario, quiero ver mis sesiones activas con el nuevo estilo de tarjeta.

- Criterio 1: cada sesión como tarjeta con nombre de dispositivo, etiqueta "Esta sesión" en la actual, ubicación/última actividad, y botón "Cerrar sesión".

**H11 — El nuevo diseño sigue siendo usable en móvil**

Como usuario en un móvil, quiero que todo lo conseguido en spec 009 (menú superpuesto, listados apilados, sin scroll horizontal) siga funcionando igual sobre el nuevo diseño visual.

- Criterio 1: el menú superpuesto de spec 009 H1 sigue abriendo/cerrando igual, con el estilo nuevo.
- Criterio 2: ninguna pantalla (de las 8 autenticadas ni de las de acceso) provoca scroll horizontal en anchos de 360-430px con el nuevo diseño.
- Criterio 3: las tarjetas de listados (Movimientos, Categorías, Dispositivos, Inicio) siguen siendo legibles y sin perder acciones en móvil — se reutiliza el criterio de spec 009 H3 (apilar en bloque cuando haga falta), adaptado a la estructura de `.card` en vez de a los `<li>`/`<table>` anteriores.

## 4. Fuera de alcance

- Modales, formularios multi-paso o estados de carga asíncronos nuevos — el propio handoff dice explícitamente que no los representa; no se inventan en esta spec.
- Iconos Phosphor (decisión §1.2): se mantienen los puntos de color.
- Cualquier cambio de datos, endpoints o comportamiento de negocio — esta spec es puramente visual, igual que spec 008.
- Optimización específica de tablet — igual que spec 009, se trabaja para escritorio y el rango de móvil ya cubierto.

## 5. Nota sobre el fichero de estilos del handoff

`broadsheet-styles.css` incluye, además de los tokens y componentes descritos arriba, varias clases decorativas de "separación CMYK/tramado" (`.halftone`, `.cmyk`, `.cmyk-num`, `.cmyk-head`) pensadas para tratamientos de imagen tipo prensa, con comentarios que remiten a un fichero `print-plates.js` **que no está incluido en este handoff** y que ninguna de las 8 pantallas usa (confirmado revisando `Gestion Economia.dc.html`: no aparece ninguna de esas clases). No se van a implementar ni a cargar ningún script externo para esto — no tiene relación con ninguna de las 8 pantallas de la app, y cargar un script de origen desconocido no es algo que vaya a hacer sin verificarlo contigo primero. Si en algún momento quieres ese tratamiento visual para algo concreto, se trata como una spec aparte.

---
**Pendiente de aprobación por Diego.** Siguiente paso: `plan.md` (tokens exactos, mapeo de cada clase del handoff, plan pantalla a pantalla reconciliando con la funcionalidad real, y el impacto en spec 009).
