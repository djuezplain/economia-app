# Spec 021 — Fondos de Inversión, con historial de compras y de valoraciones

**Estado:** Implementada (decidida y construida directamente con Diego en conversación, replicando el modelo de spec 020 sobre "Acciones")
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación) — documentada tras la implementación, no antes

## 0. Qué cambia

Spec 020 hizo que una acción (Banco Custodia + Acción) fuera una entidad única por usuario, con dos historiales independientes dentro (compras y valoraciones). Esta spec replica exactamente ese mismo criterio en "Fondos Inversión", una de las 5 categorías de Resumen Patrimonio que quedaban sin implementar desde spec 018 (§2). No hay modelo previo que migrar — a diferencia de spec 020 (que sustituía `stock_entries` de spec 018), Fondos Inversión no había tenido nunca un modelo de datos propio, así que esta spec parte de cero.

## 1. Historias de usuario

**H1 — Dar de alta un fondo (posición) una sola vez**

Como usuario quiero registrar cada posición de fondo de inversión (Banco Custodia + Fondo) una única vez, para no tener que volver a escribirla cada vez que compro más participaciones o quiero anotar su valor.

- Criterio 1: un fondo se crea con Banco Custodia y Fondo.
- Criterio 2: no se puede crear dos veces el mismo fondo (mismo Banco Custodia + mismo Fondo) para el mismo usuario — se avisa con un error claro (409).
- Criterio 3: Banco Custodia y Fondo se pueden editar después de creados, sin perder su historial de compras ni de valoraciones.
- Criterio 4: eliminar un fondo elimina también todo su historial de compras y de valoraciones (cascada).

**H2 — Registrar cada compra de un fondo**

Como usuario quiero anotar, dentro de un fondo ya creado, cada compra que hago (cuándo, cuántas participaciones y a qué precio), para llevar el histórico de mis compras a precios distintos.

- Criterio 1: cada compra tiene Número de participaciones, Precio de compra y Fecha de compra, con el día de hoy por defecto. Número de participaciones y Precio de compra admiten hasta 8 decimales — mismo criterio que spec 020 (revisión §3.sexies) para fondos indexados fraccionarios.
- Criterio 2: un fondo puede tener cualquier número de compras, en fechas distintas.
- Criterio 3: el Valor de compra de cada compra (Precio de compra × Número de participaciones) se muestra calculado, nunca se guarda.
- Criterio 4: la posición muestra, además, el número total de participaciones (suma de todas las compras) y el coste total (suma de los valores de compra de todas las compras).
- Criterio 5: cada compra se puede editar o eliminar, sin afectar a las demás compras ni al fondo.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una compra solo se puede añadir a un fondo propio.

**H3 — Anotar la valoración de un fondo en distintos momentos**

Como usuario quiero anotar, dentro de un fondo ya creado, cuánto vale la participación en distintos momentos, para ver su evolución en el tiempo — igual que con acciones (spec 020).

- Criterio 1: cada entrada de valoración tiene Precio por participación actual (valor liquidativo) y Fecha, con el día de hoy por defecto. Precio por participación admite hasta 8 decimales — a diferencia de la valoración de una acción (spec 020), que se queda en 2. *(Revisión §4.)*
- Criterio 2: un fondo puede tener cualquier número de entradas de valoración, en cualquier fecha.
- Criterio 3: el historial de valoraciones se muestra de la más reciente a la más antigua; la posición muestra, como su valor "actual", el precio por participación de la valoración más reciente **multiplicado por el nº total de participaciones** (H2 criterio 4) — no un valor guardado.
- Criterio 4: cada entrada de valoración se puede editar o eliminar, sin afectar a las demás ni al fondo.
- Criterio 5: mismo aislamiento por usuario que H2 criterio 6.
- Criterio 6: el título del fondo muestra el % de ganancia o pérdida sobre el coste — (Valor actual − Coste total) / Coste total × 100 — en verde si es positivo, en rojo si es negativo. No se muestra si no hay ninguna compra ni si no hay ninguna valoración.

**H4 — El fondo entra en el total de Resumen Patrimonio**

Como usuario quiero que la tarjeta "Total" de Resumen Patrimonio (H4 de spec 020) incluya también el valor actual de mis fondos de inversión, para seguir viendo de un vistazo el sumatorio de todo lo que ya está implementado.

- Criterio 1: la tarjeta "Total" pasa a sumar Cuentas Bancarias + Acciones + Fondos Inversión.
- Criterio 2: la tarjeta desglosa los tres sumandos por separado.
- Criterio 3: un fondo sin ninguna valoración cuenta como 0 en el total — mismo criterio que Cuentas Bancarias/Acciones.
- Criterio 4: el total se calcula, nunca se guarda.

