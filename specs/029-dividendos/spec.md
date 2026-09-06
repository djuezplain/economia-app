# Spec 029 — Dividendos cobrados de Acciones y Fondos de Inversión

**Estado:** Implementada (decidida y construida directamente con Diego en conversación)
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 020 (Acciones) y spec 021 (Fondos Inversión) dejaron cada posición con dos historiales independientes: compras y valoraciones. Ninguno de los dos recoge los dividendos que la posición va pagando — un dato que ya estaba previsto desde el documento de requisitos original (`docs/requisitos_app_economia.md`, RF-7.3: "Registrar dividendos o rendimientos recibidos de cada fondo"), pero que nunca se implementó, ni para Fondos ni para Acciones.

Esta spec añade un **tercer historial, "Dividendos"**, dentro de cada acción y dentro de cada fondo ya dado de alta — mismo patrón de "posición + varios historiales independientes" que ya usan Acciones/Fondos (compras + valoraciones) y Fondo Pensiones (aportaciones + valoraciones), pero sin afectar a ninguno de los historiales ya existentes: un dividendo no es una compra (no cambia el número de acciones/participaciones ni el coste) ni una valoración (no cambia el valor actual de la posición).

## 1. Historias de usuario

**H1 — Registrar cada dividendo cobrado, dentro de una acción o un fondo ya dado de alta**

Como usuario quiero anotar, dentro de una acción o un fondo ya creados, cada dividendo que cobro (cuándo y cuánto), para llevar el histórico de lo que me ha ido pagando esa posición.

- Criterio 1: cada dividendo tiene Importe neto, % de Retención y Fecha, con el día de hoy por defecto y 19% de retención por defecto (el tipo habitual en España).
- Criterio 2: el Importe neto admite hasta dos decimales y debe ser siempre positivo — mismo criterio que el resto de importes en euros de la app. El % de Retención admite decimales, debe estar entre 0 y un valor por debajo de 100 (un 100% de retención dejaría el bruto sin definir).
- Criterio 3: el Importe bruto (lo que la posición ha repartido antes de retención) se muestra calculado — Neto ÷ (1 − %Retención ÷ 100) — nunca se guarda; se recalcula si se edita el neto o el % de retención.
- Criterio 4: una acción o un fondo pueden tener cualquier número de dividendos, en cualquier fecha.
- Criterio 5: cada dividendo se puede editar o eliminar, sin afectar a los demás ni a la posición.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — un dividendo solo se puede añadir a una acción o fondo propios.
- Criterio 7: registrar, editar o eliminar un dividendo no cambia el número de acciones/participaciones, el coste total, el valor actual ni el % de ganancia/pérdida de la posición (H2/H3 de specs 020 y 021) — es un historial informativo aparte, no una compra ni una valoración.

**H2 — Ver el total de dividendos cobrados de cada posición**

Como usuario quiero ver, en cada acción y en cada fondo, cuánto llevo cobrado en dividendos en total, sin sumarlo a mano.

- Criterio 1: cada acción/fondo muestra el total neto cobrado en dividendos (suma de su historial) — calculado, nunca guardado.
- Criterio 2: una posición sin ningún dividendo muestra "Sin dividendos" (o 0), mismo criterio que "Sin valoración" ya usado en Acciones/Fondos.
- Criterio 3: el historial de dividendos de una posición se muestra ordenado del más reciente al más antiguo, mismo criterio que el historial de valoraciones.

**H3 — Ver el total agregado de dividendos cobrados de toda la cartera**

Como usuario quiero ver, de un vistazo, cuánto llevo cobrado en dividendos entre todas mis acciones y fondos, sin tener que sumar posición por posición.

- Criterio 1: en Resumen Patrimonio se añade un total agregado de "Dividendos cobrados", sumando el total neto de todas las acciones y todos los fondos del usuario.
- Criterio 2: el total agregado desglosa el importe por Acciones y por Fondos Inversión, por separado.
- Criterio 3: se calcula, nunca se guarda.
- Criterio 4: este total **no** se incluye en la tarjeta "Total" de patrimonio ya existente (H4 de specs 020/021, que suma Cuentas Bancarias + Acciones + Fondos Inversión + Cripto + Vehículos + Fondo Pensiones): un dividendo cobrado es efectivo que ya ha entrado y que, si el usuario lo conserva, contará por su cuenta en Cuentas Bancarias o Efectivo — sumarlo también aquí lo duplicaría. Es una cifra/tarjeta aparte, no un sumando más del total.

## 2. Fuera de alcance

- Enlazar el dividendo con el módulo de Movimientos/Ingresos (crear o vincular un movimiento con categoría "Dividendo", ya existente desde spec 002) — se registra únicamente dentro de Resumen Patrimonio. Se deja para una spec futura si se decide más adelante.
- Migrar o relacionar con esta spec los dividendos que un usuario ya tenga anotados a mano como movimientos de Ingresos con categoría "Dividendo" — siguen existiendo tal cual, sin ninguna relación con el nuevo historial.
- Cualquier cambio a compras o valoraciones de Acciones/Fondos (specs 020/021) — H1 criterio 7 lo deja explícito.
- Dividendos, aportaciones o rendimientos de cualquier otra categoría de Resumen Patrimonio (Cuentas Bancarias, Cripto, Vehículos, Fondo Pensiones, Efectivo) — únicamente Acciones y Fondos Inversión, igual que pide la petición original.
- Cálculo fiscal real sobre el dividendo (tramos de IRPF del ahorro, exenciones, etc.) — el % de Retención es un dato informativo que el usuario introduce para poder ver el bruto, no una liquidación fiscal.
- Rentabilidad por dividendo (dividend yield) o cualquier métrica que relacione lo cobrado en dividendos con el valor o coste de la posición — posible spec futura.
- Multidivisa y modo offline — mismo criterio que el resto de Resumen Patrimonio.

## 3. Decisiones tomadas directamente con Diego

1. **Separado del módulo de Movimientos por ahora**: el dividendo vive solo dentro de Resumen Patrimonio (Acciones/Fondos), igual que compras, valoraciones y aportaciones de Fondo Pensiones. Enlazarlo con Ingresos (como sugería RF-7.3 del documento de requisitos) queda fuera de alcance, para una spec futura si se decide.
2. **Campos**: Importe neto + % de Retención (editable, 19% por defecto) + Fecha. El Importe bruto se calcula (Neto ÷ (1 − %Retención ÷ 100)), nunca se guarda — igual que el resto de valores derivados de Resumen Patrimonio (coste total, valor actual, % de ganancia/pérdida).
3. **Además de un total por posición, se añade un total agregado** de "Dividendos cobrados" (Acciones + Fondos Inversión) en Resumen Patrimonio — sin sumarse a la tarjeta "Total" de patrimonio ya existente (§1, H3 criterio 4).
