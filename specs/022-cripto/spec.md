# Spec 022 — Cripto, con historial de compras y de valoraciones

**Estado:** Aprobada (decidida directamente con Diego en conversación, replicando el criterio de spec 020 sobre "Acciones")
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 018 dejó "Cripto" como una de las 5 categorías de Resumen Patrimonio sin implementar ("Próximamente."). Esta spec la implementa replicando exactamente el criterio de spec 020 para "Acciones": **Exchange/Wallet + Criptomoneda pasa a identificar una posición única por usuario**, y dentro de ella se llevan dos historiales independientes: el de compras (cuánta cantidad y a qué precio, en cada compra) y el de valoraciones (a qué precio cotiza, en cada fecha que se anote). No hay ningún dato previo que migrar (a diferencia de spec 020, que partía del histórico plano de spec 018 para Acciones): Cripto nunca tuvo una implementación anterior.

## 1. Historias de usuario

**H1 — Dar de alta una criptomoneda (posición) una sola vez**

Como usuario quiero registrar cada posición (Exchange/Wallet + Criptomoneda) una única vez, para no tener que volver a escribirla cada vez que compro más o quiero anotar su cotización.

- Criterio 1: una posición se crea con Exchange/Wallet y Criptomoneda.
- Criterio 2: no se puede crear dos veces la misma posición (mismo Exchange/Wallet + misma Criptomoneda) para el mismo usuario — se avisa con un error claro.
- Criterio 3: Exchange/Wallet y Criptomoneda se pueden editar después de creada, sin perder su historial de compras ni de valoraciones.
- Criterio 4: eliminar una posición elimina también todo su historial de compras y de valoraciones — se avisa antes de que sea irreversible.

**H2 — Registrar cada compra de una criptomoneda**

Como usuario quiero anotar, dentro de una posición ya creada, cada compra que hago (cuándo, cuánta cantidad y a qué precio), para llevar el histórico de mis compras a precios distintos.

- Criterio 1: cada compra tiene Cantidad, Precio de compra y Fecha de compra, con el día de hoy por defecto. Cantidad y Precio de compra admiten hasta 8 decimales, mismo criterio que spec 020 (revisión §3.sexies) para "Número de acciones"/"Precio de compra" — necesario tanto para fracciones muy pequeñas (p. ej. 0,00000001 BTC) como para precios muy bajos de algunas altcoins.
- Criterio 2: una posición puede tener cualquier número de compras.
- Criterio 3: el Valor de compra de cada compra (Precio de compra × Cantidad) se muestra calculado, nunca se guarda — mismo criterio que Acciones.
- Criterio 4: la posición muestra, además, la cantidad total (suma de todas las compras) y el coste total (suma de los valores de compra de todas las compras).
- Criterio 5: cada compra se puede editar o eliminar, sin afectar a las demás compras ni a la posición.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una compra solo se puede añadir a una posición propia.

**H3 — Anotar la cotización de una criptomoneda en distintos momentos**

Como usuario quiero anotar, dentro de una posición ya creada, a qué precio cotiza en distintos momentos, para ver su evolución en el tiempo — igual que ya se puede hacer con Acciones (spec 020) y con el saldo de una cuenta bancaria (spec 019).

- Criterio 1: cada entrada de valoración tiene Precio por unidad actual y Fecha, con el día de hoy por defecto.
- Criterio 2: a diferencia de Acciones (2 decimales, `IsMoneyAmount`), el Precio por unidad admite hasta 8 decimales — muchas altcoins cotizan por debajo de 1 céntimo, y redondear a 2 decimales las llevaría a mostrarse como 0,00 € (decidido explícitamente con Diego).
- Criterio 3: una posición puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 4: el historial de valoraciones se muestra ordenado de la más reciente a la más antigua; la posición muestra, como su valor "actual", el precio por unidad de la valoración más reciente **multiplicado por la cantidad total** (H2 criterio 4) — no un valor guardado.
- Criterio 5: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni a la posición.
- Criterio 6: mismo aislamiento por usuario que H2 criterio 6.
- Criterio 7: el título de la posición muestra el % de ganancia o pérdida sobre el coste — (Valor actual − Coste total) / Coste total × 100 — en verde si es positivo, en rojo si es negativo. No se muestra si no hay ninguna compra ni si no hay ninguna valoración — mismo criterio que Acciones (spec 020, H3 criterio 6).

**H4 — La tarjeta "Total" de Resumen Patrimonio incluye Cripto**

Como usuario quiero que la tarjeta "Total" ya existente (spec 020, H4) sume también el valor actual de mis posiciones en Cripto, para seguir viendo de un vistazo el total de todo mi patrimonio registrado.

- Criterio 1: la tarjeta "Total" pasa a sumar Cuentas Bancarias + Acciones + Cripto.
- Criterio 2: la tarjeta desglosa los tres sumandos por separado.
- Criterio 3: una posición sin ninguna valoración cuenta como 0 en el total — mismo criterio que Acciones.
- Criterio 4: el total se calcula, nunca se guarda — mismo criterio que el resto de esta página.

## 2. Fuera de alcance

- Cualquier cambio a "Cuentas Bancarias" (spec 019), "Acciones" (spec 020) o "Fondos Inversión" (spec 021) — sin cambios.
- Cualquier cambio a las 3 categorías que siguen sin implementar tras esta spec (Vehículos, Fondo Pensiones, Efectivo).
- Cotización automática de criptomonedas — el Precio por unidad sigue siendo un campo manual, no se consulta ninguna fuente de mercado ni exchange — mismo criterio que Acciones.
- Vender criptomoneda o reducir una compra existente — el historial de compras es aditivo, no lleva ventas — mismo criterio que Acciones.
- Direcciones de wallet, claves privadas o cualquier dato de custodia real de los activos — "Exchange/Wallet" es solo una etiqueta de texto libre para identificar dónde está la posición (p. ej. "Binance", "Ledger"), igual que "Banco Custodia" en Acciones.

## 3. Decisiones tomadas directamente con Diego

1. Nombres de campo: **Exchange/Wallet** + **Criptomoneda** (en vez de "Banco Custodia" + "Acción").
2. Precisión del precio de cada valoración: **8 decimales** (no 2 como en Acciones) — justificado en H3 criterio 2.

## 4. Revisión: spec 021 (Fondos Inversión) se adelantó y ya está en `master`

Esta spec se escribió y aprobó cuando "Fondos Inversión" todavía era una de las categorías sin implementar de spec 018. Mientras se implementaba esta spec, spec 021 (fondos de inversión únicos, mismo modelo que spec 020) se completó y se fusionó en `master`. Efecto sobre esta spec, sin cambiar ninguna decisión de fondo:

- H4 pasa a sumar **Cuentas Bancarias + Acciones + Fondos Inversión + Cripto** (cuatro sumandos, no tres) — mismo criterio de "0 si no hay valoración" para los cuatro.
- "Fuera de alcance" (§2) se actualiza para reflejar que Fondos Inversión ya no es una categoría sin implementar.
- La implementación de Cripto se hizo sobre el `WealthPage.tsx` ya actualizado por spec 021 (incluida la clase `wealth-item-header`, introducida en un fix de maquetación móvil posterior a spec 020) — sin ninguna otra diferencia de patrón.
