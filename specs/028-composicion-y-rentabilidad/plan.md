# Plan — Spec 028 (Composición, Liquidez y Rentabilidad del Patrimonio)

**Fase:** 2 de 4

## 0. Desviación propuesta sobre spec.md H3 (a confirmar antes de aprobar este plan)

Spec.md H3 criterio 1 pide un "gráfico de tarta/donut" para la composición actual. Al diseñar el gráfico con la skill de dataviz del proyecto, su propia guía (`choosing-a-form.md`, `components.md`) es explícita: **"Part-to-whole → stacked bar (horizontal para categorías con nombres largos); donut queda deprioritizado"** — un donut de 7 categorías con valores no siempre muy distintos es justo el caso que la skill marca como antipatrón ("donut/pie para comparar valores parecidos").

Se propone sustituir H3 por una **única barra horizontal apilada al 100%** (mismo mecanismo `stackId` que el resto de barras/áreas apiladas de este plan), con las 7 categorías en el mismo orden y colores fijos que H1. Mismo resultado para el usuario (ver de un vistazo el peso de cada categoría), forma más legible y sin cambiar ningún dato ni criterio de negocio — solo el tipo de gráfico. Si Diego prefiere mantener el donut literal, se implementa igual (recharts lo soporta) pero sin el respaldo de la skill.

## 1. Paleta de color (nueva, spec 028 es la primera vista categórica multi-serie de la app)

La app no tenía hasta ahora una paleta categórica (solo `--accent`/`--accent-2`, de una serie). Se añaden 7 tokens nuevos a `frontend/src/index.css` (mismo patrón que los tokens ya existentes: valor claro en `:root`, valor oscuro dentro del `@media (prefers-color-scheme: dark)` ya existente), instancia validada de la paleta de referencia de la skill de dataviz (`references/palette.md`, slots 1-7 de 8, en orden fijo):

```css
/* :root (claro) */
--wealth-cat-bank: #2a78d6;      /* Cuentas Bancarias — azul, slot 1 */
--wealth-cat-stocks: #eb6834;    /* Acciones — naranja, slot 2 */
--wealth-cat-funds: #1baf7a;     /* Fondos Inversión — aqua, slot 3 */
--wealth-cat-crypto: #eda100;    /* Cripto — amarillo, slot 4 */
--wealth-cat-vehicles: #e87ba4;  /* Vehículos — magenta, slot 5 */
--wealth-cat-pension: #008300;   /* Fondo Pensiones — verde, slot 6 */
--wealth-cat-cash: #4a3aa7;      /* Efectivo — violeta, slot 7 */

/* dentro de @media (prefers-color-scheme: dark) */
--wealth-cat-bank: #3987e5;
--wealth-cat-stocks: #d95926;
--wealth-cat-funds: #199e70;
--wealth-cat-crypto: #c98500;
--wealth-cat-vehicles: #d55181;
--wealth-cat-pension: #008300;
--wealth-cat-cash: #9085e9;
```

Validado con `scripts/validate_palette.js` de la skill contra la superficie real de las tarjetas de esta app (`--card-bg`: `#eae9e9` claro / `#1e1e1e` oscuro), no la superficie por defecto de la skill: **todos los checks en verde** en ambos modos (peor pareja adyacente CVD ΔE 9.1 claro / 8.4 oscuro; contraste con WARN en claro en 4 de los 7 tonos — obliga a "relief": etiquetas visibles o tabla, ya cubierto por la tabla accesible de §5). Orden fijo: cada categoría tiene siempre el mismo color en H1 y en H3 (spec.md decisión de negocio: "color sigue a la entidad, nunca a su posición" — si una categoría no tiene datos, simplemente no aparece, las demás no cambian de color).

Rentabilidad (H5) y "antes/después" (H4) no son paletas categóricas de identidad — reutilizan tokens ya existentes de la app, sin tokens nuevos: `--status-green`/`--status-red` (ya en `index.css`, ganancia/pérdida) para H5, y `--neutral-500`/`--accent-500` (dos tonos de una rampa, "antes/después") para H4.

## 2. Cálculos puros nuevos (`frontend/src/pages/wealth-evolution.calculations.ts`)

