# Plan — Spec 027 (Evolución del Patrimonio)

**Fase:** 2 de 4

## 0. Decisión de arquitectura: sin endpoint backend nuevo

`WealthPage.tsx` ya carga, en el propio montaje de la página (18 `useEffect` independientes, uno por entidad: cuentas, saldos, acciones, compras, valoraciones, fondos, fondos-compras, fondos-valoraciones, cripto, cripto-compras, cripto-valoraciones, vehículos, vehículos-valoraciones, planes de pensiones, aportaciones, valoraciones, efectivo, saldos de efectivo), **todo** el histórico de las 7 categorías — no solo las visibles. La tarjeta "Total" (spec 018 H4→H7) ya se calcula hoy enteramente en el cliente, sobre esos datos ya cargados, con funciones puras (`bankAccountsTotal`, `stocksTotal`, `fundsTotal`, `cryptosTotal`, `vehiclesTotal`, `pensionPlansTotal`, `cashTotal`, todas en `WealthPage.tsx`).

Esta spec generaliza exactamente ese mismo patrón, añadiéndole una dimensión temporal (`asOf: fecha` en vez de "ahora"): **no hace falta ningún endpoint nuevo, ninguna tabla nueva ni ninguna migración**. Los históricos por fecha que la evolución necesita ya existen desde spec 019-025 (`bankAccountBalances`, `stockValuations`, `fundValuations`, `cryptoValuations`, `vehicleValuations`, `pensionPlanValuations`, `cashBalances`, todos con columna `date` e índice `(id/entidad, date)`). El volumen de datos (histórico de un único usuario) es trivial para calcularse en el cliente, igual que ya ocurre con "Total".

## 1. Nuevo módulo de cálculo puro (frontend)

Nuevo fichero `frontend/src/pages/wealth-evolution.calculations.ts` (+ `wealth-evolution.calculations.test.ts`), sin dependencias de React — mismo criterio de la constitution §2 ("cálculos financieros... funciones puras con tests unitarios"), aplicado aquí en el cliente porque aquí es donde ya vive el cálculo equivalente sin fecha (`*Total` en `WealthPage.tsx`).

**Generalización "asOf" de cada categoría** (mismo cálculo que su `*Total` actual, con un filtro `date <= asOf` antes de tomar el primer elemento — las listas ya vienen ordenadas por fecha descendente, así que el filtro preserva el orden):

```ts
function lastAsOf<T extends { date: string }>(items: T[], asOf: string): T | undefined {
  return items.find((item) => item.date <= asOf);
}

export function bankAccountsValueAsOf(accounts: BankAccount[], balances: BankAccountBalance[], asOf: string): number {
  return accounts.reduce((sum, a) => {
    const last = lastAsOf(balances.filter((b) => b.bankAccountId === a.id), asOf);
    return sum + (last ? parseFloat(last.euros) : 0);
  }, 0);
}
// stocksValueAsOf/fundsValueAsOf/cryptosValueAsOf: igual, pero totalShares/totalCryptoQuantity
// se calculan SOLO sobre las compras con date <= asOf (una compra futura respecto a "asOf" no
// puede contar en la posición de esa semana) antes de multiplicar por la última valoración <= asOf.
// vehiclesValueAsOf/pensionPlansValueAsOf/cashValueAsOf: igual que bankAccountsValueAsOf.
```

- **Nota importante que no aplica a la tarjeta "Total" actual** (siempre "hoy", así que todas las compras ya existen): para una fecha pasada `asOf`, `totalShares`/`totalCryptoQuantity` deben filtrar las compras a `date <= asOf` — si no, una acción comprada la semana pasada aparecería ya reflejada en semanas anteriores a su compra real.
- `totalWealthAsOf(data, asOf): number` — suma las 7 funciones anteriores. Una categoría (o una posición individual dentro de ella) sin ningún dato con `date <= asOf` contribuye 0 de forma natural (H1 criterio 3 de spec.md: no hace falta ningún caso especial, "no participar" y "sumar 0" son la misma operación aquí).

**Generación de la serie semanal:**

```ts
export function weekEndingDates(start: string, end: string): string[] // domingos ISO entre start y end, ambos inclusive
export function wealthEvolutionSeries(data: AllWealthData, start: string, end: string): Array<{ weekEnding: string; total: number }>
export function earliestDataDate(data: AllWealthData): string | null // fecha más antigua de cualquier categoría, para el modo "Todo el histórico"
```

