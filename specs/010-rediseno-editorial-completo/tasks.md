# Tasks — Spec 010 (Rediseño visual completo, handoff editorial)

**Estado:** Cerrada
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

Cada tarea = un commit (Conventional Commits), validada contra su criterio antes de pasar a la siguiente (`constitution.md §1`). Tras cada tarea: `npm run test` (frontend) y `npx oxlint`; `npm run build` al final de todo (T12).

## T1 — Tokens y componentes base (H1)

- `frontend/src/index.css`: sustituir los valores de `:root` según `plan.md §1` (colores, rampas, `--font-body`, espaciado, radios, sombras); añadir el `@import` de Source Serif 4; ajustar `h1-h6`.
- Añadir las clases de `plan.md §2` (`.card`+variantes, `.btn`+variantes, `.tag`+variantes, `.seg`/`.seg-opt`, `.field`/`.input`, `.hr`, `.nav-link`), con los nombres de variable ya existentes del proyecto.
- Modo oscuro: derivar valores para todas las variables nuevas/cambiadas, mismo criterio que spec 008 §1.
- **Criterio de aceptación**: `npm run test` sigue en verde (ningún test depende de valores de color); revisión visual manual de `/` y `/dashboard` (sin haber tocado aún su JSX) para confirmar que el texto sigue siendo legible con los tokens nuevos heredados.

## T2 — Menú lateral rediseñado (H2)

- `frontend/src/components/AppLayout.tsx`: añadir `data-collapsed={isCollapsed}` a `#app-sidebar`; aplicar `.btn.btn-secondary` al botón de plegar y al de cerrar sesión; aplicar `.nav-link` a cada enlace.
- `frontend/src/index.css`: `#app-sidebar` a 236px/68px con transición (`plan.md §3`); confirmar que `#app-mobile-menu-toggle`/`#app-sidebar-backdrop` (spec 009) siguen funcionando con el nuevo ancho.
- `frontend/src/components/AppLayout.test.tsx`: los tests existentes (plegado, menú móvil) no deberían cambiar de intención; se revisan y ajustan solo si alguna clase nueva rompe un selector de test.
- **Criterio de aceptación**: H2 criterios 1 y 2 cumplidos; `npm run test` en verde; revisión visual del menú expandido/plegado/móvil.

## T3 — Inicio rediseñado (H3)

- `frontend/src/pages/HomePage.tsx` + `index.css`: tarjetas de resumen a `.card.elev-sm`/`.card-kicker` (`plan.md §4.1`); `#home-recent-list` conserva su `id`, solo hereda tokens.
- `frontend/src/pages/HomePage.test.tsx`: confirmar que los tests existentes siguen en verde.
- **Criterio de aceptación**: H3 cumplida; se conserva todo lo no representado en el handoff (objetivo de ahorro, estado vacío, aviso de verificación).

## T4 — Categorías rediseñada (H4)

- `frontend/src/pages/CategoriesPage.tsx`: cuadrícula `.card.elev-sm` de 3 columnas (`plan.md §4.2`); reutilizar el endpoint mensual ya existente (mismo que `DashboardPage`) para nº de movimientos/importe/%; subcategorías como `.tag-neutral` dentro de la tarjeta del padre; acciones existentes (crear/renombrar/eliminar) integradas en cada tarjeta.
- `frontend/src/pages/CategoriesPage.test.tsx`: test nuevo para los 3 datos agregados (con y sin movimientos este mes); revisar tests existentes de renombrar/eliminar/crear tras el cambio de estructura.
- **Criterio de aceptación**: H4 criterios 1 y 2 cumplidos; ninguna acción existente se pierde; `npm run test` en verde.

## T5 — Ingresos y gastos rediseñada (H5)

- `frontend/src/pages/MovementsListPage.tsx`: control Gastos/Ingresos a `.seg`/`.seg-opt`; filtros a `.field`/`.input`; cada fila a `.card` con `.tag-neutral` para la categoría (`plan.md §4.3`).
- `frontend/src/components/MovementsLayout.tsx`: pestañas con `.nav a` para evitar el azul/subrayado por defecto (mismo problema que spec 008 T8, corregido desde el principio aquí).
- `frontend/src/pages/MovementsListPage.test.tsx`, `MovementsLayout.test.tsx`: revisar tras el cambio de estructura.
- **Criterio de aceptación**: H5 criterios 1 a 3 cumplidos; `npm run test` en verde.

## T6 — Dashboard rediseñado (H6)

