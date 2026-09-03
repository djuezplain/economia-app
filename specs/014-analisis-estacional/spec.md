# Spec 014 — Análisis estacional en el Dashboard

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Nueva sección **"Análisis estacional"** en el Dashboard (specs 002/010/013), que desglosa los gastos o los ingresos del usuario por estación del año (invierno, primavera, verano, otoño) y compara la estación con más importe frente a la de menos.

## 1. Historias de usuario

**H1 — Elegir tipo de movimiento y alcance temporal**

Como usuario quiero elegir si analizo mis gastos o mis ingresos, y si quiero verlo sobre todo mi histórico o sobre un año concreto, para adaptar el análisis a lo que me interesa en cada momento.

- Criterio 1: selector Gastos/Ingresos (por defecto Gastos) — mismo selector que "Comparativa temporal" (spec 013).
- Criterio 2: selector de alcance con dos opciones: **Histórico** (por defecto, todos los movimientos sin importar el año) o **Año concreto** (con un selector de año que aparece al elegir esta opción).
- Criterio 3: cada estación agrupa siempre los mismos 3 meses naturales completos, sin importar el alcance elegido: invierno = diciembre + enero + febrero, primavera = marzo + abril + mayo, verano = junio + julio + agosto, otoño = septiembre + octubre + noviembre.

**H2 — Ver las cifras de cada estación**

Como usuario quiero ver, para cada una de las 4 estaciones: el importe total, el número de movimientos y la media por día — para identificar en qué época del año gasto o ingreso más.

- Criterio 1: se muestran siempre las 4 estaciones, en el mismo orden, aunque alguna no tenga movimientos en el alcance elegido (aparece a 0 / "sin datos", nunca se omite).
- Criterio 2: la media diaria de una estación no cuenta días futuros — si la estación está en curso (alcance "Histórico", o "Año concreto" con el año actual), solo cuenta los días ya transcurridos de esa estación, no los 3 meses completos.
- Criterio 3 (alcance "Histórico"): la media diaria tampoco cuenta días anteriores al primer movimiento que el usuario tiene registrado — un usuario con pocos meses de histórico no ve su media "diluida" por años en los que no usaba la app.
- Criterio 4 (alcance "Año concreto"): cada estación se calcula solo con movimientos de ese año natural — el invierno de un año concreto no incluye diciembre del año anterior ni enero/febrero del año siguiente (mismo criterio de año natural que ya usa "Vista anual", spec 002 H5).

**H3 — Comparar la estación con más y con menos importe**

Como usuario quiero ver claramente qué estación tiene más gasto/ingreso y cuál tiene menos, con la diferencia en euros y en porcentaje.

- Criterio 1: la estación con mayor importe total se distingue visualmente de la de menor importe total (dos etiquetas distintas, no solo el propio número).
- Criterio 2 (semántica de la etiqueta): en Gastos, la estación con más importe se marca como la peor de las 4 y la de menos como la mejor; en Ingresos, al revés — mismo criterio que ya distingue "gasto" de "ahorro/ingreso" en Objetivos y Presupuestos (spec 007/010) y en Comparativa temporal (spec 013).
- Criterio 3: un texto resume la comparación: "En **[estación con más]** [gastas/ingresas] **[diferencia en €]** más que en **[estación con menos]** (**[% de diferencia]** más)."
- Criterio 4: si como mucho una estación tiene movimientos en el alcance elegido (o ninguna), no hay comparación posible — se muestra un aviso explícito en vez de un texto con cifras inventadas o una división por cero.

## 2. Fuera de alcance

- Comparar la misma estación entre distintos años (p. ej. "este verano" vs. "el verano pasado") — ya cubierto de forma general por "Comparativa temporal" (spec 013) con periodo "año", aunque no estación a estación; no se amplía aquí.
- Desglose por categoría dentro de una estación.
- Guardar entre sesiones la preferencia de tipo/alcance/año elegida.
- Cualquier cambio a las secciones ya existentes del Dashboard (Resumen del mes, Vista anual, Comparativa temporal).

## 3. Decisiones tomadas con Diego antes de pasar a plan.md

1. **Alcance seleccionable, no fijo**: el usuario elige entre ver todo su histórico agregado por estación, o un año natural concreto (con selector de año) — decidido explícitamente tras consultarlo, en vez de fijar una única vista.
2. **Estaciones por meses naturales completos** (invierno = dic+ene+feb, etc.), no por fechas exactas de solsticio/equinoccio — más simple y no depende de un cálculo astronómico que varía ligeramente cada año sin aportar valor real aquí.
3. **Mismo selector Gastos/Ingresos que "Comparativa temporal"** (spec 013), por consistencia — no se muestran ambos tipos a la vez en las mismas tarjetas.
4. **En "Año concreto", cada estación queda acotada a ese año natural** (el invierno no cruza a diciembre del año anterior), igual que ya funciona "Vista anual" — evita tener que consultar movimientos de un año adicional solo para completar un invierno.
5. **El diseño visual de referencia (imagen adjunta) se adapta al sistema visual ya existente**, no se reproduce literalmente: la barra de magnitud de cada tarjeta usa un único tono (igual que el desglose de "Gastos por categoría", spec 010 — la estación ya se identifica por su icono/etiqueta, no hace falta un color distinto por tarjeta como en la imagen de referencia, que es de otra app), y las etiquetas "mejor"/"peor" se asignan según la semántica gasto/ingreso del criterio 2 de H3, no fijas por posición.
