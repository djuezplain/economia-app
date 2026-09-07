# Spec 031 — Venta de acciones, con historial y ganancia/pérdida realizada

**Estado:** Implementada (decidida y construida directamente con Diego en conversación)
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 020 dejó explícitamente fuera de alcance vender acciones ("el historial de compras es aditivo... queda para una spec futura si se decide"). Esta spec la añade: dentro de cada acción, un **tercer historial** ("Ventas"), junto a compras y valoraciones — **solo para Acciones**, no para Fondos Inversión ni el resto de categorías, tal como se ha pedido. Vender reduce las acciones que quedan en cartera, así que esta spec también ajusta lo que ya se mostraba como "número de acciones"/"coste total"/% de ganancia-pérdida de una acción (spec 020 H2/H3) y los agregados que dependen de ellos (spec 028 H4/H5, spec 030) para que reflejen lo que **queda en cartera** tras las ventas, no el total histórico comprado.

## 1. Historias de usuario

**H1 — Registrar cada venta de una acción**

Como usuario quiero anotar, dentro de una acción ya creada, cada venta que hago (cuándo, cuántas acciones y a qué precio), para llevar el histórico de mis ventas y saber si gané o perdí en cada una.

- Criterio 1: cada venta tiene Número de acciones vendidas, Precio de venta y Fecha, con el día de hoy por defecto — mismos campos y misma precisión (hasta 8 decimales en cantidad y precio) que una compra (spec 020 H2 criterio 1).
- Criterio 2: no se puede vender más acciones de las que quedan en cartera en esa posición (total comprado − total ya vendido, sin tener en cuenta la fecha de la venta) — se avisa con un error claro (400/409) y la venta no se guarda.
- Criterio 3: una acción puede tener cualquier número de ventas.
- Criterio 4: cada venta se puede editar o eliminar, sin afectar a las demás ni a la acción — mismo criterio de edición/borrado ya usado en compras/valoraciones/dividendos. Si al editar una venta (o al editar/eliminar una compra anterior) la cantidad vendida deja de caber en lo disponible, se avisa igual que en el criterio 2, sin guardar el cambio.
- Criterio 5: mismo aislamiento por usuario que el resto de la app.

**H2 — Ver la ganancia o pérdida de cada venta**

Como usuario quiero ver, junto a cada venta, cuánto gané o perdí en ella, para saber qué operaciones me han ido bien y cuáles no.

- Criterio 1: la ganancia/pérdida de una venta se calcula por **FIFO** (First In, First Out) — las acciones vendidas se descuentan de las compras más antiguas de esa posición primero, siguiendo el orden cronológico real de todos los movimientos (compras y ventas) de la acción, no solo el orden en que se han introducido en la app.
- Criterio 2: Ganancia/pérdida de una venta = (Precio de venta × Nº vendido) − coste de las acciones concretas que esa venta consume según FIFO. Se muestra en euros, calculada, nunca guardada — mismo criterio que el resto de importes derivados de Resumen Patrimonio.
- Criterio 3: cada venta del historial muestra su ganancia/pérdida en verde o rojo según el signo, igual que el resto de indicadores de ganancia/pérdida ya existentes.
- Criterio 4: la posición muestra, además, el total de ganancia/pérdida **realizada** (suma de todas sus ventas) — calculado, nunca guardado.
- Criterio 5: fuera de esta spec cualquier cálculo de impuestos o retención sobre la ganancia de una venta — decisión explícita (§3), como con los dividendos (spec 029), queda para una spec futura si se decide.

**H3 — El número de acciones y el coste de una posición reflejan lo que queda en cartera**

Como usuario quiero que, en cuanto vendo parte de una posición, el número de acciones y el coste que se muestran en su tarjeta bajen para reflejar solo lo que todavía tengo, no lo que he comprado alguna vez.

- Criterio 1: "Número de acciones" (spec 020 H2 criterio 4) pasa a ser el número **en cartera** — total comprado menos total vendido — no el total histórico comprado.
- Criterio 2: "Coste total" (spec 020 H2 criterio 4) pasa a ser el coste de las acciones que quedan en cartera según FIFO (el coste de las acciones ya vendidas no cuenta, viaja con H2 a su ganancia/pérdida realizada) — no la suma de todas las compras históricas.
- Criterio 3: el valor actual de la posición y el % de ganancia/pérdida ya existentes (spec 020 H3 criterio 1/6) no cambian de fórmula, pero ahora parten del número de acciones y coste **en cartera** (criterios 1/2) — siguen siendo la ganancia/pérdida **no realizada**, de lo que aún se posee; no incluyen la ganancia/pérdida ya realizada de H2.
- Criterio 4: si se vende toda la posición (0 acciones en cartera), la acción sigue existiendo (con su historial completo de compras/ventas/valoraciones/dividendos) pero no muestra coste total, valor actual ni % de ganancia/pérdida no realizada — mismo criterio que "sin ninguna compra" ya existente, ahora también alcanzable vendiendo.
- Criterio 5: los agregados que ya usan "número de acciones"/"coste total" de una posición — tarjeta "Total" y "Composición actual" (spec 018/020), "Aportado vs. valor actual" y "Rentabilidad por categoría" (spec 028 H4/H5), y las tres rentabilidades con/sin dividendos (spec 030) — pasan a usar automáticamente los valores en cartera (criterios 1-3), sin necesidad de ningún cambio de comportamiento adicional en esas historias: ya consumían "número de acciones"/"coste total" de la acción, que es justo lo que cambia de significado aquí.

## 2. Fuera de alcance

- Fondos Inversión, Cripto, o cualquier otra categoría — solo Acciones, tal como se ha pedido. Vender fondos/cripto queda para una spec futura si se decide.
- Cálculo de impuestos estimados o retención sobre la ganancia de una venta (RF-6.3 del documento de requisitos) — decisión explícita (§3), igual que ya se decidió para los dividendos (spec 029).
- Compensación de pérdidas y ganancias entre operaciones del mismo ejercicio fiscal (RF-6.4) — fuera de alcance, requiere el punto anterior primero.
- Un único "% de rentabilidad total" que combine ganancia realizada (H2) y no realizada (H3 criterio 3) en una sola cifra — se muestran por separado (un importe en euros para la realizada, un % para la no realizada, igual que hoy); combinarlas en un solo indicador queda para una spec futura si se decide.
- Venta en corto (vender más acciones de las que se tienen) — H1 criterio 2 lo impide explícitamente.
- Deshacer o vincular una venta a una compra concreta manualmente (FIFO es automático, sin poder elegir qué lote se vende) — decisión explícita (§3).
- Cualquier cambio a "Historial de dividendos" (spec 029) — los dividendos de una acción no dependen de cuántas acciones queden en cartera, siguen exactamente igual.

## 3. Decisiones tomadas directamente con Diego

1. **Método de coste: FIFO** — las ventas consumen primero las compras más antiguas, mismo criterio fiscal habitual en España para acciones y el que ya sugería el documento de requisitos original (RF-6.2).
2. **Sin cálculo de impuestos** — esta spec registra la venta y calcula su ganancia/pérdida bruta; impuestos estimados quedan fuera, mismo criterio que dividendos (spec 029).
3. **Se impide vender más acciones de las que quedan en cartera** — validado en el backend al crear o editar una venta (también al editar/eliminar una compra que deje una venta existente sin cobertura).
4. **FIFO se calcula por orden cronológico real de todos los movimientos (compras y ventas) de la posición**, no por el orden en que se han introducido en la app — es la interpretación correcta de "primero en entrar, primero en salir" y no añade complejidad real de implementación sobre alternativas más simples pero incorrectas.
