# Spec 020 — Acciones únicas, con historial de compras y de valoraciones

**Estado:** Aprobada (decidida directamente con Diego en conversación, como continuación de spec 019 sobre "Acciones")
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 019 hizo que una cuenta bancaria (Banco + Número de Cuenta) fuera una entidad única con su historial de saldos dentro. Esta spec replica ese mismo criterio en "Acciones": **Banco Custodia + Acción pasa a identificar una posición única por usuario**, y dentro de ella se llevan **dos historiales independientes**: el de compras (cuántas acciones y a qué precio, en cada compra) y el de valoraciones (cuánto vale la posición, en cada fecha que se anote). Antes (spec 018), cada alta era una fila suelta con los 5 campos a la vez (Banco Custodia, Acción, Número acciones, Precio compra, Valoración actual), sin relación entre filas de la misma acción más allá de que el texto coincidiera.

## 1. Historias de usuario

**H1 — Dar de alta una acción (posición) una sola vez**

Como usuario quiero registrar cada posición (Banco Custodia + Acción) una única vez, para no tener que volver a escribirla cada vez que compro más o quiero anotar su valor.

- Criterio 1: una acción se crea con Banco Custodia y Acción.
- Criterio 2: no se puede crear dos veces la misma acción (mismo Banco Custodia + misma Acción) para el mismo usuario — se avisa con un error claro.
- Criterio 3: Banco Custodia y Acción se pueden editar después de creada, sin perder su historial de compras ni de valoraciones.
- Criterio 4: eliminar una acción elimina también todo su historial de compras y de valoraciones — se avisa antes de que sea irreversible.

**H2 — Registrar cada compra de una acción**

Como usuario quiero anotar, dentro de una acción ya creada, cada compra que hago (cuándo, cuántas acciones y a qué precio), para llevar el histórico de mis compras a precios distintos.

- Criterio 1: cada compra tiene Número de acciones, Precio de compra y Fecha de compra, con el día de hoy por defecto. *(Revisión tras feedback de Diego sobre la primera implementación: faltaba Fecha de compra, que sí se pedía para valoraciones — H3 — pero no se había pedido para compras; se añade aquí para que ambos historiales sean simétricos.)*
- Criterio 2: una acción puede tener cualquier número de compras — mismo criterio que ya existía en spec 018 (varias compras a precios distintos), ahora como historial dentro de la acción en vez de filas sueltas.
- Criterio 3: el Valor de compra de cada compra (Precio de compra × Número de acciones) se muestra calculado, nunca se guarda — igual que en spec 018.
- Criterio 4: la posición muestra, además, el número total de acciones (suma de todas las compras) y el coste total (suma de los valores de compra de todas las compras).
- Criterio 5: cada compra se puede editar o eliminar, sin afectar a las demás compras ni a la acción.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una compra solo se puede añadir a una acción propia.

**H3 — Anotar la valoración de una acción en distintos momentos**

Como usuario quiero anotar, dentro de una acción ya creada, cuánto vale mi posición en distintos momentos, para ver su evolución en el tiempo — igual que ya se puede hacer con el saldo de una cuenta bancaria (spec 019).

- Criterio 1: cada entrada de valoración tiene Valoración actual y Fecha, con el día de hoy por defecto.
- Criterio 2: una acción puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 3: el historial de valoraciones de una acción se muestra ordenado de la más reciente a la más antigua; la posición muestra la valoración más reciente como su valor "actual".
- Criterio 4: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni a la acción.
- Criterio 5: mismo aislamiento por usuario que H2 criterio 6.

## 2. Fuera de alcance

- Cualquier cambio a "Cuentas Bancarias" (spec 019) — sin cambios.
- Cualquier cambio a las 5 categorías sin implementar de spec 018.
- Cotización automática de acciones — la Valoración actual sigue siendo un campo manual, no se consulta ninguna fuente de mercado (sin cambios respecto a spec 018).
- Vender acciones o reducir una compra existente — el historial de compras es aditivo (registrar lo comprado), no lleva ventas; queda para una spec futura si se decide.
- Migrar automáticamente acciones que en spec 018 se escribieron con variaciones de texto (p. ej. "BBVA" vs "Bbva") a una única posición — mismo criterio que la decisión equivalente de spec 019.

## 3.bis Revisión tras la primera implementación

Tras implementar y desplegar (en rama, sin fusionar) la primera versión de esta spec, Diego pidió dos cambios sobre lo ya construido:

1. **Fecha de compra**: el historial de compras (H2) no llevaba fecha — se añade (criterio 1 de H2, arriba), simétrico con el historial de valoraciones (H3), que sí la lleva desde el principio.
2. **Alta en un solo paso**: el formulario "Añadir acción" solo pedía Banco Custodia y Acción; había que crear la acción primero y luego, dentro de su tarjeta ya expandida, añadir la primera compra por separado. Diego prefiere dar de alta la acción y su primera compra a la vez: el formulario "Añadir acción" pasa a pedir también Número de acciones, Precio de compra y Fecha de compra, y al enviarlo se crean la acción y esa primera compra en el mismo paso. Añadir compras siguientes, y anotar valoraciones, se sigue haciendo por separado dentro de la tarjeta de la acción ya creada (sin cambios en H3).

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. Modelo en tres niveles: **acción** (Banco Custodia + Acción, única por usuario), **compra** (Número de acciones + Precio de compra, muchas por acción) y **valoración** (Valoración actual + Fecha, muchas por acción) — dos historiales independientes dentro de la misma acción, no uno solo. Decidido explícitamente frente a la alternativa de un único historial de valoraciones fechadas (que habría obligado a fijar Número de acciones/Precio de compra en la propia acción, perdiendo la posibilidad ya existente de varias compras a precios distintos).
2. La unicidad de una acción (Banco Custodia + Acción) se valida en el servicio, no con una constraint SQL — mismo criterio que `bankAccounts` (spec 019) y `savingsGoals`.
3. Los datos que ya existan en producción bajo el modelo de spec 018 (tabla `stock_entries`) se migran automáticamente al modelo nuevo en la propia migración de base de datos: cada fila se convierte en una acción (agrupando por Banco Custodia + Acción) con una compra y una valoración — mismo criterio que la migración de spec 019 para cuentas bancarias.
