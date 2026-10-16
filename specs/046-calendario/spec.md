# Spec 046 — Calendario de ingresos y gastos

**Fase:** 1 de 4

## Objetivo
Ver los movimientos (ingresos y gastos) sobre un calendario mensual, para saber de un vistazo qué días hubo actividad y cuánto. Diseño basado en la captura de referencia (cuadrícula oscura, indicadores por día, detalle del día debajo).

## Historias
- **H1 — Calendario mensual.** Página `/calendar` ("Calendario" en el menú lateral). Cuadrícula de 7 columnas, semana de lunes a domingo, con los días del mes anterior/siguiente atenuados. Navegación mes anterior / mes siguiente / "Hoy".
  - Criterios: el día de hoy se resalta; cada día con movimientos muestra hasta 3 iconos de categoría (borde verde = ingreso, naranja = gasto) y "+N" si hay más.
- **H2 — Resumen del mes.** Encima de la cuadrícula: total de ingresos, gastos y balance del mes mostrado.
- **H3 — Detalle del día.** Al pulsar un día se selecciona y debajo se listan sus movimientos como tarjetas (icono, concepto, categoría · medio de pago, importe con signo). Por defecto: hoy si está en el mes, si no el día 1. Día sin movimientos → mensaje vacío. Cada tarjeta enlaza a editar (`/movements/register/:id`).
- **H4 — Offline.** Sin conexión se lee de la copia local, con el mismo aviso que "Movimientos".

## Fuera de alcance
Movimientos futuros/recurrentes (no existen en el modelo), cambios de backend.