**H1 — composición semanal por categoría**, generalizando `wealthEvolutionSeries` (que ya solo sumaba las 7): misma iteración sobre `weekEndingDates`, pero devolviendo las 7 subtotales en vez de un único `total`.

```ts
export interface WealthEvolutionByCategoryPoint {
  weekEnding: string;
  bankAccounts: number;
  stocks: number;
  funds: number;
  cryptos: number;
  vehicles: number;
  pensionPlans: number;
  cash: number;
}
export function wealthEvolutionByCategorySeries(data: AllWealthData, start: string, end: string): WealthEvolutionByCategoryPoint[]
```

**H2 — ratio de liquidez semanal**, sobre la misma serie de fechas (reutiliza `weekEndingDates`/`earliestDataDate` tal cual):

```ts
export interface LiquidityRatioPoint { weekEnding: string; ratioPercent: number | null }
export function liquidityRatioSeries(data: AllWealthData, start: string, end: string): LiquidityRatioPoint[]
```
`ratioPercent = (bankAccountsValueAsOf + cashValueAsOf) / totalWealthAsOf * 100`, `null` si `totalWealthAsOf` de esa semana es 0 (no debería ocurrir dentro de un rango con datos, pero se cubre igual — recharts con `connectNulls={false}` deja un hueco en vez de una caída a 0 falsa).

Ambas funciones son solo agregaciones nuevas sobre funciones ya existentes (`*ValueAsOf`, `totalWealthAsOf`) — no tocan spec 027, no cambian su comportamiento.

**H5 — coste de compra de un vehículo**, único cálculo realmente nuevo (no existía ninguna función que sumara `purchasePrice` de varios vehículos):
```ts
// en WealthPage.tsx, junto a `totalCost`/`totalCryptoCost` (mismo patrón)
function totalVehiclePurchasePrice(vehicles: Vehicle[]): string {
  return vehicles.reduce((sum, v) => sum + parseFloat(v.purchasePrice), 0).toFixed(2);
}
```

H3 y H4 no necesitan ningún cálculo nuevo: reutilizan tal cual `bankAccountsTotal`/`stocksTotal`/`fundsTotal`/`cryptosTotal`/`vehiclesTotal`/`pensionPlansTotal`/`cashTotal` (H3) y `totalCost`/`totalCryptoCost`/`totalContributions` + sus `*Total` de valor actual (H4), todas ya definidas y con tests en `WealthPage.tsx`/`WealthPage.test.tsx`.

## 3. Frontend — sección "Evolución del patrimonio" (H1/H2, extiende spec 027)

Nuevo estado `evolutionView: 'total' | 'byCategory' | 'liquidity'` (por defecto `'total'`), selector de 3 opciones (mismo `<select>` que "Periodo", o un segundo grupo de botones justo debajo) — **no** un segundo selector de rango: los 3 usan `wealthEvolutionRange` ya calculado (spec 027).

- `'total'`: el `LineChart` ya existente, sin cambios.
- `'byCategory'`: `AreaChart` con 7 `<Area dataKey="{categoría}" stackId="wealth" stroke={var} fill={var} fillOpacity={0.85}>` (recharts, import nuevo: `Area`, `AreaChart`, `Legend`), usando `wealthEvolutionByCategorySeries`. Leyenda (`<Legend>`) obligatoria (7 series) + tabla accesible con las 7 columnas (mismo patrón que la tabla de "Total").
- `'liquidity'`: `LineChart` de una sola serie (`ratioPercent`), eje Y en `%`, `connectNulls={false}`. Sin leyenda (una sola serie no la necesita, spec de la skill) + tabla accesible de 2 columnas.

## 4. Frontend — "Composición actual" (H3), junto a la tarjeta "Total"

Un nuevo `<div className="card elev-sm" id="wealth-composition">`, **fuera** del bloque de rango (es una foto de hoy): una única fila `[{ name: 'Patrimonio', bankAccounts, stocks, funds, cryptos, vehicles, pensionPlans, cash }]` (los 7 `*Total(...)` ya existentes, convertidos a número) pasada a un `BarChart layout="vertical"` con una sola categoría en el eje Y y 7 `<Bar dataKey="..." stackId="composition">` — ver §0 sobre la desviación de "donut" a esta forma. Leyenda + tabla accesible (nombre de categoría, importe, % del total) — cubre el "relief" de contraste de §1. Categoría con subtotal 0 se omite de la leyenda/tabla (H3 criterio 3) pero no rompe el `stackId` (una barra de anchura 0 no se ve).

