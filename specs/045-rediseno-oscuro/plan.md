# Plan — Spec 045 (Rediseño oscuro)

**Fase:** 2 de 4

Todo el cambio vive en el frontend. Sin backend, sin migraciones, sin endpoints nuevos.

## 1. Tokens (`index.css`, `:root`)

- Se elimina el bloque `@media (prefers-color-scheme: dark)`: sus valores pasan a ser los únicos de `:root`, y `color-scheme: dark`.
- Paleta (tomada de la captura): `--bg #0b0b0d`, `--card-bg #131316`, `--surface-2 #1a1a1e` (hover/inputs), `--border #26262b`, `--text #c9c9d1`, `--text-h #f4f4f5`, `--text-muted #8a8a94`.
- Acento: `--accent #f97316` y rampa naranja `--accent-100…900` (invertida, como el oscuro anterior: 100 = tono más oscuro, para fondos).
- `--accent-2` pasa a morado (`#a855f7`) — se usaba para "Ahorro" y como segundo color de serie.
- Estado: `--status-green #22c55e`, `--status-red #ef4444`, ámbar/naranja sin cambio de papel.
- Nuevos tokens de gráfico: `--chart-1 … --chart-6` (naranja, verde, morado, azul, rojo, cian) y `--chart-grid`.
- Tipografía: Inter (Google Fonts) para todo; JetBrains Mono para `code`. `font-variant-numeric: tabular-nums` en `.card-amount`, tablas e importes.
- Radios: `--radius-sm 6px`, `--radius-md 10px`, `--radius-lg 14px` (la captura no usa formas "pill").

Se mantienen los nombres de todos los tokens existentes, para no tocar a sus consumidores.

## 2. Menú lateral (`#app-shell`, `#app-sidebar`)

- `#app-shell` vuelve a ser fila: `#app-sidebar` (240px, `position: sticky; top: 0; height: 100svh`, columna, scroll interno) + `#app-content`.
- Plegado (`data-collapsed='true'`): 68px, solo iconos.
- Entrada activa: `a[aria-current='page']` con fondo `color-mix(accent 14%)` y texto naranja; hover con `--surface-2`.
- `.nav-sublist` deja de ser `position: absolute` y se indenta en el flujo, con una línea guía vertical a la izquierda (como el árbol de la captura).
- "Cerrar sesión" se empuja al final de la columna (`margin-top: auto` en el último `li`).
- Marca: icono cuadrado naranja + "Ledger" (`#app-sidebar-brand`, un `<span aria-hidden>` añadido en `AppLayout.tsx`, el texto accesible no cambia).
- El bloque móvil (`max-width: 768px`) se simplifica: ya no tiene que deshacer la barra horizontal, solo convertir la columna en cajón superpuesto.
- `AppLayout.tsx`: sin cambios de estado ni comportamiento (spec 045 H2 criterio 3 reutiliza la lógica del PR #86).

## 3. Componentes (`index.css`)

- `.card`: fondo `--card-bg`, borde `--border`, radio `--radius-lg`, sin sombra (la captura separa por borde, no por sombra).
- `.card-kicker`: gris, sin mayúsculas forzadas en naranja → etiqueta gris de 13px, como "Total Runs".
- `.btn-primary`: naranja con texto oscuro; `.btn-secondary`: fondo `--surface-2`, borde fino.
- `.input`: fondo `--surface-2`, foco con anillo naranja.
- `.seg`: control segmentado tipo "Timeline | List" (fondo `--surface-2`, opción activa en `--card-bg` con texto claro, no relleno naranja).
- `.nav` (pestañas de `MovementsLayout`): subrayado naranja bajo la pestaña activa, como "Trace | Logs | ...".
- `.table`/`main table`: cabecera gris pequeña, filas separadas por línea tenue, hover de fila.
- `.tag`: chip con borde fino.
- `main form`: borde/fondo de tarjeta.
- `.dashboard-section`: cada `<details>` como tarjeta.

## 4. Tema de gráficos (`components/chart-theme.ts`, nuevo)

Constantes compartidas, sustituyendo a las 4 copias de `CHART_TICK_STYLE`/`CHART_TOOLTIP_STYLE`:

- `CHART_GRID_PROPS` → `<CartesianGrid vertical={false} stroke="var(--chart-grid)" />`
- `CHART_AXIS_PROPS` → `tick` gris 11px, `axisLine={false}`, `tickLine={false}`.
- `CHART_TOOLTIP_PROPS` → `contentStyle` oscuro con borde, `labelStyle`, `itemStyle`, `cursor` tenue.
- `CHART_LEGEND_PROPS` → `iconType="circle"`, `iconSize={8}`, texto gris.
- `CHART_LINE_PROPS` → `type="monotone"`, `strokeWidth={2}`, `dot={false}`, `activeDot={{ r: 4 }}`.
- `CHART_BAR_RADIUS` → `[4, 4, 0, 0]`.
- `CHART_SERIES_COLORS` → `var(--chart-1…6)`.

Se aplican en `DashboardPage`, `WealthPage`, `ProductDetailPage` y `StockDetailPage` sin cambiar tipo de gráfico ni datos. Colores: Dashboard Ingresos `--status-green`, Gastos `--status-red`, Ahorro `--accent-2`; barras de categoría `--accent`; total de patrimonio `--accent`.

## 5. Tarjetas KPI de Inicio

- `HomePage.tsx`: nueva llamada `getYearSummary(año actual)` con su propio estado (si falla, no hay error visible: las tarjetas se ven sin variación ni mini-gráfico, H3 criterio 3).
- Función pura nueva `monthOverMonthChange(current, previous): string | null` en `home-shared.ts` (porcentaje con 1 decimal; `null` si `previous` es 0 o no existe), con tests unitarios (constitución §2).
- Componente `components/Sparkline.tsx`: `AreaChart` de Recharts sin ejes ni tooltip, 36px de alto, trazo del color de la tarjeta y relleno degradado. `aria-hidden` (decorativo; la cifra ya está en texto).
- Tarjeta KPI: `.kpi-card` (etiqueta, cifra, fila inferior con variación `.kpi-delta[data-trend='up'|'down']` + sparkline a la derecha).

## 6. Riesgos

- Tests que miran clases/estilos: los de comportamiento (roles, aria-*) no cambian. `HomePage.test.tsx` necesita mock de `getYearSummary`.
- Recharts en jsdom: `ResponsiveContainer` sin tamaño no pinta nada en tests — el sparkline debe ser opcional y no romper los tests que no lo miran.
