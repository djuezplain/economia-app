# Plan — Spec 030 (Rentabilidad con y sin dividendos)

**Fase:** 2 de 4

## 0. Alcance técnico

Cambio **100% frontend** (`WealthPage.tsx`/`WealthPage.test.tsx`) — no toca backend ni base de datos. `gainLossPercent` (el % de ganancia/pérdida) siempre ha sido un cálculo solo-frontend, nunca expuesto por la API (`wealth.calculations.ts` del backend no lo tiene); esta spec reutiliza `stockDividendsTotal`/`fundDividendsTotal` (spec 029, ya calculados a partir de datos ya cargados) sin pedir nada nuevo al backend.

## 1. Cálculos nuevos (`WealthPage.tsx`)

```ts
/** H1 criterio 3 (spec 030): total de dividendos brutos de una lista — suma el bruto de cada
 *  dividendo individual (grossDividend por dividendo, no el bruto de la suma de netos), porque
 *  cada uno puede tener una retención distinta. */
function totalGrossDividends(dividends: Array<{ netAmount: string; retentionPercent: string }>): string {
  return dividends.reduce((sum, d) => sum + parseFloat(grossDividend(d.netAmount, d.retentionPercent) || '0'), 0).toFixed(2);
}

/** H3 (spec 030, agregado): total bruto de dividendos de todas las acciones/fondos del usuario —
 *  mismo criterio de filtrado por posición propia que `stockDividendsTotal`/`fundDividendsTotal` (spec 029). */
function stockGrossDividendsTotal(stocks: Stock[], dividends: StockDividend[]): string {
  const stockIds = new Set(stocks.map((s) => s.id));
  return totalGrossDividends(dividends.filter((d) => stockIds.has(d.stockId)));
}
function fundGrossDividendsTotal(funds: Fund[], dividends: FundDividend[]): string {
  const fundIds = new Set(funds.map((f) => f.id));
  return totalGrossDividends(dividends.filter((d) => fundIds.has(d.fundId)));
}

/** H1 criterio 2/3: mismo `gainLossPercent` ya existente, pero sumando un importe de dividendos
 *  al valor actual antes de comparar con el coste. Reutiliza `gainLossPercent` tal cual (mismos
 *  criterios de `null` cuando cost=0 o los importes no son números) en vez de duplicar su lógica. */
function gainLossPercentWithDividends(currentVal: string, cost: string, dividendsTotal: string): number | null {
  const value = parseFloat(currentVal);
  const dividends = parseFloat(dividendsTotal);
  if (Number.isNaN(value) || Number.isNaN(dividends)) return null;
  return gainLossPercent((value + dividends).toFixed(2), cost);
}
```

Ningún cambio en `backend/src/wealth/wealth.calculations.ts` ni en `wealth.calculations.spec.ts` — esta spec no tiene componente de backend.

## 2. H1 — Título de cada acción/fondo

Dentro del `.map()` de cada acción (y, en paralelo, de cada fondo):

```ts
const stockNetDividends = totalDividends(stockDividendHistory); // ya existe, spec 029
const stockGrossDividends = totalGrossDividends(stockDividendHistory);
const gainLossNet = gainLossPercentWithDividends(currentValue(...), totalCost(stockPurchases), stockNetDividends);
const gainLossGross = gainLossPercentWithDividends(currentValue(...), totalCost(stockPurchases), stockGrossDividends);
```

- Criterio 4/5 de spec.md ("solo si hay al menos un dividendo" y "nunca si coste=0/sin valoración") se cumplen con una única condición por span: `stockDividendHistory.length > 0 && gainLossNet !== null` (si `gainLoss` — la variante sin dividendos — ya es `null` por coste 0, `gainLossPercentWithDividends` también da `null`, así que no hace falta comprobar `gainLoss !== null` por separado).
- JSX: dos `<span>` más, mismo patrón de color por signo que el `<span>` de `gainLoss` ya existente, con un prefijo de texto para distinguirlos (`neto`/`bruto`) — sin tocar el `<span>` de `gainLoss` (criterio 1, sin cambios, mismo texto/estilo que hoy, para no romper los tests ya existentes que buscan `+16.67%` exacto).