## 5. Frontend — "Aportado vs. valor actual" (H4)

Nueva tarjeta, fuera del selector de rango (foto de hoy). Dataset:
```ts
[
  { category: 'Acciones', aportado: totalCost(purchases), valorActual: stocksTotal(stockList, purchases, valuations) },
  { category: 'Fondos Inversión', aportado: totalCost(fundPurchases), valorActual: fundsTotal(...) },
  { category: 'Cripto', aportado: totalCryptoCost(cryptoPurchaseList), valorActual: cryptosTotal(...) },
  { category: 'Fondo Pensiones', aportado: totalContributions(pensionPlanContributionList), valorActual: pensionPlansTotal(...) },
].filter((row) => parseFloat(row.aportado) > 0 || parseFloat(row.valorActual) > 0) // H4 criterio 3
```
`BarChart` agrupado (no apilado): `<Bar dataKey="aportado" fill="var(--neutral-500)" name="Aportado">`, `<Bar dataKey="valorActual" fill="var(--accent-500)" name="Valor actual">` — 2 tonos de una rampa ("antes/después", no identidad categórica, spec.md §3 confirma que Acciones/Fondos/Cripto/Fondo Pensiones son las 4 categorías). Más una fila "Total" agregando las 4. Tabla accesible con las mismas columnas.

## 6. Frontend — "Rentabilidad por categoría" (H5)

Dataset (5 categorías: Acciones, Fondos, Cripto, Vehículos, Fondo Pensiones):
```ts
[
  { category: 'Acciones', pct: gainLossPercent(stocksTotal(...), totalCost(purchases)) },
  { category: 'Fondos Inversión', pct: gainLossPercent(fundsTotal(...), totalCost(fundPurchases)) },
  { category: 'Cripto', pct: gainLossPercent(cryptosTotal(...), totalCryptoCost(cryptoPurchaseList)) },
  { category: 'Vehículos', pct: gainLossPercent(vehiclesTotal(...), totalVehiclePurchasePrice(vehicleList)) },
  { category: 'Fondo Pensiones', pct: gainLossPercent(pensionPlansTotal(...), totalContributions(pensionPlanContributionList)) },
].filter((row) => row.pct !== null) // H5 criterio 2
```
`BarChart` con `<ReferenceLine y={0} stroke="var(--border)">` (línea base) y `<Bar dataKey="pct">` coloreada por entrada con `<Cell fill={entry.pct >= 0 ? 'var(--status-green)' : 'var(--status-red)'}>` (diverging, no categórica — mismo criterio que un semáforo de ganancia/pérdida, reutiliza los tokens de estado ya existentes en `index.css`). Tabla accesible con el signo explícito ("+12,4 %"/"−3,1 %").

## 7. Testing

- `wealth-evolution.calculations.test.ts`: `wealthEvolutionByCategorySeries` (una categoría sin datos nunca queda en 0 en toda la serie, forward-fill por categoría independiente entre sí) y `liquidityRatioSeries` (ratio correcto, `null` si el total de esa semana es 0).
- `WealthPage.test.tsx`: `totalVehiclePurchasePrice` (vía el nuevo test de H5), selector de vista (`Total`/`Por categoría`/`Liquidez`) cambia el gráfico mostrado, tabla de composición actual con los 7 subtotales y sin la categoría en 0, tabla de "Aportado vs. valor actual" sin una categoría sin posiciones, tabla de rentabilidad sin una categoría con coste 0, aislamiento por usuario (igual que el resto de la página).

## 8. Fuera de este plan

- Ningún endpoint ni tabla backend nueva (mismo criterio que spec 027).
- Evolución en el tiempo de H4/H5 (spec.md §2) — ambas quedan como foto de "hoy".
- Patrimonio neto con pasivos (spec.md §2).