## 2. Fuera de alcance

- Cualquier cambio a "Cuentas Bancarias" (spec 019) o "Acciones" (spec 020) — sin cambios.
- Las 4 categorías de spec 018 que siguen sin implementar (Cripto, Vehículos, Fondo Pensiones, Efectivo).
- Cotización automática del valor liquidativo — sigue siendo un campo manual, sin consultar ninguna fuente de mercado (mismo criterio que Acciones).
- Vender participaciones o reducir una compra existente — el historial de compras es aditivo, no lleva ventas.
- Cualquier distinción entre tipos de fondo (renta fija/variable, indexado, etc.) — un fondo es, a efectos de esta spec, únicamente Banco Custodia + Fondo, igual que una acción es Banco Custodia + Acción.

## 3. Decisiones

1. Mismo modelo en tres niveles que spec 020: **fondo** (Banco Custodia + Fondo, único por usuario), **compra** (Número de participaciones + Precio de compra + Fecha, muchas por fondo) y **valoración** (Precio por participación + Fecha, muchas por fondo) — dos historiales independientes dentro del mismo fondo.
2. La unicidad de un fondo (Banco Custodia + Fondo) se valida en el servicio (409), no con una constraint SQL — mismo criterio que `stocks`/`bankAccounts`.
3. Los campos `shareCount`/`purchasePrice` reutilizan literalmente los mismos nombres, tipos (`numeric(18,8)`) y decoradores de validación (`IsShareCount`/`IsSharePrice`) que `stockPurchases` — no se crean decoradores nuevos: la regla de negocio (una cantidad positiva, con hasta 8 decimales) es idéntica para acciones y fondos, solo cambia el rótulo mostrado al usuario ("participaciones" en vez de "acciones" en las etiquetas del formulario). `pricePerShare` de una valoración **no** sigue este criterio de "idéntico a acciones" — ver revisión §4.
4. Sin migración de datos: a diferencia de spec 020 (que migraba `stock_entries` de spec 018), Fondos Inversión no tenía ningún modelo de datos previo — la migración (`0016_add_funds_purchases_valuations.sql`) es un `CREATE TABLE` puro para las tres tablas nuevas.
5. `wealth.calculations.ts` (backend) y sus equivalentes en `WealthPage.tsx` (frontend) — `purchaseValue`, `totalShares`, `totalCost`, `currentValue` — no se duplican para fondos: ya eran genéricos sobre `{ shareCount, purchasePrice }`, así que se reutilizan tal cual para `fundPurchases`/`fundValuations`.

## 4. Revisión: 8 decimales en el precio por participación de una valoración (H3 criterio 1)

Tras la implementación inicial (con `fundValuations.pricePerShare` a 2 decimales, igual que `stockValuations.pricePerShare`), Diego pidió que la valoración de un fondo admitiera también hasta 8 decimales — mismo criterio de precisión que el historial de compras (`fundPurchases`), para valores liquidativos muy fraccionados. A diferencia de la decisión 3 (arriba), esta es una divergencia deliberada frente a Acciones: la valoración de una acción (spec 020, `stockValuations.pricePerShare`) se queda en 2 decimales sin cambios.

- `fund_valuations.price_per_share`: `numeric(12,2)` → `numeric(18,8)` — migración `0017_widen_fund_valuations_price_per_share.sql`, `ALTER COLUMN ... SET DATA TYPE numeric(18,8)` puro, mismo criterio que la migración `0015` de spec 020 (ensanchar precisión de un `numeric` ya existente no trunca ni reescribe los valores guardados).
- `CreateFundValuationDto`/`UpdateFundValuationDto`: `pricePerShare` pasa de `@IsMoneyAmount()` a `@IsSharePrice()`, con un mensaje de error propio (el mensaje por defecto de `IsSharePrice` habla de "precio de compra", que no aplica a una valoración) — no se crea un decorador nuevo solo por el texto del mensaje: la regla (positivo, hasta 8 decimales) es idéntica a `IsSharePrice`, y el decorador ya admite `ValidationOptions` para sobrescribir el mensaje por sitio de uso.
- `wealth.calculations.ts`/`WealthPage.tsx`: sin cambios — `currentValue(pricePerShare, shareCount)` ya usa `Decimal` (backend) o `parseFloat` (frontend) sin asumir una escala fija de entrada, y sigue redondeando el valor total resultante a 2 decimales (es un importe en euros, no un precio por participación).

