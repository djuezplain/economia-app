# Tasks — Spec 027 (Evolución del Patrimonio)

**Fase:** 3 de 4

## Grupo 1 — Cálculo puro por categoría, con fecha (`asOf`)

- **T1.1** — `frontend/src/pages/wealth-evolution.calculations.ts`: `bankAccountsValueAsOf`, `stocksValueAsOf`, `fundsValueAsOf`, `cryptosValueAsOf`, `vehiclesValueAsOf`, `pensionPlansValueAsOf`, `cashValueAsOf`, `totalWealthAsOf` (plan §1). Test unitario (`wealth-evolution.calculations.test.ts`): forward-fill (última entrada conocida antes o igual a `asOf`), categoría sin ninguna entrada nunca (contribuye 0, no rompe), una compra de acción/fondo/cripto con fecha posterior a `asOf` no cuenta todavía en el número de participaciones de esa fecha.

## Grupo 2 — Serie semanal y selector de rango

- **T2.1** — `weekEndingDates`, `wealthEvolutionSeries`, `earliestDataDate` (plan §1). Test: un punto por semana ISO (domingo) entre `start` y `end`, varias entradas de la misma categoría en la misma semana ISO usan solo la más reciente, no se generan puntos anteriores a `earliestDataDate`.
- **T2.2** — `resolveRange` (los 4 modos: `last12Months`, `currentYear`, `allTime`, `custom`) e `isValidCustomRange` (plan §2). Test: `allTime` sin ningún dato en ninguna categoría devuelve `null`, `custom` con fecha fin anterior a inicio o posterior a hoy devuelve `false`, `last12Months`/`currentYear` calculan el rango correcto respecto a una fecha "ahora" inyectada (sin depender del reloj real en el test).

## Grupo 3 — Frontend (UI)

- **T3.1** — En `WealthPage.tsx`, junto a la tarjeta "Total" existente (fuera del bloque de las 7 secciones plegables): selector de rango (4 opciones, `custom` con dos `<input type="date">`) + `LineChart` de `recharts` (mismo patrón que el gráfico de `YearSummary` en `DashboardPage.tsx`: `ResponsiveContainer`, `CartesianGrid`, `XAxis`, `Tooltip`, `Line` única "Patrimonio total", valores formateados con `formatCurrency`). Estado vacío (mensaje, sin gráfico) cuando `resolveRange` da `null` o la serie no tiene ningún punto con total > 0.
- **T3.2** — Tests en `WealthPage.test.tsx`: rango por defecto "Últimos 12 meses" al entrar, cambiar de modo recalcula el gráfico, `custom` con rango inválido muestra el aviso y no rompe el render, estado vacío cuando el rango elegido no tiene datos, aislamiento (sin sesión no se pinta nada de esta sección).

## Grupo 4 — Cierre

- **T4.1** — `npm test` en frontend en verde. `tsc -b` en `frontend/` en verde (no `tsc --noEmit` — con este proyecto usa referencias de proyecto y `--noEmit` no detecta todos los errores). Revisión manual en el navegador: los 4 modos de rango, un rango personalizado inválido, y que el gráfico refleja correctamente una categoría a la que se le añade una entrada nueva (el total de la semana correspondiente sube).
