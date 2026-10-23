# Spec 048 — Tickets y facturas: documento original, cualquier comercio y enlace con el movimiento

**Estado:** Pendiente de aprobación
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego ("gestión de recibos"). Lo básico de los tickets ya existe (specs 034, 035 y 040); esta spec cubre los huecos que la 034 dejó explícitamente fuera de alcance. La parte de recibos recurrentes se separó a la **spec 049**, que se implementa primero (decisión de Diego).

## 0. Qué cambia respecto a lo que ya existe

| Hoy | Con esta spec |
|---|---|
| La foto del ticket se descarta tras el OCR (spec 034 §4 decisión 4). | Se guarda el documento original (foto o PDF) y se puede volver a ver. **Revierte esa decisión.** |
| Solo tickets de supermercado (spec 034 §3). | Cualquier ticket o factura (otros comercios, suministros…). **Revierte ese punto de §3.** |
| Un ticket no tiene relación con el gasto real (spec 034 §3). | Un ticket se puede enlazar con su movimiento. |

## 1. Historias de usuario

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
- Criterio 6: enlazar no crea ni modifica ningún movimiento (ver §3, decisión pendiente).

## 2. Fuera de alcance

- **Leer el detalle de consumo de una factura** (kWh, m³, periodos de facturación) — de una factura solo se reconoce fecha, comercio y total (H2 criterio 1).
- **Adjuntar documentos a un movimiento directamente**, sin pasar por un ticket — un justificante siempre es un ticket (H2 permite tickets sin líneas), que luego se enlaza (H3).
- **Enlazar automáticamente** un ticket con su movimiento — siempre lo elige Diego (H3 criterio 1).

## 3. Decisión pendiente con Diego (antes de aprobar)

1. **¿Crear un movimiento desde un ticket cuando no hay candidato (H3)?** *Propuesta:* no, por el mismo motivo que spec 034 §3: el gasto acabará llegando por la importación y se duplicaría.

---
**Siguiente paso:** cerrar la decisión de §3 y aprobar la spec. Se implementa después de la spec 049.
