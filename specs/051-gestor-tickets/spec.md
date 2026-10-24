# Spec 051 — Gestor de tickets: etiquetas, buscador, notas, garantías y galería

**Estado:** Pendiente de aprobación
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego ("un gestor de tickets: poder poner etiquetas, un buscador…"). Construye sobre las specs 034, 035, 040 y 048 (tickets y facturas con su documento original).

## 0. Qué cambia respecto a lo que ya existe

| Hoy | Con esta spec |
|---|---|
| El historial (`/tickets`) solo filtra por comercio, producto, fechas e importe (spec 040). | Además, un buscador de texto y un filtro por etiquetas. |
| El texto que reconoce el OCR se usa para rellenar el ticket y se descarta. | Se guarda junto al documento, para poder buscar en él. |
| Un ticket no tiene etiquetas, notas ni garantía. | Etiquetas libres, una nota y una fecha de fin de garantía con aviso. |
| El historial es una lista. | También se puede ver como galería de documentos. |

## 1. Historias de usuario

**H1 — Etiquetas**

Como usuario quiero poner etiquetas a mis tickets ("garantía", "trabajo", "regalo", "deducible"…) para agruparlos y encontrarlos.

- Criterio 1: un ticket puede tener varias etiquetas. Se añaden desde el detalle del ticket, eligiendo una existente o escribiendo una nueva, que se crea al momento.
- Criterio 2: cada etiqueta tiene un nombre y, opcionalmente, un color de una paleta fija. No puede haber dos etiquetas con el mismo nombre (sin distinguir mayúsculas ni tildes).
- Criterio 3: en una pantalla de etiquetas se puede renombrar, cambiar el color y borrar cada una, y ver cuántos tickets la usan. Borrar una etiqueta la quita de todos sus tickets, sin borrar ningún ticket, con confirmación.
- Criterio 4: el historial y la galería muestran las etiquetas de cada ticket, y se pueden filtrar por una o varias (tickets que tengan todas las elegidas).
- Criterio 5: también se pueden poner etiquetas al revisar un ticket importado, antes de guardarlo.

**H2 — Buscador**

Como usuario quiero escribir algo ("lavadora", "Leroy", "número de serie") y encontrar el ticket, sin acordarme de la fecha ni del comercio.

- Criterio 1: una caja de búsqueda en el historial busca en el comercio, las etiquetas, la nota, las descripciones de las líneas, los productos enlazados y el texto del documento.
- Criterio 2: no distingue mayúsculas ni tildes, y encuentra palabras a medias ("lavad" encuentra "LAVADORA").
- Criterio 3: se combina con los filtros que ya existen (comercio, producto, fechas, importe) y con el de etiquetas.
- Criterio 4: cada resultado indica dónde ha coincidido (por ejemplo "en el documento: …lavadora Bosch serie 6…"), con el fragmento de texto, cuando no es evidente por lo que ya se ve del ticket.
- Criterio 5: la búsqueda responde rápido con varios miles de tickets, también en la Raspberry Pi.

**H3 — Texto del documento**

- Criterio 1: al importar un ticket, el texto reconocido por el OCR se guarda junto a su documento.
- Criterio 2: al adjuntar o sustituir el documento de un ticket guardado (spec 048 H1 criterio 3), se reconoce su texto y se guarda, sin cambiar ningún dato del ticket.
- Criterio 3: un ticket con documento pero sin texto (todos los anteriores a esta spec) ofrece "Leer el texto del documento" en su detalle. No se hace en bloque para todos los antiguos, porque cada lectura es una llamada de pago a Google Cloud Vision.
- Criterio 4: si el reconocimiento no está configurado o falla, el documento se guarda igual, sin texto, y se avisa.
- Criterio 5: el texto se puede ver desde el detalle del ticket (desplegable), para comprobar qué se ha leído.

**H4 — Notas**

- Criterio 1: cada ticket tiene una nota de texto libre (número de serie, para qué fue la compra…), que se edita desde su detalle y al revisar un ticket importado.
- Criterio 2: la nota se ve en el detalle, y en el historial y la galería se indica que el ticket tiene nota.

**H5 — Garantías**

Como usuario quiero saber hasta cuándo tengo garantía de una compra y que la app me avise antes de que caduque.

- Criterio 1: un ticket puede tener una fecha de fin de garantía. Para rellenarla rápido se ofrecen atajos desde la fecha del ticket (2 años, 3 años) además de elegir una fecha.
- Criterio 2: el historial permite filtrar por "con garantía vigente" y "garantía que caduca en los próximos 30 días", y muestra la fecha en cada ticket que la tenga.
- Criterio 3: la app envía un email 30 días antes de que caduque una garantía, con el comercio, la fecha del ticket, la nota y un enlace al ticket. Un aviso por ticket y garantía; si se cambia la fecha, se vuelve a avisar respecto a la nueva.
- Criterio 4: los avisos de garantía se pueden desactivar desde el perfil, igual que los de recibos recurrentes (spec 049).

**H6 — Galería**

- Criterio 1: el historial se puede ver como lista (como hoy) o como galería de miniaturas de los documentos. La elección se recuerda en el dispositivo.
- Criterio 2: en la galería, cada tarjeta muestra la miniatura (o un icono para PDF y para tickets sin documento), el comercio, la fecha, el total, las etiquetas y los indicadores de nota y garantía. Pulsarla abre el detalle.
- Criterio 3: la galería usa los mismos filtros y el mismo buscador que la lista.
- Criterio 4: carga rápido en el móvil: no descarga los documentos completos para las miniaturas.

**H7 — Datos del usuario**

- Criterio 1: etiquetas, notas, garantías y textos de los documentos se incluyen en la exportación de datos (spec 032, `.zip` de la spec 048) y se importan con la comprobación de propiedad de la spec 050.
- Criterio 2: se borran con la cuenta (spec 001 H8).
- Criterio 3: están aislados por usuario, con tests de autorización (constitución §2).

## 2. Fuera de alcance

- **Archivar tickets** (se planteó y Diego no lo eligió).
- **Leer en bloque el texto de todos los tickets antiguos** (H3 criterio 3): solo uno a uno, a petición.
- **Miniatura de la primera página de los PDF**: en la galería, un PDF se muestra con un icono.
- **Garantía por producto o por línea**: la garantía es del ticket entero.
- **Etiquetas en movimientos u otras partes de la app**: solo en tickets.

## 3. Decisiones tomadas con Diego

1. Etiquetas libres, varias por ticket, creadas al vuelo (respuesta a la pregunta de etiquetas).
2. El buscador mira también el texto del documento; los tickets antiguos solo si se vuelve a leer su texto (respuesta a la pregunta del buscador).
3. Se incluyen notas, garantías con aviso y galería; archivar, no.

## 4. Propuestas pendientes de confirmar

- **Aviso de garantía:** 30 días antes, un solo aviso (H5 criterio 3). ¿Te vale, o prefieres elegir los días o recibir también un aviso el último día?
- **Adjuntar o sustituir un documento lee su texto automáticamente** (H3 criterio 2), con su llamada a Vision. ¿Te parece bien, o prefieres que sea a petición, como en los tickets antiguos?

---
**Siguiente paso:** revisión de Diego y, si la aprueba, `plan.md`.
