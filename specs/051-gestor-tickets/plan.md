# Plan — Spec 051 (gestor de tickets: etiquetas, buscador, notas, garantías y galería)

**Fase:** 2 de 4 (aprobado)
**Parte de:** spec 051 aprobada. Construye sobre `groceries` (tickets y documentos, specs 034/035/040/048), `receipt-import` (OCR con Vision), los avisos por email de la spec 049 (`RecurringRemindersService`) y la exportación e importación de las specs 032, 048 y 050.

## 0. Decisiones de diseño

1. **Búsqueda en PostgreSQL, sin motor aparte.** Extensiones `unaccent` y `pg_trgm` (las dos vienen con la imagen `postgres:16` y son *trusted*, así que el usuario dueño de la base de datos puede crearlas). Una función `immutable_unaccent(text)` (envoltorio `IMMUTABLE` de `unaccent`, el truco habitual para poder indexarla) normaliza en la consulta y en los índices. Se busca con `LIKE '%término%'` sobre el texto normalizado, que encuentra palabras a medias (H2 criterio 2); los índices GIN de trigramas lo aceleran en los textos largos (texto del documento y nota). Los nombres (comercio, etiqueta, producto, líneas) son cortos y no necesitan índice. Con varias palabras, cada una tiene que aparecer en algún campo del ticket (Y entre palabras, O entre campos).
2. **El texto del OCR se guarda en el documento** (`receipt_documents.ocr_text`), no en el ticket: es el texto *de ese documento*, y al sustituirlo cambia con él. `ocr_read_at` distingue "leído, sin texto" de "nunca leído" (H3 criterio 3).
3. **Miniaturas en el servidor con `sharp`** (dependencia nueva). Se generan al guardar el documento (imágenes; los PDF no tienen miniatura, H6) y se guardan en `receipt_documents.thumbnail` (unos 20–40 KB, 480 px de lado largo, JPEG). Los documentos anteriores a esta spec la generan la primera vez que se piden y la guardan. Alternativa descartada: generarla en el navegador al subir, porque no cubre los documentos ya guardados ni los HEIC (que el navegador no sabe abrir). `sharp` trae binarios para `linux/arm64`; se comprueba en la Raspberry Pi emulada como las dependencias de la 048 (T0.2).
4. **Etiquetas como catálogo propio por usuario** (`receipt_tags`) con tabla de enlace (`receipt_tag_links`), no una lista de texto en el ticket: renombrar o borrar una etiqueta (H1 criterio 3) es una sola fila, y el nombre único por usuario lo garantiza un índice.
5. **Colores de una paleta fija** de 8 claves (`gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`), no hexadecimales libres: se ven bien en tema claro y oscuro con los tokens de la app.
6. **Avisos de garantía con el mismo mecanismo que los de recibos** (spec 049): un barrido diario a las 8:00 de Madrid, una tabla de avisos enviados para no repetir, interruptor en el perfil y el `MailService` existente.

## 1. Modelo de datos (migración `0034_receipt_manager`)

- `CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;` y la función `immutable_unaccent(text)`.
- **`receipts`** (columnas nuevas): `note text` (nullable, hasta 2000 caracteres, validado en el DTO), `warranty_until date` (nullable), índice GIN de trigramas sobre `immutable_unaccent(lower(note))`, e índice sobre `(user_id, warranty_until)`.
- **`receipt_documents`** (columnas nuevas): `ocr_text text`, `ocr_read_at timestamptz`, `thumbnail bytea` (todas nullable), e índice GIN de trigramas sobre `immutable_unaccent(lower(ocr_text))`.
- **`receipt_tags`** (nueva): `id`, `user_id` (FK `users`, cascade), `name varchar(40)`, `color varchar(10)` (nullable, una de las 8 claves; `CHECK`), `created_at`. Índice único `(user_id, immutable_unaccent(lower(name)))` (H1 criterio 2).
- **`receipt_tag_links`** (nueva): `receipt_id` (FK cascade), `tag_id` (FK cascade), PK `(receipt_id, tag_id)`, índice sobre `tag_id`.
- **`warranty_reminders_sent`** (nueva): `receipt_id` (FK cascade), `warranty_until date`, `sent_at`; PK `(receipt_id, warranty_until)`. Si cambia la fecha, la nueva no está y se vuelve a avisar (H5 criterio 3).
- **`users`**: `warranty_reminder_emails boolean not null default true` (H5 criterio 4).