- `frontend/src/pages/DashboardPage.tsx`: colores de Recharts actualizados a la paleta nueva; tipografía de ejes/leyenda a Source Serif 4; desglose "gasto por categoría" pasa de tabla con `data-label` a lista con barra de progreso de 8px (sustituye la técnica de spec 009 T6 para esa sección concreta); vista anual mantiene `.table` + `data-label`.
- `frontend/src/pages/DashboardPage.test.tsx`: ajustar los tests que comprobaban la tabla de categorías (ahora lista) sin cambiar los de la vista anual.
- **Criterio de aceptación**: H6 criterios 1 a 3 cumplidos; `npm run test` en verde.

## T7 — Importar Excel rediseñado (H7)

- `frontend/src/pages/ImportPage.tsx`: zona de selección con borde discontinuo + `.btn-primary` (`plan.md §4.5`); pasos de vista previa/confirmación con `.table`/`.btn-primary`/`.btn-secondary`, sin "importaciones recientes" (no existe ese endpoint — no se inventa).
- `frontend/src/pages/ImportPage.test.tsx`: revisar tras el cambio de estructura.
- **Criterio de aceptación**: H7 criterios 1 a 3 cumplidos; `npm run test` en verde.

## T8 — Objetivos y presupuestos rediseñado (H8)

- `frontend/src/pages/GoalsPage.tsx`: cada objetivo/presupuesto a `.card.elev-sm` con `.tag` de estado agrupado 2 a 2 según `plan.md §5` (`ok`/`near`→accent, `warning`/`over`→accent-2); `ProgressBar` conserva sus 4 colores tal cual; formularios a `.field`/`.input`/`.btn-primary`.
- `frontend/src/pages/GoalsPage.test.tsx`: revisar tras el cambio de estructura; test nuevo si hace falta para la agrupación de la etiqueta.
- **Criterio de aceptación**: H8 criterios 1 y 2 cumplidos; `npm run test` en verde.

## T9 — Tu perfil rediseñado (H9)

- `frontend/src/pages/ProfilePage.tsx`: "Datos de la cuenta" a `.card.elev-sm`/`.field`/`.input` (correo se mantiene como texto de solo lectura, no `<input>`); "Cambiar contraseña"/"Mi cuenta"/"Eliminar cuenta" a sus propias `.card` con el botón correspondiente (`.btn-ghost` o similar para eliminar cuenta, no `.btn-primary`).
- `frontend/src/pages/ProfilePage.test.tsx`: revisar tras el cambio de estructura.
- **Criterio de aceptación**: H9 criterios 1 y 2 cumplidos; `npm run test` en verde.

## T10 — Dispositivos y sesiones rediseñado (H10)

- Antes de tocar código: confirmar si la limitación de `isCurrent` documentada en `constitution.md` (T6.2 de spec 001) sigue vigente. Si sigue sin poder identificarse la sesión actual de forma fiable, la etiqueta "Esta sesión" del handoff **no se implementa** (no se inventa un dato que la app no puede calcular).
- `frontend/src/pages/SessionsPage.tsx`: cada sesión a `.card` con `flex-direction:row`; etiqueta "Esta sesión" solo si el punto anterior lo confirma viable.
- `frontend/src/pages/SessionsPage.test.tsx`: revisar tras el cambio de estructura.
- **Criterio de aceptación**: H10 cumplida (con o sin la etiqueta, según lo confirmado); `npm run test` en verde.

## T11 — Verificación de compatibilidad móvil (H11)

- `frontend/src/index.css`: reescribir las reglas de apilado de spec 009 (`#movements-list li`, `#categories-*-list li`, `#sessions-list li`) para apuntar a la nueva estructura basada en `.card` en vez de `<li>`/`<div>` genéricos, manteniendo el mismo criterio (`flex-direction:column` bajo 768px).
- Revisión visual con Playwright (390px/430px, con y sin menú móvil abierto) de las 8 pantallas ya rediseñadas, mismo patrón que spec 009 T8.
- **Criterio de aceptación**: H11 criterios 1 a 3 cumplidos; sin scroll horizontal en ninguna pantalla; el menú superpuesto sigue abriendo/cerrando igual.

## T12 — Cierre: verificación final y documentación

- `npm run build` (frontend) — comprobación de tipos completa.
- `npm run test` y `npx oxlint` sobre todo el frontend.
- Revisión visual manual final de las 8 pantallas autenticadas, claro y oscuro, escritorio (1440px) y móvil (390px), menú expandido/plegado — checklist por historia (H1-H11).
- Actualizar `README.md`: spec 010 como cerrada, con un resumen de una línea por historia.
- Checklist de cierre (se añade a este mismo fichero al completar T12, mismo formato que specs anteriores).