```tsx
{gainLoss !== null && (
  <span style={{ color: gainLoss >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
    {' '}{gainLoss >= 0 ? '+' : ''}{gainLoss.toFixed(2)}%
  </span>
)}
{stockDividendHistory.length > 0 && gainLossNet !== null && (
  <span style={{ color: gainLossNet >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
    {' '}· neto {gainLossNet >= 0 ? '+' : ''}{gainLossNet.toFixed(2)}%
  </span>
)}
{stockDividendHistory.length > 0 && gainLossGross !== null && (
  <span style={{ color: gainLossGross >= 0 ? 'var(--status-green)' : 'var(--status-red)', fontWeight: 600 }}>
    {' '}· bruto {gainLossGross >= 0 ? '+' : ''}{gainLossGross.toFixed(2)}%
  </span>
)}
```

Idéntico bloque para el `.map()` de fondos (`fundDividendHistory`, `totalCost(fundPurchaseHistory)`).

## 3. H2 — "Rentabilidad por categoría" (spec 028 H5)

`profitabilityData` (`useMemo`) pasa de una fila fija por categoría a una función auxiliar `pushCategoryRows`, usada para las 5 categorías (con `netDividends`/`grossDividends` en `'0.00'` para Cripto/Vehículos/Fondo Pensiones — nunca añaden fila extra, mismo resultado que hoy):

```ts
function pushCategoryRows(
  rows: Array<{ category: string; pct: number }>,
  label: string,
  currentVal: string,
  cost: string,
  netDividends: string,
  grossDividends: string,
) {
  const pct = gainLossPercent(currentVal, cost);
  if (pct === null) return; // H2 criterio 4: sin coste/sin posiciones, la categoría entera no aparece
  rows.push({ category: label, pct });
  if (parseFloat(netDividends) > 0) { // H2 criterio 3: sin dividendos, no hay filas extra
    const pctNet = gainLossPercentWithDividends(currentVal, cost, netDividends);
    const pctGross = gainLossPercentWithDividends(currentVal, cost, grossDividends);
    if (pctNet !== null) rows.push({ category: `${label} (con dividendos netos)`, pct: pctNet });
    if (pctGross !== null) rows.push({ category: `${label} (con dividendos brutos)`, pct: pctGross });
  }
}
```

- Se generaliza la lista de categorías a un array `[{label, currentVal, cost, netDividends, grossDividends}]` recorrido con `pushCategoryRows`, en vez de 5 objetos literales sueltos como hoy — evita repetir la misma función 5 veces.
- Etiquetas de categoría: `"Acciones"`, `"Acciones (con dividendos netos)"`, `"Acciones (con dividendos brutos)"` (mismo patrón para `"Fondos Inversión"`) — se mantiene un único `<Bar dataKey="pct">` con coloreado por signo vía `<Cell>` (sin cambios en `BarChart`/`Tooltip`/tabla, solo más filas en los datos) — más simple que introducir varias series con leyenda, y consistente con que el color ya codifica ganancia/pérdida por barra, no por categoría.
- `profitabilityData` añade `stockDividendList`/`fundDividendList` a su array de dependencias del `useMemo`.

## 4. Fuera de este plan

- No se toca `compositionData`/`contributionVsValueData` (H3/H4 de spec 028) — ninguna de las dos incluye rentabilidad.
- No se generaliza `pushCategoryRows` para usarlo también en H1 (título de posición individual) — H1 son dos variables locales por posición dentro de un `.map()` ya existente, no una lista que construir fila a fila; forzar la misma función ahí complicaría el JSX sin ahorrar código real.
- Ningún cambio de estilo/CSS nuevo — reutiliza `var(--status-green)`/`var(--status-red)`, ya usadas en toda la página.

## 5. Tests

- `wealth.calculations.spec.ts` (backend): sin cambios — spec sin componente de backend (§0).
- `WealthPage.test.tsx`: casos nuevos dentro de `describe('Dividendos (spec 029)', ...)` o uno nuevo `describe('Rentabilidad con y sin dividendos (spec 030)', ...)` — con dividendos, sin dividendos (solo aparece la rentabilidad base), signo distinto entre las tres variantes, y las mismas filas nuevas en el gráfico/tabla de "Rentabilidad por categoría". Los tests ya existentes de `+16.67%`/`-20.00%` (spec 020/021) siguen pasando sin tocarlos: mockean `listStockDividends`/`listFundDividends` a `[]`, así que ninguna posición de esos tests tiene dividendos y las dos variantes nuevas no se renderizan (H1 criterio 4).