Todo cuelga de `users` en cascada (directamente o a través de `receipts`): el borrado de cuenta no necesita código (H7 criterio 2), solo su test.

## 2. Funciones puras (tests primero)

- `normalizeSearch(text)`: minúsculas y sin tildes (NFD sin marcas diacríticas), igual que `immutable_unaccent(lower())` para el español; `searchTerms(q)`: palabras de al menos 2 caracteres, como mucho 8, sin duplicados.
- `findSnippet(text, terms, radius = 40)`: el primer fragmento de `text` donde aparece algún término, con "…" a los lados, respetando las tildes del texto original (se busca en el normalizado y se recorta el original con las mismas posiciones; NFD sin marcas conserva la correspondencia carácter a carácter de las letras españolas).
- `warrantyShortcut(date, years)`: fecha + N años (el 29 de febrero pasa al 28).
- `warrantyStatus(warrantyUntil, today)`: `none` | `active` | `expiring` (≤ 30 días) | `expired`.
- `warrantyRemindersDue(rows, today)`: los tickets cuya garantía caduca exactamente dentro de 30 días o menos, que no se hayan avisado para esa fecha y que no hayan caducado.

## 3. Backend

### 3.1 Etiquetas (H1)

`ReceiptTagsService` y `ReceiptTagsController` en `groceries/`:
- `GET /receipt-tags`: las etiquetas del usuario con `receiptCount`.
- `POST /receipt-tags` `{ name, color? }`; `PATCH /receipt-tags/:id` `{ name?, color? }`; `DELETE /receipt-tags/:id`. Nombre repetido → 409 "Ya tienes una etiqueta con ese nombre."
- `PUT /receipts/:id/tags` `{ tagIds?: string[], newTags?: string[] }`: sustituye las etiquetas del ticket; `newTags` crea al vuelo (o reutiliza la existente con el mismo nombre normalizado). Etiqueta de otro usuario → 404.
- El listado y el detalle de tickets traen `tags: { id, name, color }[]`.
- `ConfirmImportReceiptDto` acepta `tagIds`, `newTags` y `note` (H1 criterio 5, H4 criterio 1), en la misma transacción que el ticket.

### 3.2 Notas y garantías (H4, H5)

- `PATCH /receipts/:id/details` `{ note?: string | null, warrantyUntil?: string | null }`. Se separa de `PUT /receipts/:id` (edición de la spec 035, que sustituye las líneas) para no tener que reenviar el ticket entero al cambiar una nota.
- `note` y `warrantyUntil` en el listado (`hasNote` en vez de la nota entera) y en el detalle.
- `WarrantyRemindersService.sendDueReminders(today)` + `WarrantyRemindersScheduler` (8:00 `Europe/Madrid`) + plantilla `warrantyReminderEmail` (escapando el HTML de la nota y del comercio). Un email por usuario con todas sus garantías que caducan, como los recibos. `warrantyReminderEmails` en `GET/PATCH /users/me`.

### 3.3 Texto del documento (H3)

- `ReceiptImportService.preview` ya obtiene el texto: se guarda en el documento pendiente (`storePending(…, ocrText)`), con `ocr_read_at`.
- `ReceiptDocumentsService.replace` (adjuntar y sustituir) llama al OCR tras guardar. Si falla o no está configurado, el documento se queda sin texto y la respuesta trae `ocrWarning` (H3 criterio 4); nunca falla la subida por el OCR.
- `POST /receipts/:id/document/text`: vuelve a leer el texto del documento actual (H3 criterio 3). 404 sin documento; 503 sin Vision configurado; 502 con un mensaje claro si Vision falla.
- `GET /receipts/:id/document/text`: el texto guardado (H3 criterio 5), aparte del detalle para no inflarlo.
- `document` en el listado y el detalle añade `hasText: boolean`.