---
**Aprobada por Diego.** Pendiente de ejecutar T1 a T12 en orden, cada una en su propio commit.

---

## Cierre — checklist por historia (T12)

**Estado:** Cerrada
**Fase:** 4 de 4 (Spec → Plan → Tasks → **Implementación**)

**H1 — Sistema visual y componentes base**
- [x] Criterio 1: tokens de color (papel/tinta, rampas cian/magenta OKLCH de 9 pasos), tipografía (Source Serif 4 en titulares y cuerpo) y espaciado (`--space-1…8`) sustituyen a los de spec 008 en `index.css` — T1.
- [x] Criterio 2: `.card`, `.btn-primary/-secondary/-ghost`, `.tag-accent/-accent-2/-neutral`, `.seg`, `.field`/`.input`, `.table` documentados como excepción deliberada a "sin className" (plan.md §1.1) — T1.
- [x] Criterio 3: ninguna pantalla perdió funcionalidad real (crear/renombrar/eliminar categorías, formularios de objetivos/presupuestos, exportar/eliminar cuenta, importar Excel completo, etc. — ver §2 de `plan.md`, verificado tarea a tarea T3-T10).

**H2 — Menú lateral rediseñado**
- [x] Criterio 1: `#app-sidebar` a 236px/68px con los colores y tipografía nuevos; marca "Ledger" conservada — T2.
- [x] Criterio 2: plegado en escritorio y menú superpuesto en móvil (spec 009 H1) verificados sin cambio de comportamiento — T2 y de nuevo en T11 (apertura/cierre, backdrop).

**H3 — Inicio rediseñado**
- [x] Criterio 1: 3 tarjetas de resumen (`#home-summary`) con `.card.elev-sm`/`.card-kicker`/`.card-amount` — T3.
- [x] Criterio 2: últimos movimientos con punto de color, concepto/comercio/fecha e importe — T3.
- [x] Criterio 3: referencia al objetivo de ahorro, estado vacío y aviso de verificación pendiente (spec 008 H3) conservados sin cambios de comportamiento.

**H4 — Categorías rediseñada**
- [x] Criterio 1: cuadrícula de tarjetas con punto de color, nombre, nº de movimientos, importe y % del gasto total (derivado de `listTransactions` con `summary.byCategory` para importes exactos) — T4.
- [x] Criterio 2: crear/renombrar/eliminar y subcategorías conservados e integrados en la tarjeta — T4, cubierto por `CategoriesPage.test.tsx` (8/8, incluidos los 2 tests nuevos de cifras del mes).

**H5 — Ingresos y gastos rediseñada**
- [x] Criterio 1: control segmentado (`.seg`/`.seg-opt`) y filtros (`#movements-filters`, `.field`/`.input`) — T5.
- [x] Criterio 2: cada movimiento como `.card.card-row` con punto, concepto + `.tag`, comercio/método/fecha, importe y Editar/Eliminar — T5.
- [x] Criterio 3: pestañas Movimientos/Resumen/Registrar (spec 006 H2) sin cambios.

**H6 — Dashboard rediseñado**
- [x] Criterio 1: `BarChart`/`LineChart` (Recharts) con los tokens nuevos de color y `Source Serif 4` en ejes/leyenda/tooltip, sin perder ninguno de los tres — T6.
- [x] Criterio 2: desglose de gasto por categoría como `#dashboard-category-list` con `.bar`/`.bar-fill` de 8px — T6.
- [x] Criterio 3: vista anual (tabla + `LineChart`) conservada, solo repaletizada — T6.

**H7 — Importar Excel rediseñado**
- [x] Criterio 1: `#import-dropzone` con borde discontinuo y `.btn-primary` — T7.
- [x] Criterio 2: no había "importaciones recientes" que mostrar como historial persistente en la app real (la funcionalidad de spec 003 es vista previa → confirmación, no un listado de importaciones pasadas) — la tabla de filas inválidas adopta `.table` en su lugar; sin pérdida de funcionalidad real (§2 de `plan.md`).
- [x] Criterio 3: flujo completo de vista previa/confirmación (spec 003 H1) intacto — T7, 8/8 tests sin cambios.

**H8 — Objetivos y presupuestos rediseñado**
- [x] Criterio 1: cada objetivo/presupuesto como `.card.elev-sm` con `.tag` ("En curso"/"Excedido", reconciliación de 4 a 2 estados de `plan.md` §5) y `ProgressBar` — T8.
- [x] Criterio 2: formularios de crear/editar objetivo (mensual/anual) y presupuestos (spec 004) conservados — T8, 11/11 tests.

