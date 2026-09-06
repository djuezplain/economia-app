# Tasks — Spec 028 (Composición, Liquidez y Rentabilidad del Patrimonio)

**Fase:** 3 de 4

## Grupo 1 — Paleta de color

- **T1.1** — 7 tokens `--wealth-cat-*` nuevos en `frontend/src/index.css` (claro en `:root`, oscuro en el `@media (prefers-color-scheme: dark)` ya existente), valores de plan.md §1. Sin tests (son CSS puro) — se verifican visualmente en T5.1.

## Grupo 2 — Cálculo puro

- **T2.1** — `wealthEvolutionByCategorySeries` en `wealth-evolution.calculations.ts` (plan.md §2). Test: una categoría sin ninguna entrada nunca queda en 0 en toda la serie sin romper las demás; forward-fill independiente por categoría (una categoría actualizada no afecta al valor de otra).
- **T2.2** — `liquidityRatioSeries` en el mismo fichero. Test: ratio correcto (cuentas + efectivo / total × 100), `null` cuando el total de esa semana es 0.
- **T2.3** — `totalVehiclePurchasePrice` en `WealthPage.tsx` (junto a `totalCost`/`totalCryptoCost`). Test en `WealthPage.test.tsx` (vía el dataset de H5, T4.3).

## Grupo 3 — Evolución del patrimonio: vistas "Por categoría" y "Liquidez" (H1/H2)

- **T3.1** — Estado `evolutionView` + selector de 3 opciones en la sección ya existente "Evolución del patrimonio". Vista "Por categoría": `AreaChart` apilado (7 `<Area>`, tokens de T1.1) + leyenda + tabla accesible. Vista "Liquidez": `LineChart` de una serie (%) + tabla accesible.
- **T3.2** — Tests en `WealthPage.test.tsx`: cambiar de vista recalcula el gráfico mostrado (verificar por la tabla accesible de cada vista, mismo criterio que spec 027), una categoría sin datos no aparece en la leyenda/tabla de "Por categoría".

## Grupo 4 — Tarjetas de foto de "hoy" (H3/H4/H5)

- **T4.1** — Tarjeta "Composición actual" (H3): barra apilada al 100% + leyenda + tabla (categoría, importe, %). Test: las 7 categorías con datos aparecen, una con subtotal 0 no aparece.
- **T4.2** — Tarjeta "Aportado vs. valor actual" (H4): `BarChart` agrupado (Acciones/Fondos/Cripto/Fondo Pensiones) + fila de total + tabla. Test: una categoría sin ninguna posición no aparece; el total agregado suma las 4.
- **T4.3** — Tarjeta "Rentabilidad por categoría" (H5): `BarChart` diverging con `ReferenceLine` en 0, coloreado con `--status-green`/`--status-red` + tabla con signo explícito. Test: `totalVehiclePurchasePrice` (T2.3) correcto; una categoría con coste 0 (o sin posiciones) no aparece.

## Grupo 5 — Cierre

- **T5.1** — `npm test` en frontend en verde. `tsc -b` en `frontend/` en verde. Revisión manual en el navegador: las 3 vistas de "Evolución del patrimonio", las 3 tarjetas nuevas con datos reales (verificar que los colores de las 7 categorías coinciden entre "Por categoría" y "Composición actual"), y que quitar todas las posiciones de una categoría la hace desaparecer de cada gráfico sin romper el resto.