### 3.4 Búsqueda y filtros (H2, H1 criterio 4, H5 criterio 2)

`ListReceiptsQueryDto` añade `q`, `tagIds` (lista; el ticket tiene todas) y `warranty` (`active` | `expiring`). En `ReceiptsService.list`:
- Los filtros de etiqueta y garantía van en SQL (`EXISTS` por etiqueta; comparación de fechas).
- `q`: un `EXISTS`/`OR` por término sobre el comercio, la nota, las etiquetas, las líneas (descripción y nombre del producto) y el texto del documento, todos con `immutable_unaccent(lower(...)) LIKE immutable_unaccent(lower($término))` y los comodines `%`/`_` del usuario escapados.
- Cada resultado trae `match: { field: 'merchant' | 'tag' | 'note' | 'line' | 'product' | 'document'; snippet: string | null }`: el primer campo en que coincide (en ese orden). Para `note` y `document`, el fragmento con `findSnippet` (H2 criterio 4); para el resto basta con lo que ya se ve en la tarjeta. Los textos para el fragmento se cargan solo para los tickets del resultado.

### 3.5 Miniaturas (H6)

- `GET /receipts/:id/document/thumbnail`: la miniatura JPEG (`Cache-Control: private, max-age=86400`, `nosniff`). Si falta y el documento es una imagen, se genera con `sharp`, se guarda y se devuelve. PDF o sin documento → 404 (el frontend muestra el icono).
- `ReceiptDocumentsService.prepare` genera la miniatura de las imágenes nuevas (después de convertir HEIC a JPEG). La redimensión va fuera del bucle de eventos: `sharp` ya trabaja en su propio hilo (libuv).

### 3.6 Exportación e importación (H7)

- `receiptTags` y `receiptTagLinks` como claves opcionales de `EconomicData`, tras `receipts`. `receipts` ya lleva `note` y `warrantyUntil` (las filas se exportan enteras). `ReceiptDocumentMeta` añade `ocrText` y `ocrReadAt` y excluye `thumbnail` (se regenera).
- Importación (spec 050):
  - `receiptTags` tiene fusión propia: si ya existe una etiqueta del usuario con el mismo nombre normalizado, se reutiliza (el `id` del fichero se traduce al existente) en vez de chocar con el índice único.
  - `receiptTagLinks` se importa si su ticket y su etiqueta son utilizables (`ImportContext`, con la traducción anterior).
  - `warranty_reminders_sent` no se exporta (igual que los avisos de la 049).

## 4. Frontend

- **`ReceiptsPage`** (historial):
  - Caja de búsqueda (con espera de 300 ms) y filtros de etiquetas (selección múltiple) y de garantía.
  - Conmutador Lista / Galería, recordado en `localStorage` (con `try/catch`).
  - Cada ticket muestra sus etiquetas (chips de color), 📝 si tiene nota, 🛡️ con la fecha si tiene garantía (resaltada si caduca pronto o ha caducado), y la línea "Coincide en …" con el fragmento cuando hay búsqueda.
- **Galería:** rejilla adaptable (2 columnas en móvil, 4–5 en escritorio). Las miniaturas se piden con `api.getBlob` solo cuando la tarjeta entra en pantalla (`IntersectionObserver`), y se liberan los `objectURL` al desmontar.
- **`ReceiptDetailPage`:** sección "Etiquetas" (chips y un campo con sugerencias que crea al pulsar Intro), "Nota" (textarea con guardar), "Garantía" (fecha, atajos "+2 años" y "+3 años", quitar) y, en "Documento", el desplegable "Texto del documento" o el botón "Leer el texto del documento".
- **Importación:** etiquetas y nota en `ReceiptFieldsEditor`, solo en modo importación.
- **`ReceiptTagsPage`** (`/tickets/etiquetas`, enlazada desde el historial): renombrar, color, borrar con confirmación y número de tickets.
- **Perfil:** interruptor "Avisos de garantía por email".
- **Copia de seguridad:** etiquetas en español de las dos tablas nuevas.

