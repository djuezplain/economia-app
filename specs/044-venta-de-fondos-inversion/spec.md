# Spec 044 — Venta de fondos de inversión, con historial y ganancia/pérdida realizada

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** spec 031 (venta de acciones) — misma lógica, aplicada a Fondos Inversión en vez de Acciones (decisión explícita de Diego al pedir esta spec).

## 0. Qué cambia

Spec 031 añadió la venta de acciones (historial de ventas, ganancia/pérdida por FIFO, número de acciones y coste reflejando lo que queda en cartera) dejando explícitamente fuera de alcance "Fondos Inversión, Cripto, o cualquier otra categoría... queda para una spec futura si se decide". Esta spec extiende esa misma funcionalidad a Fondos Inversión, sin tocar Acciones ni el resto de categorías: dentro de cada fondo, un **tercer historial** ("Ventas"), junto a compras y valoraciones (y dividendos, ya existentes desde spec 029). Vender reduce las participaciones que quedan en cartera, así que esta spec también ajusta lo que ya se mostraba como "número de participaciones"/"coste total"/% de ganancia-pérdida de un fondo (spec 021 H2/H3) y los agregados que dependen de ellos (spec 028 H4/H5, spec 030) para que reflejen lo que **queda en cartera** tras las ventas, no el total histórico comprado — exactamente el mismo criterio que spec 031 ya aplicó a Acciones.

## 1. Historias de usuario

**H1 — Registrar cada venta de un fondo**

Como usuario quiero anotar, dentro de un fondo ya creado, cada venta que hago (cuándo, cuántas participaciones y a qué precio), para llevar el histórico de mis ventas y saber si gané o perdí en cada una.

- Criterio 1: cada venta tiene Número de participaciones vendidas, Precio de venta y Fecha, con el día de hoy por defecto — mismos campos y misma precisión (hasta 8 decimales en cantidad y precio) que una compra de fondo (spec 021 H2 criterio 1), igual que ya aplica spec 031 a las ventas de acciones.
- Criterio 2: no se puede vender más participaciones de las que quedan en cartera en ese fondo (total comprado − total ya vendido, sin tener en cuenta la fecha de la venta) — se avisa con un error claro (400) y la venta no se guarda.
- Criterio 3: un fondo puede tener cualquier número de ventas.
- Criterio 4: cada venta se puede editar o eliminar, sin afectar a las demás ni al fondo — mismo criterio de edición/borrado ya usado en compras/valoraciones/dividendos. Si al editar una venta (o al editar/eliminar una compra anterior) la cantidad vendida deja de caber en lo disponible, se avisa igual que en el criterio 2, sin guardar el cambio.
- Criterio 5: mismo aislamiento por usuario que el resto de la app.

**H2 — Ver la ganancia o pérdida de cada venta**

Como usuario quiero ver, junto a cada venta, cuánto gané o perdí en ella, para saber qué operaciones me han ido bien y cuáles no.

- Criterio 1: la ganancia/pérdida de una venta se calcula por **FIFO** (First In, First Out) — las participaciones vendidas se descuentan de las compras más antiguas de ese fondo primero, siguiendo el orden cronológico real de todos los movimientos (compras y ventas) del fondo, no solo el orden en que se han introducido en la app. Mismo criterio exacto que spec 031 H2 criterio 1.
- Criterio 2: Ganancia/pérdida de una venta = (Precio de venta × Nº vendido) − coste de las participaciones concretas que esa venta consume según FIFO. Se muestra en euros, calculada, nunca guardada.
- Criterio 3: cada venta del historial muestra su ganancia/pérdida en verde o rojo según el signo, igual que el resto de indicadores de ganancia/pérdida ya existentes.
- Criterio 4: el fondo muestra, además, el total de ganancia/pérdida **realizada** (suma de todas sus ventas) — calculado, nunca guardado.
- Criterio 5: fuera de esta spec cualquier cálculo de impuestos o retención sobre la ganancia de una venta — mismo criterio que spec 031 (acciones) y spec 029 (dividendos).

**H3 — El número de participaciones y el coste de un fondo reflejan lo que queda en cartera**

Como usuario quiero que, en cuanto vendo parte de un fondo, el número de participaciones y el coste que se muestran en su tarjeta bajen para reflejar solo lo que todavía tengo, no lo que he comprado alguna vez.

- Criterio 1: "Número de participaciones" (spec 021 H2 criterio 4) pasa a ser el número **en cartera** — total comprado menos total vendido — no el total histórico comprado.
- Criterio 2: "Coste total" pasa a ser el coste de las participaciones que quedan en cartera según FIFO (el coste de las ya vendidas no cuenta, viaja con H2 a su ganancia/pérdida realizada) — no la suma de todas las compras históricas.
- Criterio 3: el valor actual del fondo y el % de ganancia/pérdida ya existentes no cambian de fórmula, pero ahora parten del número de participaciones y coste **en cartera** (criterios 1/2) — siguen siendo la ganancia/pérdida **no realizada**; no incluyen la ganancia/pérdida ya realizada de H2. Esto incluye la versión "con dividendos" de spec 030 (H1/H2 de esa spec), que ya aplica a Fondos Inversión.
- Criterio 4: si se vende todo el fondo (0 participaciones en cartera), el fondo sigue existiendo (con su historial completo de compras/ventas/valoraciones/dividendos) pero no muestra coste total, valor actual ni % de ganancia/pérdida no realizada — mismo criterio que "sin ninguna compra" ya existente.
- Criterio 5: los agregados que ya usan "número de participaciones"/"coste total" de un fondo — tarjeta "Total" y "Composición actual" (spec 018/021), "Aportado vs. valor actual" y "Rentabilidad por categoría" (spec 028 H4/H5), y las rentabilidades con/sin dividendos (spec 030) — pasan a usar automáticamente los valores en cartera (criterios 1-3), sin necesidad de ningún cambio de comportamiento adicional en esas historias.

## 2. Fuera de alcance

- Acciones (ya tiene venta desde spec 031, sin cambios aquí), Cripto, o cualquier otra categoría — solo Fondos Inversión, tal como se ha pedido. Vender cripto queda para una spec futura si se decide.
- Cálculo de impuestos estimados o retención sobre la ganancia de una venta — mismo criterio que spec 031/029.
- Compensación de pérdidas y ganancias entre operaciones del mismo ejercicio fiscal — fuera de alcance, mismo criterio que spec 031.
- Un único "% de rentabilidad total" que combine ganancia realizada (H2) y no realizada (H3 criterio 3) en una sola cifra — se muestran por separado, mismo criterio que spec 031.
- Venta en corto (vender más participaciones de las que se tienen) — H1 criterio 2 lo impide explícitamente.
- Deshacer o vincular una venta a una compra concreta manualmente (FIFO es automático) — mismo criterio que spec 031.
- Cualquier cambio a "Historial de dividendos" (spec 029) de un fondo — los dividendos no dependen de cuántas participaciones queden en cartera, siguen exactamente igual.

## 3. Decisiones tomadas directamente con Diego

1. **Misma lógica que la venta de acciones (spec 031), sin variaciones** — mismo modelo de datos, misma validación, mismo cálculo FIFO, mismos criterios de alcance. Es la premisa explícita con la que se ha pedido esta spec.
2. **Método de coste: FIFO** — igual que spec 031.
3. **Sin cálculo de impuestos** — igual que spec 031/029.
4. **Se impide vender más participaciones de las que quedan en cartera** — validado en el backend al crear o editar una venta (también al editar/eliminar una compra que deje una venta existente sin cobertura).
