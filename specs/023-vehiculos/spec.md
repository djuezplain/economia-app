# Spec 023 — Vehículos, con historial de valoraciones

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 018 dejó "Vehículos" como una de las 5 categorías de Resumen Patrimonio sin implementar ("Próximamente."). Esta spec la implementa, pero **no** replica el criterio de spec 020/021/022 (Acciones/Fondos/Cripto: posición + historial de compras + historial de valoraciones) porque un vehículo no tiene "cantidad" — no se compra la misma posición varias veces como una acción o una criptomoneda. En su lugar replica el criterio de spec 019 (Cuentas Bancarias): **Marca/Modelo + Matrícula pasa a identificar una posición única por usuario**, con un **precio y fecha de compra fijados una sola vez al crear la posición**, y un único historial de valoraciones (a qué valor está el vehículo, en cada fecha que se anote) — igual que el historial de saldos de una cuenta bancaria, pero de valor en vez de saldo.

## 1. Historias de usuario

**H1 — Dar de alta un vehículo (posición) una sola vez**

Como usuario quiero registrar cada vehículo (Marca/Modelo + Matrícula, con su precio y fecha de compra) una única vez, para no tener que volver a escribirlo cada vez que quiero anotar su valor actual.

- Criterio 1: un vehículo se crea con Marca/Modelo, Matrícula, Precio de compra y Fecha de compra (con el día de hoy por defecto).
- Criterio 2: no se puede crear dos veces el mismo vehículo (misma Marca/Modelo + misma Matrícula) para el mismo usuario — se avisa con un error claro (409), mismo criterio que Cuentas Bancarias/Acciones/Fondos/Cripto.
- Criterio 3: Marca/Modelo, Matrícula, Precio de compra y Fecha de compra se pueden editar después de creado, sin perder su historial de valoraciones.
- Criterio 4: eliminar un vehículo elimina también todo su historial de valoraciones — se avisa antes de que sea irreversible.

**H2 — Anotar el valor de un vehículo en distintos momentos**

Como usuario quiero anotar, dentro de un vehículo ya creado, a qué valor está en distintos momentos, para ver su depreciación (o revalorización) en el tiempo — igual que ya se puede hacer con el saldo de una cuenta bancaria (spec 019) o la cotización de una acción/fondo/cripto (specs 020/021/022).

- Criterio 1: cada entrada de valoración tiene Valor actual y Fecha, con el día de hoy por defecto.
- Criterio 2: el Valor actual admite hasta dos decimales y debe ser siempre positivo (`IsMoneyAmount`, no `IsSignedMoneyAmount`) — a diferencia del saldo de una cuenta bancaria, un vehículo no puede valer menos que 0.
- Criterio 3: un vehículo puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 4: el historial de valoraciones se muestra ordenado de la más reciente a la más antigua; el vehículo muestra, como su valor "actual", el de la valoración más reciente — no un valor guardado ni derivado de ningún cálculo (a diferencia de Acciones/Fondos/Cripto, aquí no hay "cantidad" por la que multiplicar).
- Criterio 5: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni al vehículo.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una valoración solo se puede añadir a un vehículo propio.
- Criterio 7: el título del vehículo muestra el % de ganancia o pérdida sobre el precio de compra — (Valor actual − Precio de compra) / Precio de compra × 100 — en verde si es positivo, en rojo si es negativo. No se muestra si no hay ninguna valoración — mismo criterio que Acciones/Fondos/Cripto, simplificado (aquí siempre hay un precio de compra, fijado en H1 criterio 1).

**H3 — La tarjeta "Total" de Resumen Patrimonio incluye Vehículos**

Como usuario quiero que la tarjeta "Total" ya existente (spec 020, H4) sume también el valor actual de mis vehículos, para seguir viendo de un vistazo el total de todo mi patrimonio registrado.

- Criterio 1: la tarjeta "Total" pasa a sumar Cuentas Bancarias + Acciones + Fondos Inversión + Cripto + Vehículos.
- Criterio 2: la tarjeta desglosa los cinco sumandos por separado.
- Criterio 3: un vehículo sin ninguna valoración cuenta como 0 en el total — mismo criterio que Acciones/Fondos/Cripto.
- Criterio 4: el total se calcula, nunca se guarda — mismo criterio que el resto de esta página.

## 2. Fuera de alcance

- Cualquier cambio a "Cuentas Bancarias" (spec 019), "Acciones" (spec 020), "Fondos Inversión" (spec 021) o "Cripto" (spec 022) — sin cambios.
- Cualquier cambio a las 2 categorías que siguen sin implementar tras esta spec (Fondo Pensiones, Efectivo).
- Valoración automática de vehículos (p. ej. consultando una tabla de depreciación o un tasador externo) — el Valor actual sigue siendo un campo manual, mismo criterio que el resto de Resumen Patrimonio.
- Un historial de "compras" con cantidad, como en Acciones/Fondos/Cripto — un vehículo es una unidad, no algo que se compre varias veces; el precio y la fecha de compra son dos campos fijos de la posición (editables, pero no un historial aditivo).
- Datos de mantenimiento, ITV/seguro, kilometraje o cualquier otro dato del vehículo más allá de Marca/Modelo y Matrícula.
- Multidivisa — mismo criterio que el resto de la app.
- Modo offline — mismo criterio que el resto de Resumen Patrimonio (spec 018, H6 de spec 011: fuera de alcance salvo que se pida explícitamente).

## 3. Decisiones tomadas directamente con Diego

1. Modelo de datos: **historial único de valoraciones** (como Cuentas Bancarias, spec 019), no el historial doble de compras+valoraciones de Acciones/Fondos/Cripto — un vehículo no tiene "cantidad".
2. Campos identificativos de la posición: **Marca/Modelo + Matrícula**.
3. La tarjeta "Total" pasa a sumar también Vehículos (quinto sumando).