## 5. Casos límite

- **Búsqueda vacía o de un solo carácter:** se ignora (no filtra).
- **Comodines en la búsqueda** (`%`, `_`): se escapan; buscar "50%" busca ese texto.
- **Renombrar una etiqueta al nombre de otra:** 409, no se fusionan.
- **Ticket borrado:** se llevan sus enlaces de etiquetas y avisos enviados (cascada); las etiquetas quedan.
- **Sustituir el documento:** el texto y la miniatura son los del documento nuevo; si el OCR del nuevo falla, el ticket se queda sin texto (no conserva el del anterior).
- **Garantía ya caducada al ponerla:** se guarda (sirve de registro) y nunca se avisa.
- **Avisos de garantía con el usuario sin verificar o con los avisos desactivados:** no se envían, como en la 049.
- **Miniatura de una imagen que `sharp` no sabe abrir** (dañada): 404 y la galería muestra el icono; no se reintenta en cada carga (se marca guardando una miniatura vacía de 0 bytes, que el endpoint trata como "no hay").

## 6. Tests

- Unitarios: las funciones de §2 (con tildes, ñ, mayúsculas, palabras a medias, bordes del fragmento, 29 de febrero, bordes de los 30 días).
- e2e:
  - Etiquetas: CRUD, nombre repetido sin distinguir tildes (409), crear al vuelo, sustituir las de un ticket, borrar una etiqueta en uso, aislamiento (404) y en la confirmación de la importación.
  - Búsqueda: en cada campo, tildes, palabras a medias, varias palabras en campos distintos, comodines, combinada con los demás filtros, fragmento correcto y aislamiento (nunca encuentra tickets de otro usuario).
  - Filtros de etiquetas (todas) y de garantía.
  - Nota y garantía: guardar, quitar, validación de longitud.
  - Texto del documento: guardado al confirmar una importación (OCR simulado), al adjuntar y sustituir, fallo del OCR sin perder el documento, releer, 503 sin Vision.
  - Miniaturas: generada al subir, generada a demanda para un documento antiguo, PDF → 404, cabeceras, aislamiento.
  - Avisos de garantía: a 30 días, no repetir, volver a avisar si cambia la fecha, desactivados, caducada.
  - Exportación e importación: ida y vuelta con etiquetas, enlaces, notas, garantías y textos; etiqueta con el mismo nombre ya existente → se reutiliza; enlace a un ticket o etiqueta ajenos → omitido.
  - Borrado de cuenta con datos en todas las tablas nuevas.
- Frontend: buscador (espera y parámetros), filtros, conmutador recordado, galería (carga perezosa simulada), sección de etiquetas (crear al vuelo), nota, garantía (atajos), texto del documento, pantalla de etiquetas, interruptor del perfil.
- Revisión visual a 1280 y 375 px (historial en lista y galería, detalle, pantalla de etiquetas).

## 7. Dependencias nuevas

- Backend: `sharp` (miniaturas). Se comprueba `npm audit` y que funciona en `linux/arm64` antes de usarla.
- Frontend: ninguna.

## 8. Fuera de este plan (anotado, no se toca)

- Leer el texto de los tickets antiguos en bloque (spec §2).
- Miniatura de la primera página de los PDF (spec §2).
- Búsqueda por relevancia (orden por parecido): los resultados mantienen el orden del historial (fecha descendente).

## 9. Orden de implementación propuesto (para `tasks.md`)

1. `sharp` y su comprobación en `arm64`.
2. Migración `0034_receipt_manager`.
3. Funciones puras (§2).
4. Etiquetas: backend y frontend (detalle, pantalla de etiquetas, importación).
5. Notas y garantías: backend y frontend; avisos por email y perfil.
6. Texto del documento: guardado en importación, al adjuntar y sustituir, releer y verlo.
7. Búsqueda y filtros: backend y frontend.
8. Miniaturas y galería.
9. Exportación e importación; borrado de cuenta.
10. Cierre: tests, revisión visual, spec y checklist.
