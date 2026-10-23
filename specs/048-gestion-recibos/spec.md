# Spec 048 — Gestión de recibos: documentos de tickets y recibos recurrentes

**Estado:** Pendiente de aprobación
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego ("gestión de recibos", tanto tickets de compra como recibos recurrentes). Al revisar el repo se vio que lo básico de ambas cosas ya existe (specs 034/035/040 para tickets, spec 047 para recurrentes), así que esta spec cubre **solo los huecos que esas specs dejaron explícitamente fuera de alcance**. Diego eligió cubrirlos todos.

## 0. Qué cambia respecto a lo que ya existe

| Hoy | Con esta spec |
|---|---|
| La foto del ticket se descarta tras el OCR (spec 034 §4 decisión 4). | Se guarda el documento original (foto o PDF) y se puede volver a ver. **Revierte esa decisión.** |
| Solo tickets de supermercado (spec 034 §3). | Cualquier ticket o factura (otros comercios, suministros…). **Revierte ese punto de §3.** |
| Un ticket no tiene relación con el gasto real (spec 034 §3). | Un ticket se puede enlazar con su movimiento. |
| Las ocurrencias recurrentes no avisan de nada. | Aviso antes del vencimiento. |
| Las plantillas solo admiten importe fijo (spec 047, fuera de alcance). | Importe estimado para recibos variables (luz, agua…). |
| Confirmar una ocurrencia siempre crea un movimiento nuevo (spec 047 H3). | La ocurrencia se puede conciliar con el movimiento que ya trae la importación, sin duplicar. |

### Problema real detectado al escribir esta spec (motiva H6)

La importación desde Google Sheets se ejecuta sola cada 4 horas (`google-sheets-import.scheduler.ts`). Cuando Diego confirma una ocurrencia de un recibo domiciliado, se crea un movimiento con la **fecha prevista y el concepto de la plantilla**. Cuando después llega el cargo real por la importación, normalmente con otra fecha (el banco carga uno o dos días antes o después) y otro concepto, la detección de duplicados de spec 012 (coincidencia exacta de fecha, categoría, concepto, comercio, forma de pago e importe) **no lo reconoce** y lo inserta como movimiento nuevo. El gasto queda contado dos veces. Esto puede estar pasando ya hoy con las plantillas que existan.

## 1. Historias de usuario

### Bloque A — Tickets y facturas

**H1 — Guardar el documento original de un ticket**

Como usuario quiero que la foto o el PDF del ticket se guarde junto con sus datos, para poder consultarlo después (garantías, devoluciones, comprobar una línea dudosa).

- Criterio 1: al confirmar un ticket importado, se guarda el documento subido junto con él. Formatos aceptados: imagen (JPG, PNG, HEIC) y PDF.
- Criterio 2: desde el detalle del ticket se puede ver el documento y descargarlo.
- Criterio 3: a un ticket guardado sin documento (todos los anteriores a esta spec) se le puede adjuntar uno después; también se puede sustituir o quitar el documento de un ticket existente.
- Criterio 4: borrar un ticket (spec 035 H1) borra también su documento. No pueden quedar documentos huérfanos.
- Criterio 5: los documentos están aislados por usuario, como el resto de datos (constitution §2, con test de autorización: un usuario nunca puede descargar el documento de otro).
- Criterio 6: los documentos se incluyen en la exportación de datos del usuario (spec 032) y se borran con la cuenta (spec 001 H8), por RGPD (constitution §2).
- Criterio 7: los documentos entran en la copia de seguridad diaria (`deploy/backup.sh`). Hoy solo se copia la base de datos.
- Criterio 8: hay un tamaño máximo por documento, y superarlo da un error claro antes de subir nada.

**H2 — Tickets y facturas de cualquier comercio**

Como usuario quiero poder guardar tickets y facturas que no son de supermercado (una tienda de electrónica, una farmacia, la factura de la luz), con el mismo flujo de foto, revisión y guardado.

