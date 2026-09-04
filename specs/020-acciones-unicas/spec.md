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

- Criterio 1: cada entrada de valoración tiene Precio por acción actual y Fecha, con el día de hoy por defecto. *(Revisión §3.ter: antes pedía el valor total de la posición — ver más abajo.)*
- Criterio 2: una acción puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 3: el historial de valoraciones de una acción se muestra ordenado de la más reciente a la más antigua; la posición muestra, como su valor "actual", el precio por acción de la valoración más reciente **multiplicado por el nº total de acciones** (H2 criterio 4) — no un valor guardado.
- Criterio 4: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni a la acción.
- Criterio 5: mismo aislamiento por usuario que H2 criterio 6.
- Criterio 6: el título de la acción muestra el % de ganancia o pérdida sobre el coste — (Valor actual − Coste total) / Coste total × 100 — en verde si es positivo, en rojo si es negativo. No se muestra si no hay ninguna compra (sin coste no hay base sobre la que calcular un %) ni si no hay ninguna valoración. *(Revisión §3.quater.)*

**H4 — Ver el total del patrimonio registrado, de un vistazo**

Como usuario quiero ver, nada más entrar en Resumen Patrimonio, el sumatorio de Cuentas Bancarias y Acciones, para no tener que sumarlo a mano abriendo cada sección. *(Revisión §3.quinquies — pedida por Diego después de H1-H3, no forma parte del alcance original de esta spec sobre "Acciones", pero se documenta aquí por no haber ninguna spec de nivel de página dedicada.)*

- Criterio 1: al principio de la página, antes de "Cuentas Bancarias", una tarjeta "Total" muestra la suma del último saldo de cada cuenta bancaria más el valor actual de cada acción.
- Criterio 2: la misma tarjeta desglosa los dos sumandos por separado (Cuentas Bancarias / Acciones).
- Criterio 3: una cuenta sin ningún saldo o una acción sin ninguna valoración cuentan como 0 en el total — mismo criterio que "Sin saldo"/"Sin valoración" en sus propias tarjetas.
- Criterio 4: el total se calcula, nunca se guarda — mismo criterio que el resto de esta página (coste total, valor actual, % de ganancia/pérdida).

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

## 3.ter Revisión: valoración = precio por acción, no valor total de la posición

Tras probar la revisión anterior, Diego pidió un tercer cambio: al anotar una valoración (H3), el campo pedía el **valor total** de la posición (lo que valen todas las acciones que se poseen); Diego quiere anotar el **precio por acción** (la cotización en ese momento), no el total.

- El campo se renombra de "Valoración actual" a "Precio por acción actual" (`stockValuations.pricePerShare`, antes `valuation`).
- El valor total de la posición (lo que antes se guardaba directamente) pasa a **calcularse**: precio por acción de la valoración más reciente × nº total de acciones (H2 criterio 4, sobre el historial de compras) — mismo criterio que `purchaseValue`/`totalCost`, nunca se guarda (`currentValue`, `wealth.calculations.ts`).
- Migración: las valoraciones ya guardadas bajo el modelo anterior (con el valor total) se trasladan tal cual a `pricePerShare` — no hay forma fiable de reconstruir a posteriori qué precio por acción correspondía a un valor total histórico (el nº de acciones poseídas en cada fecha pasada no se registra), así que la migración es una copia literal del número, no una conversión. Dado que esta spec aún no tenía datos reales en producción (solo pruebas), no se considera pérdida de información relevante.

## 3.quater Revisión: % de ganancia/pérdida en el título de la acción

Diego pidió, sobre la revisión anterior (con `currentValue` ya calculado), mostrar en el título de cada acción el % de ganancia o pérdida sobre lo invertido — en verde si gana, en rojo si pierde (H3 criterio 6).

- Fórmula: (Valor actual − Coste total) / Coste total × 100 — mismo criterio de "calculado, nunca guardado" que el resto de esta spec (`gainLossPercent`, junto a `currentValue` en el frontend; no se añade al backend porque, a diferencia de `currentValue`, no hace falta en ningún endpoint, solo se usa al pintar la tarjeta).
- Sin ninguna compra (Coste total = 0) no se muestra — dividir entre cero no tiene sentido y, sin coste, tampoco hay "ganancia" que medir.
- Sin ninguna valoración tampoco se muestra — mismo criterio que "Sin valoración" ya existente para el valor actual.
- Colores: `var(--status-green)`/`var(--status-red)`, variables ya usadas en el proyecto para positivo/negativo (`ProgressBar.tsx`) — no se añade ninguna variable de color nueva.

## 3.quinquies Revisión: tarjeta "Total" al principio de la página (H4)

Diego pidió, sobre las revisiones anteriores, añadir al principio de Resumen Patrimonio (antes de "Cuentas Bancarias") una tarjeta con el sumatorio de Cuentas Bancarias y Acciones — ver H4 arriba.

- Solo se muestra una vez han cargado las 5 listas de las que depende (`accounts`, `balances`, `stockList`, `purchases`, `valuations`) — evita un parpadeo mostrando "0,00 €" mientras aún se está cargando.
- Cuentas Bancarias: para cada cuenta, su último saldo (o 0 si no tiene ninguno) — mismo criterio de "más reciente = primero en la lista ya ordenada por fecha" que usa cada tarjeta de cuenta individual.
- Acciones: para cada acción, su valor actual (`currentValue`, igual que en su propia tarjeta) — 0 si no tiene ninguna valoración.
- Fuera de alcance de esta tarjeta: cualquier otra de las 5 categorías sin implementar (Fondos Inversión, Cripto, Vehículos, Fondo Pensiones, Efectivo) no entra en la suma — no tienen datos que sumar todavía.

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. Modelo en tres niveles: **acción** (Banco Custodia + Acción, única por usuario), **compra** (Número de acciones + Precio de compra, muchas por acción) y **valoración** (Valoración actual + Fecha, muchas por acción) — dos historiales independientes dentro de la misma acción, no uno solo. Decidido explícitamente frente a la alternativa de un único historial de valoraciones fechadas (que habría obligado a fijar Número de acciones/Precio de compra en la propia acción, perdiendo la posibilidad ya existente de varias compras a precios distintos).
2. La unicidad de una acción (Banco Custodia + Acción) se valida en el servicio, no con una constraint SQL — mismo criterio que `bankAccounts` (spec 019) y `savingsGoals`.
3. Los datos que ya existan en producción bajo el modelo de spec 018 (tabla `stock_entries`) se migran automáticamente al modelo nuevo en la propia migración de base de datos: cada fila se convierte en una acción (agrupando por Banco Custodia + Acción) con una compra y una valoración — mismo criterio que la migración de spec 019 para cuentas bancarias.
