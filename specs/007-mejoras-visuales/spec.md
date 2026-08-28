# Spec 007 — Mejoras visuales

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** conversación directa con Diego — la app funciona correctamente (specs 001 a 006 cerradas) pero visualmente se apoya casi por completo en el estilo por defecto del navegador. Pide una spec de mejoras visuales, incluyendo el uso de Recharts (declarado en `constitution.md` §3 desde el inicio pero sin usar todavía).

## 1. Por qué

Las specs 001-006 han priorizado que la app funcione y esté bien probada, no su apariencia. El resultado es correcto pero difícil de leer de un vistazo: los importes que superan un presupuesto no se distinguen de los que no, los objetivos y el dashboard muestran su progreso como texto y listas en vez de aprovechar Recharts, y los formularios y tablas no tienen apenas espaciado. Esta spec agrupa un conjunto de mejoras visuales concretas, acotadas, sobre páginas ya existentes — sin cambiar qué datos se muestran ni la navegación entre páginas (specs 005/006).

## 2. Historias de usuario

**H1 — Código de color en importes según presupuesto**

Como usuario autenticado, quiero que un gasto o categoría que supera su presupuesto (o su umbral de aviso, spec 004 H4) se distinga visualmente del resto, para detectarlo de un vistazo sin tener que leer cada cifra.

- Criterio de aceptación 1: en la página de Objetivos (`/goals`), el progreso de cada presupuesto usa uno de 4 colores según su estado, con una subdivisión visual adicional sobre los umbrales ya existentes de spec 004 H4 (no se añade ningún umbral configurable nuevo, es puramente visual):
  - Verde — por debajo del 90% del umbral de aviso (holgado).
  - Ámbar — entre el 90% del umbral de aviso y el propio umbral de aviso (cerca).
  - Naranja — ha superado el umbral de aviso pero sigue por debajo del 100%.
  - Rojo — ha alcanzado o superado el 100% del presupuesto.
- Criterio de aceptación 2: el color no es la única señal — se acompaña siempre de texto o icono equivalente (p. ej. "80% — cerca del límite"), para no depender solo del color (accesibilidad).
- Criterio de aceptación 3: el resto de importes (ingresos, gastos sin presupuesto asociado) no cambian de color — el código de color se aplica solo donde hay un presupuesto/umbral de por medio, para no introducir un significado donde no lo hay.

**H2 — Gráficos con Recharts en el dashboard**

Como usuario autenticado, quiero ver un gráfico de la evolución de mis gastos por categoría en el dashboard mensual/anual (spec 002 H4/H5), para entender la distribución más rápido que leyendo una lista de cifras.

- Criterio de aceptación 1: el dashboard mensual muestra un gráfico (Recharts) del desglose de gastos por categoría del mes — mismos datos que hoy expone la lista existente, no datos nuevos.
- Criterio de aceptación 2: el dashboard anual muestra un gráfico de evolución mensual (ingresos y/o gastos a lo largo de los meses del año) — mismos datos que hoy expone la vista anual existente.
- Criterio de aceptación 3: el listado/texto existente con las mismas cifras se mantiene junto al gráfico (no se sustituye) — el gráfico es un complemento visual, no la única forma de acceder al dato exacto.
- Criterio de aceptación 4: en un mes o año sin movimientos, se muestra un estado vacío explícito en vez de un gráfico roto o en blanco sin explicación.

**H3 — Barra de progreso visual en Objetivos**

Como usuario autenticado, quiero ver el avance hacia mi objetivo de ahorro y hacia cada presupuesto como una barra de progreso, para captar de un vistazo cuánto llevo sin tener que interpretar un porcentaje en texto.