- Criterio 1: al importar, el reconocimiento intenta leer al menos la fecha, el comercio y el total, sea del tipo que sea el documento.
- Criterio 2: el desglose por líneas es opcional. Un ticket o factura puede guardarse solo con fecha, comercio y total, sin ninguna línea.
- Criterio 3: el catálogo "supermercado" pasa a ser un catálogo de "comercios". Los supermercados existentes siguen ahí y la comparativa de precios (spec 034 H4) sigue funcionando igual.
- Criterio 4: las líneas de un ticket que no es de supermercado solo entran en la comparativa de precios si Diego las empareja con un producto (spec 034 H4 criterio 1); si no, no aparecen en ella.
- Criterio 5: el historial de tickets (`/tickets`) muestra todos, y el filtro por comercio (spec 040, antes "supermercado") sigue funcionando sobre el catálogo ampliado.

**H3 — Enlazar un ticket con su movimiento**

Como usuario quiero enlazar un ticket con el movimiento (gasto) que le corresponde, para tener el justificante a mano desde el gasto y saber qué gastos tienen ticket.

- Criterio 1: desde el detalle de un ticket, la app sugiere movimientos candidatos: gastos del mismo importe que el total del ticket, con fecha cercana a la del ticket, ordenados por parecido de comercio. Diego elige uno o ninguno; nunca se enlaza solo.
- Criterio 2: también se puede buscar y elegir un movimiento a mano si no aparece entre los candidatos.
- Criterio 3: un ticket se enlaza como mucho con un movimiento, y un movimiento como mucho con un ticket.
- Criterio 4: en el listado de movimientos y en su edición se ve que el movimiento tiene un ticket enlazado, y se puede abrir desde ahí.
- Criterio 5: borrar el ticket o el movimiento deshace el enlace, pero no borra el otro.
- Criterio 6: enlazar no crea ni modifica ningún movimiento. Sigue sin crearse un gasto a partir de un ticket (spec 034 §3); ver decisión pendiente 5.

### Bloque B — Recibos recurrentes

**H4 — Aviso antes del vencimiento de un recibo**

Como usuario quiero recibir un aviso unos días antes de que venza un recibo recurrente, para tener saldo en la cuenta y que no me pille por sorpresa.

- Criterio 1: en cada plantilla (spec 047 H1) se puede activar un aviso y elegir con cuántos días de antelación (de 0 a 7).
- Criterio 2: el aviso solo se envía para ocurrencias **pendientes**. No se envía para plantillas pausadas ni para ocurrencias ya confirmadas, omitidas o conciliadas (H6).
- Criterio 3: cada ocurrencia avisa una sola vez. Si en un mismo día vencen varios recibos con aviso, se agrupan en un único aviso.
- Criterio 4: en Inicio aparece una sección "Próximos recibos" con las ocurrencias que vencen en los próximos 7 días y las vencidas sin resolver, aunque no tengan el aviso activado.
- Criterio 5: el canal del aviso se fija en la decisión pendiente 2.

**H5 — Recibos de importe variable**

Como usuario quiero que los recibos que cambian cada mes (luz, agua, gas) aparezcan como previstos con un importe estimado, en vez de tener que poner un importe fijo que nunca acierta.

- Criterio 1: una plantilla puede marcarse como "importe variable".
- Criterio 2: el importe estimado de una plantilla variable es la media de los importes de sus últimas ocurrencias confirmadas o conciliadas (ver decisión pendiente 4). Si todavía no hay ninguna, se usa el importe que Diego puso en la plantilla.
- Criterio 3: las ocurrencias variables previstas muestran el importe como estimado (p. ej. "≈ 64,20 €"), distinguible a simple vista de uno fijo, en Recurrentes y en el calendario.
- Criterio 4: al confirmar una ocurrencia variable, el importe viene relleno con la estimación pero se pide revisarlo (spec 047 H3 ya permite ajustar el importe; aquí pasa a ser el paso esperado).
- Criterio 5: las ocurrencias previstas, estimadas o no, siguen sin contar en totales, dashboard, objetivos ni resumen (spec 047 H2, sin cambios).
- Criterio 6: el cálculo de la estimación es una función pura con test unitario (constitution §2).

**H6 — Conciliar recibos con los movimientos importados**

Como usuario quiero que, cuando la importación trae el cargo real de un recibo, la app lo reconozca como la ocurrencia prevista en vez de dejarme dos movimientos para el mismo recibo.

