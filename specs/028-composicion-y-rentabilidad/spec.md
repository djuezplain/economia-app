# Spec 028 — Composición, Liquidez y Rentabilidad del Patrimonio

**Estado:** Aprobada (aprobada por Diego el 2026-09-06; H3 ajustada de "donut" a barra apilada al 100% durante la revisión de `plan.md`, ver ese fichero §0)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Las 5 primeras ideas de análisis pendientes tras spec 027 (que dejó explícitamente fuera de alcance cualquier desglose por categoría, ratio de liquidez, comparación aportado/valor y rentabilidad): composición del patrimonio en el tiempo, ratio de liquidez en el tiempo, composición actual, aportado vs. valor actual, y rentabilidad por categoría de inversión.

## 1. Historias de usuario

**H1 — Ver la composición del patrimonio por categoría a lo largo del tiempo**

Como usuario quiero ver, dentro de la misma sección "Evolución del patrimonio" (spec 027), cómo ha ido cambiando el peso de cada una de las 7 categorías semana a semana, para saber qué está tirando de mi patrimonio al alza o a la baja.

- Criterio 1: la sección "Evolución del patrimonio" pasa a tener un selector de vista con 3 opciones — **Total** (la línea ya existente de spec 027), **Por categoría** (nueva, gráfico de área apilada) y **Liquidez** (H2) — todas gobernadas por el mismo selector de Periodo (spec 027 H2): no se duplica el control de rango.
- Criterio 2: "Por categoría" usa exactamente las mismas reglas de spec 027 H1 (semana ISO, último valor conocido, una categoría sin ninguna entrada nunca no aparece) — mismos datos semanales, agrupados por categoría en vez de sumados en una única línea.
- Criterio 3: mismo estado vacío que spec 027 H2 criterio 4 cuando el rango elegido no tiene ningún dato.

**H2 — Ver qué proporción de mi patrimonio es líquido, a lo largo del tiempo**

Como usuario quiero ver qué porcentaje de mi patrimonio total es dinero disponible (cuentas bancarias + efectivo) en cada semana, para saber si tengo demasiado inmovilizado en inversiones o vehículos.

- Criterio 1: vista "Liquidez" del selector de H1 criterio 1 — una línea con el % que representan Cuentas Bancarias + Efectivo sobre el patrimonio total de esa semana.
- Criterio 2: mismo rango y semanas que las otras dos vistas (mismo selector de Periodo).

**H3 — Ver la composición actual del patrimonio**

Como usuario quiero ver, de un vistazo, qué parte de mi patrimonio de hoy corresponde a cada categoría, para entender mi situación actual sin tener que leer el desglose en texto de la tarjeta "Total".

- Criterio 1: gráfico de barra horizontal apilada al 100% (cambiado de "donut" durante `plan.md` §0, aprobado por Diego: la skill de dataviz del proyecto marca el donut como antipatrón para 7 categorías con valores parecidos y recomienda esta forma para "part-to-whole") junto a la tarjeta "Total" (spec 018 H4-H7), con el peso de cada una de las 7 categorías sobre el total de hoy — mismos subtotales que ya se calculan para esa tarjeta.
- Criterio 2: es una foto de "hoy", no una serie temporal — no lleva selector de rango.
- Criterio 3: una categoría con subtotal 0 no aparece en la barra (nada que representar).

**H4 — Ver cuánto he invertido frente a cuánto vale ahora**

Como usuario quiero comparar, para Acciones, Fondos, Cripto y Fondo Pensiones, cuánto dinero he metido frente a cuánto valen ahora esas posiciones, para saber si voy ganando o perdiendo en conjunto.

- Criterio 1: gráfico de barras con una barra "Aportado" y una barra "Valor actual" por cada una de las 4 categorías (Acciones: coste total de compra; Fondos: ídem; Cripto: ídem; Fondo Pensiones: total aportado), más un total agregado de las 4.
- Criterio 2: es una foto de "hoy" (no una serie temporal) — la evolución en el tiempo de esta comparación queda fuera de esta spec (§2).
- Criterio 3: una categoría sin ninguna posición no aparece en el gráfico.

**H5 — Ver la rentabilidad de cada categoría de inversión**

Como usuario quiero ver el % de ganancia o pérdida de cada categoría con coste de compra conocido, para comparar qué categoría me está rindiendo mejor.

- Criterio 1: gráfico de barras con el % de ganancia/pérdida de Acciones, Fondos, Cripto, Vehículos y Fondo Pensiones (mismo cálculo que el % ya usado hoy por posición individual en `WealthPage.tsx`, agregado a nivel de categoría completa: valor actual total vs. coste total).
- Criterio 2: una categoría sin ninguna posición, o con coste total 0, no muestra barra (no hay base sobre la que calcular un %) — mismo criterio que el % por posición individual ya existente.
- Criterio 3: Cuentas Bancarias y Efectivo quedan fuera de este gráfico — no tienen coste de compra, "rentabilidad" no aplica.
- Criterio 4: es una foto de "hoy" (no serie temporal), mismo criterio que H4.

## 2. Fuera de alcance

- Patrimonio neto real (activos − pasivos) — sigue sin existir ningún modelo de deudas/pasivos; queda para una spec futura si se decide construirlo.
- Evolución en el tiempo de "Aportado vs. valor actual" (H4) y de "Rentabilidad por categoría" (H5) — ambas son solo una foto de hoy en esta spec.
- Cualquier gráfico o análisis nuevo más allá de estos 5 (los siguientes de la lista — p. ej. desglose de rentabilidad por posición individual en gráfico, en vez de agregada por categoría — quedan para una spec futura).
- Exportar cualquiera de estos gráficos o sus datos.

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. **H1 y H2 viven dentro de la sección "Evolución del patrimonio" ya existente (spec 027)**, como vistas alternativas a la línea de "Total" bajo el mismo selector de Periodo — no se construyen 3 secciones ni 3 selectores de rango independientes.
2. **H3 es una foto de "hoy"**, junto a la tarjeta "Total" — no lleva selector de rango.
3. **H4 y H5 son fotos de "hoy"**, no series temporales — su evolución en el tiempo se deja explícitamente fuera de esta spec (§2), para no disparar el alcance.
4. **H5 incluye Vehículos** junto a Acciones/Fondos/Cripto/Fondo Pensiones, aunque su "rentabilidad" suele ser negativa por depreciación — se trata igual que el resto de categorías con coste de compra conocido, en vez de hacer una excepción.
