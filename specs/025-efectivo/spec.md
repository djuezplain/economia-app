# Spec 025 — Efectivo, con historial de importes

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 018 dejó "Efectivo" como la última de las 7 categorías de Resumen Patrimonio sin implementar ("Próximamente."). Esta spec la implementa replicando el patrón en dos niveles de Cuentas Bancarias (spec 019): una posición identificada por una **Ubicación** (texto libre, p. ej. "Cartera", "Caja fuerte", "Hucha") con un historial de importes (Importe + Fecha) — a diferencia de Cuentas Bancarias, que se identifica con dos campos (banco + número de cuenta), el efectivo no tiene un identificador natural así, por lo que basta uno solo. A diferencia también del saldo de una cuenta bancaria (que admite descubierto, importe negativo), el efectivo físico nunca puede ser negativo. Con esta spec, las 7 categorías de Resumen Patrimonio quedan completamente implementadas.

## 1. Historias de usuario

**H1 — Dar de alta una ubicación de efectivo una sola vez**

Como usuario quiero registrar cada sitio donde guardo efectivo (p. ej. "Cartera", "Caja fuerte en casa") una única vez, para no tener que volver a escribirlo cada vez que quiero anotar cuánto tengo.

- Criterio 1: una posición se crea con una Ubicación.
- Criterio 2: no se puede crear dos veces la misma ubicación (mismo texto) para el mismo usuario — se avisa con un error claro (409), mismo criterio que el resto de posiciones de Resumen Patrimonio.
- Criterio 3: la Ubicación se puede editar después de creada, sin perder su historial de importes.
- Criterio 4: eliminar una ubicación elimina también todo su historial de importes — se avisa antes de que sea irreversible.

**H2 — Anotar cuánto efectivo hay en una ubicación en distintos momentos**

Como usuario quiero anotar, dentro de una ubicación ya creada, cuánto efectivo hay en distintos momentos, para ver su evolución en el tiempo — igual que ya se puede hacer con el saldo de una cuenta bancaria (spec 019).

- Criterio 1: cada entrada tiene Importe y Fecha, con el día de hoy por defecto.
- Criterio 2: el importe admite hasta dos decimales y debe ser siempre positivo (`IsMoneyAmount`, no `IsSignedMoneyAmount`) — a diferencia del saldo de una cuenta bancaria, el efectivo físico no puede ser negativo.
- Criterio 3: una ubicación puede tener cualquier número de entradas, en cualquier fecha.
- Criterio 4: el historial se muestra ordenado de la más reciente a la más antigua; la ubicación muestra, como su valor "actual", el importe de la entrada más reciente — no un valor calculado.
- Criterio 5: cada entrada se puede editar o eliminar, sin afectar a las demás ni a la ubicación.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una entrada solo se puede añadir a una ubicación propia.

**H3 — La tarjeta "Total" de Resumen Patrimonio incluye Efectivo**

Como usuario quiero que la tarjeta "Total" ya existente siga sumando también mi efectivo, para ver de un vistazo el total de todo mi patrimonio registrado.

- Criterio 1: la tarjeta "Total" pasa a sumar Cuentas Bancarias + Acciones + Fondos Inversión + Cripto + Vehículos + Fondo Pensiones + Efectivo — las 7 categorías.
- Criterio 2: la tarjeta desglosa los siete sumandos por separado.
- Criterio 3: una ubicación sin ninguna entrada cuenta como 0 en el total.
- Criterio 4: el total se calcula, nunca se guarda.

## 2. Fuera de alcance

- Cualquier cambio a las 6 categorías ya implementadas.
- Ninguna categoría queda sin implementar tras esta spec — cierra spec 018.
- Multidivisa y modo offline — mismo criterio que el resto de Resumen Patrimonio.
- % de ganancia o pérdida — el efectivo no tiene "coste" ni "compra" sobre el que calcularlo, a diferencia del resto de categorías; solo se muestra el importe actual.

## 3. Decisiones tomadas directamente con Diego

1. Modelo de datos: **varias ubicaciones con historial** (como Cuentas Bancarias, spec 019), no un único saldo global — permite llevar por separado el efectivo en distintos sitios.
2. Campo identificativo de la posición: **Ubicación** (un único campo de texto libre, a diferencia de los dos campos de Cuentas Bancarias).
3. El importe es siempre positivo (`IsMoneyAmount`), a diferencia del saldo de una cuenta bancaria que admite descubierto.