- Criterio 1: al importar (Excel o Google Sheets, también la importación automática), un movimiento importado es **candidato** a una ocurrencia pendiente o vencida si coinciden el tipo y la categoría, la fecha está dentro de una ventana alrededor de la fecha prevista y el importe es igual (plantilla fija) o está dentro de un margen de la estimación (plantilla variable). La ventana y el margen se fijan en `plan.md`.
- Criterio 2: conciliar marca la ocurrencia como **conciliada** con ese movimiento: no se crea ningún movimiento nuevo y la ocurrencia deja de estar pendiente. Si el importe real es distinto del previsto, manda el real.
- Criterio 3: si para una ocurrencia hay más de un candidato, o un movimiento encaja con más de una ocurrencia, no se concilia automáticamente; se deja como sugerencia para que Diego elija.
- Criterio 4: además de la conciliación al importar, desde una ocurrencia pendiente se puede elegir "Vincular a un movimiento existente" en vez de "Confirmar", buscando entre los movimientos cercanos.
- Criterio 5: si una ocurrencia ya estaba **confirmada** (movimiento creado por la app) y llega por importación el cargo real que le corresponde, la app avisa de un posible duplicado y ofrece quedarse con el movimiento importado y borrar el creado al confirmar. Nunca borra nada sin que Diego lo acepte.
- Criterio 6: para limpiar lo que ya pueda haber hoy (ver §0), hay una revisión única de duplicados entre movimientos creados al confirmar ocurrencias y movimientos importados, con el mismo criterio que el 5.
- Criterio 7: deshacer una conciliación devuelve la ocurrencia a pendiente sin borrar el movimiento importado.
- Criterio 8: todo sigue aislado por usuario (spec 047 H5), con tests de autorización.

## 2. Fuera de alcance

- **Leer el detalle de consumo de una factura** (kWh, m³, periodos de facturación) — de una factura solo se reconoce fecha, comercio y total (H2 criterio 1).
- **Adjuntar documentos a un movimiento directamente**, sin pasar por un ticket — un justificante siempre es un ticket (H2 permite tickets sin líneas), que luego se enlaza (H3).
- **Conexión directa con el banco** para detectar cargos — la conciliación (H6) trabaja sobre lo que ya entra por la importación de Excel/Google Sheets.
- **Crear movimientos solos a partir de recurrentes** — sigue siendo manual (spec 047), con la conciliación de H6 como alternativa a confirmar.
- **Nuevas frecuencias** (semanal, diaria, personalizada) — siguen fuera, igual que en spec 047.
- **Notificaciones push en el móvil** — salvo que se elija como canal en la decisión pendiente 2.
- **Recibos recurrentes sin conexión** — siguen requiriendo conexión, igual que en spec 047.

## 3. Decisiones pendientes con Diego (antes de aprobar)

Hay una propuesta para cada una, pero ninguna está cerrada.

1. **¿Una spec o dos?** Los bloques A y B no dependen entre sí. *Propuesta:* dividir en 048 (tickets: H1–H3) y 049 (recibos recurrentes: H4–H6), y empezar por la 049, porque H6 corrige un problema que puede estar duplicando gastos ya hoy.
2. **Canal de los avisos (H4).** *Propuesta:* email (ya existe `MailService`) más la sección "Próximos recibos" en Inicio. Las notificaciones push quedan fuera.
3. **Conciliación (H6): ¿automática o siempre sugerida?** *Propuesta:* automática cuando hay un único candidato claro y sugerida en el resto de casos (criterio 3). Siempre sugerida es más segura, pero con la importación automática cada 4 horas generaría muchas revisiones manuales.
4. **Estimación de importes variables (H5).** *Propuesta:* media de las últimas 3 ocurrencias resueltas. Alternativa: el mismo mes del año anterior, que recoge mejor la estacionalidad de la luz o el gas, pero necesita un año de historial.
5. **¿Crear un movimiento desde un ticket cuando no hay candidato (H3)?** *Propuesta:* no, por el mismo motivo que spec 034 §3: el gasto acabará llegando por la importación y se duplicaría.

---
**Siguiente paso:** cerrar las decisiones de §3, aprobar la spec (o las dos specs, si se divide) y escribir `plan.md`.
