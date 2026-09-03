# Spec 013 — Comparativa temporal en el Dashboard

**Estado:** Aprobada (decidida directamente con Diego en conversación, con una imagen de referencia de diseño — sin pasar por un ciclo de revisión aparte, dado el detalle ya dado en la petición)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Nueva sección **"Comparativa temporal"** en el Dashboard (specs 002/010), que compara el periodo actual frente al inmediatamente anterior del mismo tipo (semana/mes/trimestre/año), para gastos o para ingresos.

## 1. Historias de usuario

**H1 — Elegir tipo de movimiento y granularidad**

Como usuario quiero elegir si comparo mis gastos o mis ingresos, y con qué granularidad temporal, para ver la evolución que me interesa en cada momento.

- Criterio 1: selector Gastos/Ingresos (por defecto Gastos).
- Criterio 2: selector Semana/Mes/Trimestre/Año (por defecto Mes).
- Criterio 3: el periodo "anterior" es siempre el inmediatamente anterior del mismo tipo (p. ej. trimestre actual vs. trimestre anterior — no el mismo trimestre del año pasado). Para año, el anterior es el año natural anterior.

**H2 — Comparar siempre el mismo tramo temporal**

Como usuario quiero que la comparación use siempre el mismo número de días en ambos periodos, para no comparar, por ejemplo, un mes cerrado completo con lo que llevo del mes actual.

- Criterio 1: si el periodo actual está en curso, se comparan los días transcurridos del periodo actual (desde su inicio hasta hoy) con el mismo número de días desde el inicio del periodo anterior.
- Criterio 2: si el periodo anterior tiene menos días disponibles que los transcurridos del actual (p. ej. febrero al comparar contra un mes de 30/31 días), el tramo se recorta a los días disponibles del periodo anterior — nunca se compara con días que no existen.

**H3 — Ver las cifras de la comparación**

Como usuario quiero ver, para el periodo actual y el anterior: número total de movimientos, importe total y media por día — y cuánto ha cambiado cada cifra en % respecto al periodo anterior.

- Criterio 1: se muestran los 3 datos del periodo actual, con el dato equivalente del periodo anterior como referencia.
- Criterio 2: cada dato incluye el cambio en % respecto al periodo anterior; si el periodo anterior es 0, se indica "sin datos" en vez de un % erróneo o una división por cero (mismo criterio que `savingsPercent`, spec 002).
- Criterio 3: un texto resume el resultado ("Has gastado/ingresado un X% más/menos que en el periodo anterior...").

## 2. Fuera de alcance

- Comparar periodos no consecutivos (elegir manualmente qué mes comparar contra qué otro).
- Desglose por categoría dentro de la comparativa (ya existe en "Resumen del mes").
- Guardar entre sesiones la preferencia de tipo/periodo elegida.
- Cualquier cambio a los endpoints `/dashboard/month` y `/dashboard/year` ya existentes.

## 3. Decisiones tomadas con Diego antes de implementar

1. La semana usa el criterio ISO (lunes a domingo).
2. El trimestre usa el calendario natural (Q1 ene-mar, Q2 abr-jun, Q3 jul-sep, Q4 oct-dic).
3. El diseño visual de referencia (adjunto) se adapta al sistema visual ya existente de la app (`.seg` para las pestañas, `.tag`/`.card` para las cifras — spec 010) en vez de reproducir literalmente sus colores y pastillas, que pertenecen a otra app (control de un vehículo eléctrico) y no a este sistema de diseño.