- Semana = semana ISO (lunes a domingo); cada punto de la serie usa el domingo como fecha de referencia (`asOf` de esa semana). Si el usuario registra varias entradas de una categoría en la misma semana ISO, `lastAsOf` ya se queda con la más reciente de esa semana (mismo criterio que "último valor conocido").
- `wealthEvolutionSeries` no genera puntos anteriores a `earliestDataDate` aunque el rango elegido empiece antes (evita una fila inicial de "0" sin sentido cuando el rango es "Todo el histórico").

## 2. Selector de rango (H2)

Módulo puro (mismo fichero, o `wealth-evolution.range.ts` si crece demasiado):

```ts
export type WealthEvolutionRangeMode = 'last12Months' | 'currentYear' | 'allTime' | 'custom';
export function resolveRange(mode: WealthEvolutionRangeMode, custom: { start: string; end: string } | null, data: AllWealthData, now: Date): { start: string; end: string } | null;
export function isValidCustomRange(start: string, end: string, now: Date): boolean; // fin >= inicio, fin <= hoy
```

- `last12Months`: `[hoy - 52 semanas, hoy]`. `currentYear`: `[1 de enero del año actual, hoy]`. `allTime`: `[earliestDataDate(data), hoy]` — si `earliestDataDate` es `null` (usuario sin ningún dato en ninguna categoría), `resolveRange` devuelve `null` y el componente muestra el estado vacío de H2 criterio 4 directamente, sin llegar a pintar el gráfico.
- `custom`: usa `custom.start`/`custom.end` tal cual si `isValidCustomRange` es `true`; si no, el formulario muestra el aviso de H2 criterio 3 y no se recalcula (se mantiene el rango/gráfico anterior).
- Por defecto al entrar en la vista: `last12Months` (asunción de spec.md §3, confirmada al aprobar la spec).

## 3. Frontend — componente

Todo dentro de `WealthPage.tsx` (no hace falta una página nueva ni una ruta nueva — vive junto a la tarjeta "Total" existente, fuera del bloque de las 7 secciones plegables por categoría: es un análisis agregado, no una categoría más):

- Un `<select>` o grupo de botones con las 4 opciones de `WealthEvolutionRangeMode`; en `custom` se muestran dos `<input type="date">` (inicio/fin).
- `recharts` `LineChart` con una única `<Line dataKey="total" name="Patrimonio total">`, mismo patrón que el gráfico de `YearSummary` en `DashboardPage.tsx` (`ResponsiveContainer` + `CartesianGrid` + `XAxis dataKey="weekEnding"` + `Tooltip` + `Line type="monotone"`). Los valores se formatean con `formatCurrency` (`./home-shared.ts`, ya usado en `WealthPage.tsx`) en el tooltip/eje Y.
- Los estilos de línea/tick (`CHART_TICK_STYLE`, colores) no están exportados desde `DashboardPage.tsx` — se declaran constantes propias y pequeñas en `WealthPage.tsx` en vez de extraer un módulo compartido (no hay una tercera consumidora todavía; extraerlo sería una abstracción prematura).
- Estado vacío de H2 criterio 4: si `resolveRange` devuelve `null`, o si la serie resultante no tiene ningún punto con total > 0 en ningún punto (posible con `custom` apuntando a un hueco sin datos), se muestra un mensaje ("No hay datos de patrimonio en este periodo.") en vez del `LineChart`.

## 4. Testing

- `wealth-evolution.calculations.test.ts` (Vitest, sin React): casos de spec.md — forward-fill dentro del rango, categoría sin ninguna entrada nunca (no contribuye, no rompe), categoría cuya primera entrada cae a mitad del rango (antes no contribuye, después sí y se mantiene), compra de acción posterior a una semana concreta no cuenta todavía en esa semana, `allTime` sin ningún dato ⇒ `resolveRange` da `null`, `custom` con fin anterior a inicio o fin futuro ⇒ `isValidCustomRange` da `false`.
- `WealthPage.test.tsx` (ya existente, Testing Library): añadir casos para el selector de rango (cambiar de modo recalcula, `custom` con rango inválido muestra el aviso y no rompe el render) y para el estado vacío. Mismo patrón de mocks de API ya usado en ese fichero (los `vi.fn()` sobre `../api/*`).

## 5. Fuera de este plan

- Ningún endpoint ni módulo backend nuevo (§0).
- Ninguna tabla ni migración nueva — reutiliza el histórico ya existente de spec 019-025.
- No se toca la tarjeta "Total" existente (sigue mostrando el valor actual, sin fecha) ni las 7 secciones plegables por categoría.
- No se implementa desglose por categoría en el gráfico (stacked/composición), patrimonio neto con pasivos, rentabilidad, ni exportar el gráfico — todo ello fuera de alcance de spec.md §2.
