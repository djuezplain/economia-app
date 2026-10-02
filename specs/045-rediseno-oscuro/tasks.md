# Tasks — Spec 045 (Rediseño oscuro)

**Fase:** 3 de 4

## Grupo 1 — Base visual

- **T1.1** — Tokens oscuros únicos, acento naranja, Inter/JetBrains Mono, radios nuevos, tokens `--chart-*` (plan.md §1).
- **T1.2** — Componentes: tarjetas, botones, inputs, control segmentado, pestañas, tablas, etiquetas, formularios, secciones plegables (plan.md §3).

## Grupo 2 — Navegación

- **T2.1** — Menú lateral fijo en escritorio + plegado a iconos + subsecciones indentadas + cajón móvil (plan.md §2). Los tests existentes de `AppLayout` siguen en verde sin cambios de comportamiento.

## Grupo 3 — Gráficos

- **T3.1** — `components/chart-theme.ts` (plan.md §4).
- **T3.2** — Aplicarlo en `DashboardPage`, `WealthPage`, `ProductDetailPage`, `StockDetailPage`.

## Grupo 4 — Inicio

- **T4.1** — `monthOverMonthChange` en `home-shared.ts` + tests unitarios (sin mes anterior, mes anterior 0, subida, bajada, negativos).
- **T4.2** — `Sparkline.tsx` + tarjetas KPI en `HomePage` con `getYearSummary` (plan.md §5); `HomePage.test.tsx` actualizado (variación visible con datos, tarjetas intactas si falla la evolución anual).

## Grupo 5 — Cierre

- **T5.1** — `npm test` y `tsc -b` del frontend en verde. Revisión visual en el navegador: Inicio, Movimientos, Dashboard, Patrimonio, Tickets, en escritorio y a 375px.
