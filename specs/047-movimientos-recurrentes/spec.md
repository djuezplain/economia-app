# Spec 047 — Movimientos recurrentes y previstos

**Fase:** 1 de 4 (pendiente de aprobación)

## Objetivo
Definir ingresos y gastos que se repiten (alquiler, nómina, seguros…) y ver en el calendario los que están por llegar, sin que cuenten como reales hasta que el usuario los confirma.

## Decisiones tomadas (Diego)
- **Confirmación manual**: nada se crea solo; el usuario confirma cada ocurrencia.
- **La plantilla solo afecta a los futuros**: un movimiento ya confirmado es una copia independiente y nunca cambia al editar o borrar la plantilla.
- **Frecuencias**: mensual y anual (no hay diaria ni semanal).

## Historias
- **H1 — Plantillas.** Crear, editar, pausar y borrar plantillas desde "Recurrentes" (`/recurring`): tipo, categoría/subcategoría, concepto, comercio, importe, medio de pago, frecuencia (mensual/anual), fecha de inicio y fecha de fin opcional. Mismas validaciones que un movimiento normal.
- **H2 — Ocurrencias previstas.** Cada plantilla genera ocurrencias en su calendario (mensual: el mismo día de cada mes, y si el mes no lo tiene, el último día; anual: mismo día y mes, 29-feb → 28-feb en años no bisiestos). Las previstas **no** entran en totales, dashboard, objetivos ni resumen: solo se ven en Recurrentes y en el calendario.
- **H3 — Confirmar u omitir.** Una ocurrencia puede estar *pendiente*, *confirmada* u *omitida*. Confirmar crea un movimiento real con los datos de la plantilla, permitiendo ajustar el importe en ese momento. Omitir la marca como no ocurrida sin crear nada. Las pendientes con fecha pasada se muestran como "vencidas" para que no se pierdan.
- **H4 — Calendario.** El calendario (spec 046) muestra las ocurrencias pendientes con un estilo diferenciado (borde discontinuo) y, en el detalle del día, los botones Confirmar / Omitir. El resumen del mes sigue contando solo movimientos reales.
- **H5 — Aislamiento.** Todo es por usuario; un usuario nunca ve ni confirma plantillas de otro (con tests de autorización).

## Criterios de borde
- Confirmar dos veces la misma ocurrencia no duplica el movimiento (idempotente).
- Editar una plantilla no modifica movimientos confirmados; sí cambia cómo se calculan las ocurrencias no resueltas.
- Borrar una plantilla no borra movimientos confirmados. Pausar oculta sus ocurrencias futuras.
- Confirmar exige conexión (v1); sin conexión el calendario muestra los movimientos reales como hasta ahora, sin previstos.

## Fuera de alcance
Frecuencias semanal/diaria/personalizada, creación automática, importes variables previstos, soporte offline de recurrentes.