**H9 — Tu perfil rediseñado**
- [x] Criterio 1: nombre/moneda/idioma editables con `.field`/`.input`, correo de solo lectura (`<p>`, no `<input>`) — T9.
- [x] Criterio 2: cambiar contraseña, exportar datos y eliminar cuenta (spec 001 H7/H8) en sus propias `.card`, eliminar cuenta con `.btn-ghost` (no primario) — T9, 14/14 tests sin cambios.

**H10 — Dispositivos y sesiones rediseñado**
- [x] Criterio 1 (parcial, decisión documentada): cada sesión como `.card.card-row` con dispositivo, ubicación/última actividad y "Cerrar sesión" — T10. Sin etiqueta "Esta sesión": se confirmó al empezar la tarea que la limitación de `isCurrent` (`constitution.md` T6.2, spec 001) sigue vigente — no hay ese campo ni en `api/sessions.ts` ni en el backend — así que no se inventa. Aceptado explícitamente así en `tasks.md` T10 ("H10 cumplida con o sin la etiqueta, según lo confirmado").

**H11 — El nuevo diseño sigue siendo usable en móvil**
- [x] Criterio 1: menú superpuesto (botón, backdrop, `data-mobile-open`) verificado abriendo/cerrando igual a 390px y 430px — T11. Corregido de paso: el botón fijo tapaba la marca "Ledger" al abrir (no reportado por ningún test, encontrado en la revisión visual).
- [x] Criterio 2: sin scroll horizontal en las 8 pantallas autenticadas a 390px/430px — T11. Dos causas reales encontradas y corregidas: la cuadrícula de 3 columnas de Categorías y la rejilla de 4 columnas de filtros de Movimientos (pensadas para escritorio) partían texto/botones letra a letra sin llegar a provocar overflow por sí solas; `.input` en `content-box` sí provocaba overflow real de 2px en Movimientos (padding/borde sumados fuera del `100%`) — pasa a `box-sizing:border-box`, con efecto solo cosmético en el resto de pantallas (verificado sin regresión).
- [x] Criterio 3: tarjetas de Movimientos/Categorías/Dispositivos/Inicio legibles y sin perder acciones en móvil, mismo criterio de spec 009 H3 adaptado a `.card` — T11.

**Verificación técnica final**
- [x] `npm run build` (tipos + build de producción) en verde.
- [x] `npm run test` — 158/159 en verde; el único fallo es el flake intermitente preexistente de `RegisterMovementPage.test.tsx` (documentado desde spec 007, reproducido de forma idéntica con los cambios de esta spec revertidos vía `git stash`, es decir, no relacionado con spec 010).
- [x] `npx oxlint` sobre `src` completo sin avisos nuevos (los 5 avisos `set-state-in-effect` preexistentes — `GoalsPage.tsx` ×2, `VerifyEmailPage.tsx`, `OAuthCallbackPage.tsx`, `RegisterMovementPage.tsx` — ninguno en las líneas tocadas por esta spec).
- [x] Revisión visual con Playwright (Chromium) contra el backend real: las 8 pantallas autenticadas en claro y oscuro a 1440px (incluida Dispositivos y sesiones, Categorías con datos reales, Dashboard con gráficos), menú plegado en escritorio (se confirma que sigue funcionando; se detecta y se decide **no tocar** una discrepancia preexistente y no regresiva de spec 008/T2 entre el ancho documentado del panel plegado/expandido, 68px/236px, y el realmente renderizado, 98px/266px, por `content-box` — igualar a `border-box` aquí sí introducía una regresión real, la marca "Ledger" y el botón de plegar quedaban cortados letra a letra al perder ese margen extra; queda anotado como posible mejora futura, no como defecto de esta spec) — y las 8 pantallas a 390px/430px con el menú móvil abierto y cerrado (T11).
- [x] `README.md` actualizado con spec 010 cerrada y un resumen de una línea por historia (H1-H11).

**Nota de alcance**: igual que en spec 009, el modo oscuro no se revisó pantalla a pantalla junto con cada tarea (T3-T10 se verificaron en claro); se comprobaron las 8 pantallas en oscuro en el cierre (T12), sin encontrar ningún problema — todo el CSS nuevo de esta spec usa los mismos tokens (`--bg`, `--text`, `--text-h`, `--border`, `--card-bg`, `--accent*`) que ya tienen su variante oscura definida en `index.css`, sin ningún valor de color nuevo fijado a mano.
