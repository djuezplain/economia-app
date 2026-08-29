# Tasks — Spec 010 (Rediseño visual completo, handoff editorial)

**Estado:** Aprobada
**Fase:** 3 de 4 (Spec → Plan → Tasks → Implementación)

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
