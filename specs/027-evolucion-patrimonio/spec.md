# Spec 027 — Evolución del Patrimonio

**Estado:** Aprobada (aprobada por Diego el 2026-09-06; rango por defecto "Últimos 12 meses" confirmado por defecto de asunción no objetada)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Una nueva vista dentro de "Resumen Patrimonio" (spec 018) con un **gráfico de evolución del patrimonio total** a lo largo del tiempo, más un **selector de rango de fechas**. Es el primer análisis agregado de esta sección — hasta ahora "Resumen Patrimonio" solo mostraba un total puntual (spec 018 §2, que dejó explícitamente fuera de alcance cualquier evolución agregada).

## 1. Historias de usuario

**H1 — Ver la evolución del patrimonio total en un gráfico**

Como usuario quiero ver un gráfico de líneas con mi patrimonio total semana a semana, para saber si mi patrimonio crece o baja a lo largo del tiempo, sin tener que sumar cada categoría a mano.

- Criterio 1: el gráfico tiene un punto por semana. Cada punto es la suma, en esa semana, del último valor conocido de cada una de las 7 categorías (Cuentas Bancarias, Acciones, Fondos Inversión, Cripto, Vehículos, Fondo Pensiones, Efectivo).
- Criterio 2: si una categoría no tiene ninguna entrada nueva en una semana concreta, se usa su último valor conocido de una semana anterior (no se trata como si valiera 0 esa semana).
- Criterio 3: una categoría en la que el usuario **todavía no ha registrado ninguna entrada** no participa en el total hasta la semana de su primera entrada — no cuenta como 0 antes de esa fecha. Esto evita que el patrimonio total parezca caer artificialmente el día que el usuario empieza a usar una categoría nueva.
- Criterio 4: los datos de esta vista pertenecen únicamente al usuario que los ve — mismo aislamiento por usuario que el resto de la app (constitution §2).

**H2 — Elegir qué periodo se muestra**

Como usuario quiero elegir entre varios rangos de fechas predefinidos o uno propio, para poder ver tanto la evolución reciente como todo mi histórico.

- Criterio 1: existen 4 opciones de rango: **Últimos 12 meses** (opción por defecto al entrar — a confirmar en la revisión de esta spec), **Año actual**, **Todo el histórico**, y **Rango personalizado** (el usuario elige fecha de inicio y fecha de fin).
- Criterio 2: al cambiar de rango, el gráfico se recalcula sobre las mismas reglas de H1 (semanal, forward-fill, exclusión de categorías sin datos aún), solo cambia qué tramo de semanas se muestra.
- Criterio 3: en "Rango personalizado", la fecha de fin no puede ser anterior a la fecha de inicio, y la fecha de fin no puede ser posterior a hoy. Si el usuario introduce un rango inválido, se muestra un aviso claro y no se recalcula el gráfico.
- Criterio 4: si el rango elegido no contiene ninguna entrada en ninguna categoría, se muestra un mensaje de estado vacío explicando que no hay datos en ese periodo — nunca un gráfico en blanco sin explicación ni un error.

## 2. Fuera de alcance

- Desglose por categoría dentro del gráfico (stacked area, composición) — esta spec entrega únicamente la línea de patrimonio total. La composición por categoría queda para una spec futura.
- Patrimonio neto real (activos − pasivos) — hoy no existe ningún modelo de deudas/pasivos en la app; esta spec sigue trabajando sobre patrimonio bruto (suma de las 7 categorías de activos), igual que la tarjeta "Total" de spec 018.
- Rentabilidad de inversiones (aportado vs. revalorizado), ratio de liquidez, comparativas año contra año superpuestas — quedan para specs futuras.
- Exportar el gráfico o sus datos (imagen, CSV, etc.).
- Cambiar la granularidad a diaria o mensual — esta spec fija granularidad semanal (H1 criterio 1); otra granularidad requeriría una spec propia.

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. **Granularidad semanal** (no mensual ni por cada cambio de dato) — un punto por semana, usando el último valor conocido de cada categoría hasta el final de esa semana.
2. **Selector de rango con 4 modos**: Últimos 12 meses, Año actual, Todo el histórico, Rango personalizado (fecha inicio + fecha fin). Pendiente de confirmar cuál de los 4 es el que se muestra por defecto al entrar — esta spec asume "Últimos 12 meses" salvo que se indique lo contrario en la revisión.
3. **Categorías sin ninguna entrada se excluyen del total** hasta la semana de su primera entrada (no cuentan como 0) — evita caídas artificiales del total al empezar a usar una categoría nueva.
