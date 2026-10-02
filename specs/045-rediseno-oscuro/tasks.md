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

---

## Checklist de cierre — spec 045

- [x] **H1** — Tokens oscuros únicos (`:root`, sin `prefers-color-scheme`), acento naranja, Inter/JetBrains Mono, radios 6/8/12px, tarjetas con borde y sin sombra. Se mantienen los nombres de todos los tokens existentes. Colores del manifiesto PWA (`vite.config.ts`) pasados a oscuro.
- [x] **H2** — Menú lateral fijo (248px, plegable a 68px), entrada activa en naranja, subsecciones indentadas con línea guía, "Cerrar sesión" al pie. Cajón móvil sin cambios de comportamiento (con hueco inferior para que la barra de navegación no tape "Cerrar sesión"). Tests de `AppLayout` en verde sin tocarlos.
- [x] **H3** — Tarjetas KPI en Inicio con variación vs. mes anterior y mini-gráfico del año. `monthOverMonthChange` con 6 tests unitarios; 3 tests nuevos en `HomePage.test.tsx` (variación con tono favorable/desfavorable, sin base de comparación, evolución anual que falla).
- [x] **H4** — `components/chart-theme.ts` aplicado a los 10 gráficos de Dashboard, Patrimonio, detalle de producto y detalle de acción. Línea de liquidez conserva puntos pequeños (sin `connectNulls`, una semana aislada desaparecería).
- [x] **T5.1** — `tsc -b` sin errores; 633 tests del frontend en verde (un test de `RegisterMovementPage` — "Cancelar edición navega a /movements" — falla de forma intermitente, también ejecutándolo aislado; no lo toca esta spec). Revisión visual en el navegador con un usuario de prueba local: Inicio, Movimientos, Dashboard, Patrimonio en escritorio y a 375px (sin scroll horizontal).
