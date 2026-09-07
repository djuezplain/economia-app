# Tasks — Spec 030 (Rentabilidad con y sin dividendos)

**Fase:** 3 de 4

## Grupo 1 — Cálculos

- **T1.1** — `totalGrossDividends`, `stockGrossDividendsTotal`, `fundGrossDividendsTotal` y `gainLossPercentWithDividends` en `WealthPage.tsx` (plan.md §1).

## Grupo 2 — H1, título de posición individual

- **T2.1** — Acciones: `gainLossNet`/`gainLossGross` calculados en el `.map()` de `stockList`, dos `<span>` nuevos en el título (plan.md §2), condicionados a `stockDividendHistory.length > 0`.
- **T2.2** — Fondos: mismo cambio, en paralelo, sobre `fundList`/`fundDividendHistory`.

## Grupo 3 — H2, "Rentabilidad por categoría" (spec 028 H5)

- **T3.1** — `pushCategoryRows` + `profitabilityData` reescrito para las 5 categorías (plan.md §3), con `stockDividendList`/`fundDividendList` añadidos a las dependencias del `useMemo`.

## Grupo 4 — Tests y cierre

- **T4.1** — `WealthPage.test.tsx`: nuevo `describe('Rentabilidad con y sin dividendos (spec 030)', ...)` — posición con dividendos (3 rentabilidades, signos correctos), posición sin dividendos (solo 1), categoría con y sin dividendos en el gráfico/tabla de spec 028. Verificar que los tests ya existentes de `+16.67%`/`-20.00%` (spec 020/021) y de "Rentabilidad por categoría" (spec 028) siguen en verde sin modificarlos.
- **T4.2** — `npm test` (frontend) y `tsc -b` (frontend, no `tsc --noEmit`) en verde. Revisión manual en el navegador: una acción con varios dividendos de distinta retención, comprobar las tres rentabilidades del título y las filas nuevas en "Rentabilidad por categoría".
