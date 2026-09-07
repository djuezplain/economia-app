# Spec 030 — Rentabilidad de Acciones y Fondos Inversión, con y sin dividendos

**Estado:** Implementada (decidida y construida directamente con Diego en conversación)
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 020/021 (H3 criterio 6) muestran, en el título de cada acción/fondo, un único % de ganancia/pérdida — (Valor actual − Coste total) / Coste total × 100 — que no tiene en cuenta los dividendos cobrados (spec 029). Spec 028 H5 hace lo mismo a nivel agregado, en el gráfico "Rentabilidad por categoría". Esta spec añade, **solo para Acciones y Fondos Inversión** (las dos únicas categorías con dividendos), dos rentabilidades adicionales que sí cuentan los dividendos — una con el importe neto cobrado, otra con el bruto — sin dejar de mostrar la rentabilidad original ("sin dividendos"), en los dos sitios donde ya se muestra un %: el título de cada posición individual y el gráfico agregado de spec 028.

## 1. Historias de usuario

**H1 — Ver la rentabilidad de una acción o fondo con y sin dividendos**

Como usuario quiero ver, en el título de cada acción y cada fondo, tres rentabilidades en vez de una — sin contar los dividendos cobrados, contándolos netos, y contándolos brutos — para saber cuánto me están aportando realmente los dividendos a la rentabilidad total, no solo la revalorización del precio.

- Criterio 1: **Sin dividendos** — (Valor actual − Coste total) / Coste total × 100. Sin cambios respecto a spec 020/021 (mismo cálculo, mismo criterio de no mostrarse sin compras o sin valoración).
- Criterio 2: **Con dividendos netos** — (Valor actual + Total de dividendos netos cobrados − Coste total) / Coste total × 100.
- Criterio 3: **Con dividendos brutos** — (Valor actual + Total de dividendos brutos cobrados − Coste total) / Coste total × 100. El total de dividendos brutos suma el bruto de cada dividendo individual (Neto ÷ (1 − %Retención ÷ 100) de cada uno, spec 029 H1 criterio 3), no el bruto calculado sobre la suma de los netos — cada dividendo puede tener una retención distinta.
- Criterio 4: si la posición no tiene ningún dividendo registrado, solo se muestra la rentabilidad "sin dividendos" (criterio 1) — mostrar las otras dos, idénticas a la primera por no haber nada que sumar, sería ruido. En cuanto hay al menos un dividendo, se muestran las tres.
- Criterio 5: mismo criterio de "no se muestra" que la rentabilidad ya existente — sin ninguna compra (coste total 0) o sin ninguna valoración, no se muestra ninguna de las tres.
- Criterio 6: cada una se colorea en verde o rojo según su propio signo, igual que la rentabilidad ya existente — las tres son independientes (una posición puede tener la rentabilidad "sin dividendos" en rojo y "con dividendos brutos" en verde si los dividendos cobrados compensan una pérdida de precio).

**H2 — Ver la rentabilidad por categoría, de Acciones y Fondos Inversión, con y sin dividendos**

Como usuario quiero que el gráfico "Rentabilidad por categoría" (spec 028 H5) muestre, para Acciones y para Fondos Inversión, las mismas tres rentabilidades que H1 pero agregadas a nivel de categoría completa, para comparar de un vistazo qué categoría rinde mejor una vez se cuentan los dividendos.

- Criterio 1: mismas tres fórmulas que H1, pero con el valor actual total, el coste total y el total de dividendos (netos/brutos) de **todas** las posiciones de la categoría — mismo criterio de agregación que ya usa H5 para "sin dividendos".
- Criterio 2: Cripto, Vehículos y Fondo Pensiones no cambian — siguen mostrando una única rentabilidad, igual que hoy (no tienen dividendos, spec 029 §2).
- Criterio 3: si Acciones (o Fondos Inversión) no tiene ningún dividendo cobrado en ninguna de sus posiciones, esa categoría muestra solo su rentabilidad "sin dividendos" — mismo criterio que H1 criterio 4, para no duplicar barras idénticas.
- Criterio 4: mismo criterio de "categoría sin posiciones o sin coste total no aparece" que ya usa H5 — aplica a las tres rentabilidades de una categoría a la vez (si la categoría no aparece hoy, sigue sin aparecer).

## 2. Fuera de alcance

- Cualquier cambio a Cripto, Vehículos o Fondo Pensiones — no tienen dividendos, quedan exactamente como están.
- Cualquier cambio al historial de dividendos en sí (spec 029) — esta spec solo consume los totales ya existentes (`totalDividends`), no cambia cómo se registran.
- Evolución en el tiempo de estas rentabilidades — igual que el resto de spec 028 H4/H5, es una foto de "hoy", no una serie temporal.
- Un cuarto valor "neto de impuestos reales" sobre el dividendo bruto — el % de retención introducido por el usuario (spec 029) es informativo, no una liquidación fiscal real; no se añade ninguna rentabilidad "post-IRPF".

## 3. Decisiones tomadas directamente con Diego

1. **Tres rentabilidades, no dos** — sin dividendos / con dividendos netos / con dividendos brutos — en los dos sitios donde ya existe un % (título de posición individual y gráfico agregado de spec 028).
2. **Solo Acciones y Fondos Inversión** — las dos únicas categorías con dividendos (spec 029); el resto no cambia.
3. **Sin ningún dividendo registrado, se muestra solo la rentabilidad "sin dividendos"** — las otras dos no aportan información nueva en ese caso.