- Criterio de aceptación 1: el objetivo de ahorro (mensual y anual) muestra una barra de progreso hacia la meta, además del texto/porcentaje que ya muestra hoy.
- Criterio de aceptación 2: cada presupuesto (global y por categoría) muestra su propia barra de progreso, coherente con el código de color de H1.
- Criterio de aceptación 3: una barra que supera el 100% lo representa de forma clara (p. ej. la barra llena con un indicador de exceso), no se corta ni se comporta de forma inesperada.

**H4 — Espaciado y agrupación en formularios y tablas**

Como usuario autenticado, quiero que los formularios (Registrar movimiento, Objetivos) y las tablas/listados (Movimientos, Presupuestos) tengan más aire visual, para leerlos y rellenarlos más cómodamente.

- Criterio de aceptación 1: los campos de un formulario tienen espaciado vertical consistente entre sí y están agrupados visualmente (p. ej. por bloques relacionados), en vez de aparecer como una lista de campos pegados.
- Criterio de aceptación 2: las filas de las tablas/listados (Movimientos, desglose de Objetivos) tienen más espaciado vertical y la cabecera se distingue visualmente del resto de filas.
- Criterio de aceptación 3: no cambia ningún campo, columna, orden de tabulación ni comportamiento funcional de los formularios o tablas existentes — es un cambio puramente visual.

**H5 — Iconografía simple en el menú lateral**

Como usuario autenticado, quiero que cada sección del menú lateral (spec 005) tenga un icono simple junto a su nombre, para escanear el menú más rápido, especialmente cuando está plegado.

- Criterio de aceptación 1: cada una de las secciones del menú lateral muestra un icono junto a (o en vez de, cuando está plegado) su texto.
- Criterio de aceptación 2: con el menú plegado (spec 005), el icono sigue siendo suficiente para identificar la sección — con un `title`/`aria-label` accesible con el nombre completo.
- Criterio de aceptación 3: la sección activa se sigue distinguiendo igual que hoy (spec 005 H1 criterio 2) — el icono es un añadido, no un sustituto de esa señal.

## 3. Fuera de alcance de esta spec

- **Cualquier framework de CSS o librería de componentes** (Tailwind, Material UI, etc.) — se sigue trabajando sobre HTML semántico y CSS propio, tal como fija la filosofía actual del proyecto; esta spec mejora el CSS existente, no lo sustituye por un framework.
- **Cambiar qué datos se calculan o se muestran** — H1 a H5 son presentación de datos ya existentes (spec 002 y 004), no cálculos nuevos.
- **Cambiar la navegación o estructura de páginas** (specs 005/006) — el menú lateral sigue teniendo las mismas secciones y comportamiento de plegado; H5 solo le añade iconos.
- **Modo claro/oscuro** — ya existe (`constitution.md`, variables de color con detección automática) y no se toca en esta spec.
- **Gráficos fuera del dashboard** (p. ej. en Movimientos o Import) — H2 se limita al dashboard mensual/anual ya existente.
- **Rediseño de la landing/HomePage** — no mencionada por Diego, no se incluye salvo que se pida explícitamente.

## 4. Decisiones

1. **Alcance: las 5 historias (H1-H5) en esta misma iteración** — decisión tomada explícitamente con Diego, frente a priorizar solo un subconjunto (p. ej. H1+H3) y dejar el resto para una spec posterior.
2. **Iconos del menú lateral (H5): librería `lucide-react`**, no SVGs hechos a mano — decisión tomada explícitamente con Diego. Esto añade una fila nueva a `constitution.md` §3 (ver más abajo), tal como exige la constitution para cambios de stack.
3. **Umbrales de color de H1: 4 estados, no 2** — se añade una subdivisión visual (verde / ámbar / naranja / rojo, ver H1 criterio 1) sobre los umbrales ya existentes de spec 004 H4, sin introducir ningún umbral configurable nuevo — decisión tomada explícitamente con Diego.

---
**Aprobada por Diego.** Siguiente paso: `plan.md` (componentes de gráfico exactos, tokens de color a añadir a `index.css`, estructura de espaciado/agrupación, integración de `lucide-react`).
