# Spec 015 — Categorías con comparativa de periodo en el Dashboard

**Estado:** Propuesta (pendiente de revisión con Diego antes de pasar a plan.md)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Nueva sección en el Dashboard (specs 002/010), que desglosa los gastos o ingresos del usuario por categoría en un periodo elegido (mes actual o año actual) y muestra, para cada categoría, si ha subido o bajado respecto al mismo periodo anterior. Solo se listan las categorías que han tenido algún movimiento en el periodo elegido — mismo comportamiento que ya tiene hoy "Gastos por categoría" (specs 002/010) dentro de "Resumen del mes".

## 1. Historias de usuario

**H1 — Elegir tipo de movimiento e intervalo**

Como usuario quiero elegir si veo mis gastos o mis ingresos por categoría, y si los veo del mes actual o del año actual, para adaptar el desglose a lo que me interesa en cada momento.

- Criterio 1: selector Gastos/Ingresos (por defecto Gastos) — mismo selector que "Comparativa temporal" (spec 013) y "Análisis estacional" (spec 014).
- Criterio 2: selector Mes actual/Año actual (por defecto Mes actual). A diferencia de "Resumen del mes" y "Vista anual", no hay selector de mes/año concreto: esta sección siempre habla de "ahora mismo", nunca de un periodo pasado elegido a mano.
- Criterio 3: el periodo "anterior" con el que se compara es siempre el inmediatamente anterior del mismo tipo (mes anterior si el intervalo es Mes actual; año natural anterior si es Año actual) — mismo criterio que spec 013 H1 criterio 3.

**H2 — Ver el desglose por categoría del periodo**

Como usuario quiero ver, para el periodo elegido, solo las categorías en las que he tenido gasto o ingreso, con su importe total y su peso relativo, para saber en qué se concentra mi dinero ahora mismo.

- Criterio 1: se listan únicamente las categorías con algún movimiento del tipo elegido en el periodo actual; una categoría sin movimientos en el periodo actual no aparece en la lista (ni "a 0 €" ni oculta tras un aviso) — mismo comportamiento que ya tiene hoy "Gastos por categoría".
- Criterio 2: si ninguna categoría tiene movimientos en el periodo elegido, se muestra un aviso explícito ("Sin gastos/ingresos en este periodo") en vez de una lista vacía sin explicación — mismo patrón que ya usa hoy "Gastos por categoría" ("Sin gastos en este mes").
- Criterio 3: las categorías se ordenan de mayor a menor importe total, igual que ya hace hoy "Gastos por categoría".
- Criterio 4: cada categoría muestra su importe total del periodo y una barra de magnitud proporcional a su peso sobre el total del periodo (mismo patrón visual que ya usa hoy "Gastos por categoría", spec 010: lista con barra de progreso de 8px).

**H3 — Ver si cada categoría ha subido o bajado respecto al periodo anterior**

Como usuario quiero ver, junto a cada categoría, si en ella he gastado/ingresado más o menos que en el periodo anterior equivalente, para detectar cambios en mis hábitos categoría a categoría.

- Criterio 1: cada categoría listada muestra una etiqueta de variación (subida/bajada, con el % de cambio) respecto a su propio importe en el periodo anterior.
- Criterio 2: si el periodo actual está en curso (mes actual, o año actual en el año en el que estamos), la comparación usa el mismo número de días transcurridos en ambos periodos (los días que llevamos del periodo actual, contra el mismo número de días desde el inicio del periodo anterior) — mismo criterio de tramos iguales que spec 013 H2, para no comparar, p. ej., los 4 días que llevamos de un mes contra el mes anterior completo.
- Criterio 3: si la categoría no tenía ningún movimiento en el periodo anterior (es "nueva" en este periodo), se marca explícitamente como tal (p. ej. "nuevo") en vez de mostrar un % de subida infinito o erróneo — mismo criterio de "sin datos ante división por cero" que ya usan spec 013 H3 criterio 2 y spec 014 H3 criterio 4.
- Criterio 4: una categoría con el mismo importe en ambos periodos se marca como "igual" (0%), no como subida ni como bajada.

## 2. Fuera de alcance

- Elegir un mes o año concreto distinto del actual, o guardar entre sesiones la preferencia de tipo/intervalo elegida — mismo criterio de no-persistencia que spec 013/014.
- Categorías que tuvieron movimientos en el periodo anterior pero ninguno en el periodo actual: no aparecen en la lista (no se muestra una "caída del 100%" ni una fila a 0 €) — mismo comportamiento que ya tiene hoy "Gastos por categoría", que tampoco lista categorías sin movimientos en el periodo mostrado.
- Desglose por subcategoría dentro de cada categoría.
- Semana o trimestre como intervalo (a diferencia de spec 013) — aquí el intervalo es fijo a Mes actual/Año actual, tal como se pidió.
- Cualquier cambio a la sección "Gastos por categoría" ya existente dentro de "Resumen del mes" (specs 002/010): la nueva sección es independiente y no la sustituye ni la modifica.

## 3. Decisiones tomadas con Diego antes de pasar a plan.md

1. **Selector Gastos/Ingresos incluido**, por consistencia con "Comparativa temporal" (013) y "Análisis estacional" (014) — decidido explícitamente tras consultarlo con Diego, en vez de dejarlo fijo en Gastos como la sección original en la que se basa.
2. **Intervalo fijo a "ahora"**: Mes actual/Año actual, sin selector de mes/año concreto — a diferencia de "Resumen del mes"/"Vista anual", el propósito de esta sección es ver "cómo voy este mes/año, y cómo cambia" en el momento presente, no explorar un histórico.
3. **Periodo anterior siempre el inmediatamente anterior del mismo tipo** (mes anterior / año natural anterior), igual que spec 013 H1 criterio 3.
4. **Comparación de tramos iguales cuando el periodo está en curso** (mismo criterio que spec 013 H2): evita comparar, por ejemplo, la primera semana de un mes contra el mes anterior completo.
5. **Solo se listan categorías con movimientos en el periodo ACTUAL**, igual que ya hace "Gastos por categoría" hoy; una categoría que se queda a 0 en el periodo actual simplemente desaparece de la lista, no se muestra con una bajada del 100%.
6. **Categorías "nuevas" en el periodo (0 en el periodo anterior) se marcan como tal**, en vez de un % de subida infinito o una división por cero.
7. **El diseño visual reutiliza el patrón ya existente** de "Gastos por categoría" (lista con barra de progreso de 8px, spec 010), añadiendo solo la etiqueta de variación (↑/↓/= + %) junto a cada categoría — no se introduce un componente ni un patrón visual nuevo.
