# Spec 024 — Fondo Pensiones, con historial de aportaciones y de valoraciones

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 018 dejó "Fondo Pensiones" como una de las 5 categorías de Resumen Patrimonio sin implementar ("Próximamente."). Esta spec la implementa con un **patrón nuevo, en tres niveles pero sin matemática de cantidad × precio**: a diferencia de Acciones/Fondos Inversión/Cripto (specs 020/021/022, posición + historial de compras con cantidad y precio + historial de valoraciones con precio por unidad), un plan de pensiones sí se "compra" muchas veces (aportaciones periódicas, como Acciones/Fondos/Cripto) pero el ahorrador medio no ve ni conoce el "número de participaciones" de su plan — solo ve, en la app de su entidad gestora, cuánto ha aportado en total y cuánto vale ahora. Por eso el historial de aportaciones aquí es solo importe y fecha (aditivo, sin cantidad), y el historial de valoraciones lleva el valor total directamente (sin multiplicar por nada) — a diferencia también de Vehículos (spec 023, solo una "compra" fija, sin aportaciones periódicas).

## 1. Historias de usuario

**H1 — Dar de alta un plan de pensiones (posición) una sola vez**

Como usuario quiero registrar cada plan de pensiones (Entidad Gestora + Plan) una única vez, para no tener que volver a escribirlo cada vez que hago una aportación o quiero anotar su valor.

- Criterio 1: una posición se crea con Entidad Gestora y Plan.
- Criterio 2: no se puede crear dos veces la misma posición (misma Entidad Gestora + mismo Plan) para el mismo usuario — se avisa con un error claro (409), mismo criterio que el resto de posiciones de Resumen Patrimonio.
- Criterio 3: Entidad Gestora y Plan se pueden editar después de creada, sin perder su historial de aportaciones ni de valoraciones.
- Criterio 4: eliminar una posición elimina también todo su historial de aportaciones y de valoraciones — se avisa antes de que sea irreversible.

**H2 — Registrar cada aportación a un plan de pensiones**

Como usuario quiero anotar, dentro de una posición ya creada, cada aportación que hago (cuándo y cuánto), para llevar el histórico de lo que he aportado a lo largo del tiempo.

- Criterio 1: cada aportación tiene Importe y Fecha, con el día de hoy por defecto.
- Criterio 2: el importe admite hasta dos decimales y debe ser siempre positivo (`IsMoneyAmount`) — a diferencia de Acciones/Fondos/Cripto, no lleva cantidad ni precio por separado, es un único importe.
- Criterio 3: una posición puede tener cualquier número de aportaciones.
- Criterio 4: la posición muestra el total aportado (suma de todas las aportaciones) — calculado, nunca guardado.
- Criterio 5: cada aportación se puede editar o eliminar, sin afectar a las demás ni a la posición.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una aportación solo se puede añadir a una posición propia.

**H3 — Anotar el valor de un plan de pensiones en distintos momentos**

Como usuario quiero anotar, dentro de una posición ya creada, cuánto vale en distintos momentos, para ver su evolución en el tiempo — igual que ya se puede hacer con Acciones, Fondos Inversión, Cripto y Vehículos.

- Criterio 1: cada entrada de valoración tiene Valor total actual y Fecha, con el día de hoy por defecto.
- Criterio 2: el valor admite hasta dos decimales y debe ser siempre positivo (`IsMoneyAmount`).
- Criterio 3: una posición puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 4: el historial de valoraciones se muestra ordenado de la más reciente a la más antigua; la posición muestra, como su valor "actual", el de la valoración más reciente directamente — no se multiplica por ninguna cantidad (a diferencia de Acciones/Fondos/Cripto).
- Criterio 5: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni a la posición.
- Criterio 6: mismo aislamiento por usuario que H2 criterio 6.
- Criterio 7: el título de la posición muestra el % de ganancia o pérdida — (Valor actual − Total aportado) / Total aportado × 100 — en verde si es positivo, en rojo si es negativo. No se muestra si no hay ninguna aportación o si no hay ninguna valoración.

**H4 — La tarjeta "Total" de Resumen Patrimonio incluye Fondo Pensiones**

Como usuario quiero que la tarjeta "Total" ya existente siga sumando también el valor actual de mis planes de pensiones, para ver de un vistazo el total de todo mi patrimonio registrado.

- Criterio 1: la tarjeta "Total" pasa a sumar Cuentas Bancarias + Acciones + Fondos Inversión + Cripto + Vehículos + Fondo Pensiones.
- Criterio 2: la tarjeta desglosa los seis sumandos por separado.
- Criterio 3: una posición sin ninguna valoración cuenta como 0 en el total.
- Criterio 4: el total se calcula, nunca se guarda.

## 2. Fuera de alcance

- Cualquier cambio a las 5 categorías ya implementadas (Cuentas Bancarias, Acciones, Fondos Inversión, Cripto, Vehículos).
- La única categoría que sigue sin implementar tras esta spec es Efectivo.
- Valoración o cálculo automático del plan — Valor actual e Importe aportado son campos manuales, mismo criterio que el resto de Resumen Patrimonio.
- Número de participaciones o precio liquidativo por participación — decisión explícita (§3): aunque técnicamente un plan de pensiones es un fondo, se modela con aportaciones e importe total, no con cantidad × precio, porque es como lo ve el ahorrador medio.
- Ventajas fiscales, límites de aportación anual o cualquier cálculo relacionado con la fiscalidad de los planes de pensiones.
- Multidivisa y modo offline — mismo criterio que el resto de Resumen Patrimonio.

## 3. Decisiones tomadas directamente con Diego

1. Modelo de datos: **Aportaciones (importe + fecha, aditivo) + Valoraciones (valor total + fecha, directo)** — ni el patrón de Acciones/Fondos/Cripto (cantidad × precio) ni el de Vehículos (una sola compra fija); un patrón nuevo, en tres niveles, sin matemática de cantidad × precio.
2. Campos identificativos de la posición: **Entidad Gestora + Plan**.
