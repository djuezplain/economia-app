# Plan — Spec 048 (tickets y facturas: documento original, cualquier comercio y enlace con el movimiento)

**Fase:** 2 de 4 (aprobado)
**Parte de:** spec 048 aprobada. Construye sobre el modelo de las specs 034/035/040 (`backend/src/db/schema/groceries.schema.ts`, `backend/src/receipt-import/`, `backend/src/groceries/`) y sobre la exportación de la spec 032.

## 0. Decisiones de diseño

Las dos primeras las tomó Diego al preparar este plan. El resto son decisiones técnicas propias, con su motivo.

1. **La exportación de datos pasa a ser un `.zip` en todas partes** (descarga, exportación programada a carpeta y Google Drive): `datos.json`, con el mismo formato de hoy más las claves nuevas, y una carpeta `documentos/`. La importación acepta `.zip` y sigue aceptando los `.json` antiguos.
2. **La exportación incluye todo lo de tickets y listas de la compra.** Hoy no incluye nada de eso (comercios, productos, tickets, líneas, listas): era un hueco de la spec 032 frente al RGPD (constitution §2) que no se había detectado. Se cierra entero en esta spec, porque para exportar los documentos hay que exportar los tickets.
3. **Los documentos se guardan en PostgreSQL (`bytea`), en una tabla propia**, no en disco. Así entran solos en la copia diaria (`pg_dump`, H1 criterio 7), se borran en cascada con el ticket y con la cuenta (criterios 4 y 6) y no puede haber ficheros huérfanos ni a medio escribir. El precio es una base de datos más grande (ver §8). En tabla aparte, para que los listados de tickets nunca carguen los binarios.
4. **El documento se guarda en la vista previa, no se vuelve a subir al confirmar.** `POST /receipt-import/preview` guarda el documento como *pendiente* y devuelve su `id`; `confirm` lo asocia al ticket dentro de la misma transacción. Así no hay que subir dos veces la foto desde el móvil y ticket y documento se guardan juntos o no se guarda ninguno. Los pendientes que nadie confirma se borran a las 24 horas.
5. **Las tablas y la API siguen llamándose `supermarkets`/`supermarketId`.** El cambio a "comercio" (H2 criterio 3) es de concepto y de textos en pantalla. Renombrar tablas, columnas y campos de la API tocaría las specs 034, 035, 039, 040 y sus tests sin aportar nada al usuario.
6. **"Importe del ticket"** se define en un solo sitio (§2): la suma de las líneas si las hay; si no, el total impreso. Para los tickets que ya existen (todos tienen líneas) no cambia nada, así que el filtro por importe de la spec 040 se comporta igual.
7. **El servidor no se fía del tipo de fichero que dice el navegador**: lo deduce de los primeros bytes (§2). Solo se aceptan JPEG, PNG, WEBP, HEIC/HEIF y PDF.

## 1. Modelo de datos (Drizzle, migración `0033_receipt_documents_and_links`)

### `receipt_documents` (nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users` `ON DELETE CASCADE` | Aislamiento por usuario, también de los pendientes (que aún no tienen ticket). |
| `receipt_id` | `uuid` FK → `receipts` `ON DELETE CASCADE`, **nullable** | `null` = pendiente (subido en la vista previa, sin confirmar). Índice único parcial `WHERE receipt_id IS NOT NULL`: un documento por ticket. |
| `mime_type` | `varchar(50)` | El detectado (§2), no el declarado. |
| `size_bytes` | `integer` | |
| `sha256` | `char(64)` | Para verificar la integridad al importar un `.zip`. |
| `original_filename` | `varchar(255)` | Solo informativo (nombre al descargar). |
| `page_count` | `smallint` nullable | Solo PDF. |
| `content` | `bytea` | |
| `created_at` | `timestamptz` | |

Índice por (`user_id`, `receipt_id`).

### `receipts` (columna nueva)

- `transaction_id uuid` FK → `transactions` `ON DELETE SET NULL`, nullable, con índice único parcial `WHERE transaction_id IS NOT NULL`. Enlace ticket ↔ movimiento (H3): un ticket con como mucho un movimiento y un movimiento con como mucho un ticket (criterio 3); borrar el movimiento deshace el enlace sin borrar el ticket, y borrar el ticket se lleva el enlace sin tocar el movimiento (criterio 5).

### `receipt_lines` (cambio)

- `product_id` pasa a **nullable** (H2 criterio 4): una línea de una factura de farmacia puede guardarse sin emparejar con ningún producto, y entonces no entra en la comparativa. La comparativa, el detalle de producto y el simulador de cesta (spec 039) ya filtran por producto, así que una línea sin producto no aparece en ellos. Hay dos sitios que dan por hecho que siempre hay producto y hay que adaptar: `ProductsService` (agrupa las líneas por `productId` para las estadísticas del listado de productos, y una línea sin producto formaría un grupo `null`) y `ReceiptsService.getById` (busca el nombre del producto de cada línea).

## 2. Funciones puras (tests primero, constitution §2 y §4)

| Función | Dónde | Qué hace |
|---|---|---|
| `detectDocumentType(buffer)` | `receipt-import/document-type.ts` | Firma de los primeros bytes → `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf` o `null`. Tests con la cabecera real de cada formato, un SVG, un ZIP y un fichero vacío. |
| `receiptTotal(lines, printedTotal)` | `groceries/receipt-total.ts` | Suma de líneas si hay alguna; si no, `printedTotal`; si no hay ninguna de las dos, `null`. Con `decimal.js`. |
| `merchantSimilarity(a, b)` | `groceries/receipt-link.ts` | Parecido 0..1 entre el nombre del comercio y el comercio/concepto de un movimiento: tokens normalizados (`normalizeText`, ya existente), sin palabras de relleno (`S.A.`, `SL`, `SUPERMERCADOS`…), proporción de tokens en común. Tests: "MERCADONA, S.A." vs "MERCADONA VALENCIA" alto; vs "IBERDROLA" 0. |
| `rankLinkCandidates(receipt, movements)` | mismo fichero | Candidatos de H3 criterio 1: gastos con importe igual al total impreso **o** a la suma de líneas (el banco cobra lo pagado de verdad, que puede no coincidir con la suma de líneas si hay descuentos, o con el total si el OCR lo leyó mal), con fecha entre 2 días antes y 5 después de la del ticket (el cargo con tarjeta suele llegar el mismo día o unos días después). Orden: parecido de comercio, luego cercanía de fecha. |
| `detectDate` / `detectPrintedTotal` (cambios) | `receipt-import.parsing.ts` | Para facturas (H2 criterio 1). Fecha: además de `dd/mm/aaaa`, separadores `-` y `.`, años de 2 cifras y "15 de octubre de 2026". Total: se ignoran "subtotal", "base imponible" y las líneas de IVA. Los tests existentes con tickets reales de Mercadona y Lidl tienen que seguir pasando sin cambios. |

## 3. Backend

### 3.1 Documentos (H1)

- **`ReceiptDocumentsService`** (nuevo, `groceries/`):
  - `storePending(userId, buffer, filename)` → `{ id, mimeType, sizeBytes, pageCount }`. Detecta el tipo (§2; si no es uno de los admitidos, 400 "Solo se admiten fotos (JPEG, PNG, WEBP, HEIC) o PDF"). Si es HEIC, lo convierte a JPEG con `heic-convert` (JavaScript puro, sin binarios nativos: evita el problema de `sharp` en la Raspberry Pi que ya anotó la spec 034 T0.3) y guarda el JPEG. Calcula el SHA-256.
  - `attachPending(tx, userId, documentId, receiptId)`: dentro de la transacción de `confirm`, `UPDATE … SET receipt_id … WHERE id = ? AND user_id = ? AND receipt_id IS NULL`. Si no actualiza nada, 400 "El documento ya no está disponible; vuelve a subirlo".
  - `replace(userId, receiptId, buffer, filename)`: en una transacción, borra el anterior (si lo hay) e inserta el nuevo ya asociado.
  - `remove(userId, receiptId)` y `getContent(userId, receiptId)`.
  - `purgeStalePending()`: borra los pendientes con más de 24 horas. Lo llama `ReceiptDocumentsCleanupScheduler` (`@Cron`, una vez al día, a las 4:00 de Madrid, mismo patrón que los demás schedulers).
- **Endpoints** (`AuthGuard` + `RequireActiveUserGuard`; todo filtrado por `user_id`, 404 si el ticket es de otro usuario):

| Método y ruta | Uso |
|---|---|
| `GET /receipts/:id/document` | Devuelve el binario con su `Content-Type`, `Content-Disposition: inline` (o `attachment` con `?download=1`), `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`. 404 si el ticket no tiene documento. |
| `PUT /receipts/:id/document` | Multipart (`file`). Adjunta o sustituye (H1 criterio 3). |
| `DELETE /receipts/:id/document` | Quita el documento. 204. |

- **Tamaño máximo (H1 criterio 8):** 10 MB por documento, el mismo límite que ya tiene la importación de tickets. Lo comprueba primero el navegador, antes de subir nada (§4), y también el servidor. El error de `multer` por tamaño (413, mensaje en inglés) se traduce a un mensaje claro en español.
- **`GET /receipts` y `GET /receipts/:id`** añaden `document: { mimeType, sizeBytes, pageCount, originalFilename } | null`, sin el contenido.

### 3.2 Importación de tickets y facturas (H1 y H2)

- **`POST /receipt-import/preview`**: acepta JPEG, PNG, WEBP, HEIC y PDF (hoy solo JPEG y PNG). Guarda el documento pendiente (§3.1) y la respuesta añade `document: { id, mimeType, sizeBytes, pageCount }`. El documento se guarda aunque el OCR no reconozca nada: con la spec 048 se puede guardar un ticket sin líneas.
- **OCR de PDF**: `ReceiptOcrService.extractText` usa `v1/files:annotate` con el contenido en línea (`inputConfig.mimeType = application/pdf`), que es síncrono y procesa hasta 5 páginas sin pasar por Cloud Storage. El texto de cada página se reconstruye con la misma `reconstructRowText` de hoy y las páginas se unen en orden. Un PDF de más de 5 páginas se guarda igual, pero solo se leen las 5 primeras (aviso en `warnings`). **Riesgo:** en este entorno no hay clave de Vision. Se prueba con `fetch` simulado y con la forma de respuesta de la documentación; hace falta que Diego lo compruebe con un PDF real antes de cerrar (T3.3).
- **`POST /receipt-import/confirm`** (`ConfirmImportReceiptDto`, que extiende el DTO actual):
  - `documentId?: uuid` → `attachPending` dentro de la transacción.
  - `lines` deja de exigir al menos una (H2 criterio 2). **Sin líneas, el total impreso pasa a ser obligatorio** (400 si falta): es el único importe que tendría el ticket.
  - Cada línea acepta `product: null` (sin producto, H2 criterio 4).
- **`PUT /receipts/:id`** (spec 035): mismas reglas de líneas y total, pero sin `documentId`; el documento se gestiona con sus propios endpoints (§3.1).
- **Totales:** `ReceiptSummary` y `ReceiptDetail` añaden `total` (`receiptTotal`, §2), que es el que usa el filtro por importe de la spec 040. `linesTotal` se mantiene para el aviso de descuadre (spec 034 H2 criterio 3).

### 3.3 Enlace con el movimiento (H3)

- **Endpoints**, en `ReceiptsController`:

| Método y ruta | Uso |
|---|---|
| `GET /receipts/:id/transaction-candidates` | `rankLinkCandidates` sobre los gastos del usuario sin ticket enlazado del rango de fechas (§2). |
| `PUT /receipts/:id/transaction` | Body `{ transactionId }`. Enlaza o cambia el enlace. 404 si el movimiento no es del usuario; 400 si es un ingreso; 409 si ya está enlazado a otro ticket (índice único). |
| `DELETE /receipts/:id/transaction` | Quita el enlace. 204. |

- **Búsqueda manual (H3 criterio 2):** reutiliza `GET /transactions` con `type=EXPENSE`, `q`, `dateFrom` y `dateTo`, que ya existen. No hace falta un endpoint nuevo.
- **Movimientos (H3 criterio 4):** `TransactionsService.list` y `getById` añaden `receiptId: string | null` con un `LEFT JOIN` a `receipts`. La copia sin conexión de la spec 011 guarda el movimiento entero, así que el campo viaja solo; un movimiento creado sin conexión no tiene ticket.
- **Nunca se crea ni modifica un movimiento** desde un ticket (H3 criterio 6, decisión de Diego): estos endpoints solo escriben `receipts.transaction_id`.

### 3.4 Exportación e importación de datos en `.zip` (H1 criterio 6, decisiones 1 y 2)

- **Tablas nuevas en `EconomicData`**, todas como claves opcionales (patrón de la spec 047), en orden de dependencias: `supermarkets`, `products`, `receipts` (después de `transactions`, por el enlace), `receiptLines`, `receiptDocuments` (solo metadatos más `file: "documentos/<id>.<ext>"`, nunca el contenido), `shoppingLists` y `shoppingListItems`.
- **`AccountArchiveService`** (nuevo, `data-export/`) genera el `.zip` en streaming con `yazl`: `datos.json` y, por cada documento, `documentos/<id>.<ext>`, leyendo de la base de datos **un documento cada vez** para no cargar todos los binarios en memoria en la Raspberry Pi. Lo usan:
  - `GET /users/me/export/archive` (nuevo): la descarga de la pantalla Copia de seguridad. `GET /users/me/export` (JSON) se mantiene tal cual, como exportación de solo datos para la API.
  - La exportación programada a carpeta (spec 032 H5): escribe `economia-app-datos-AAAA-MM-DD.zip`. La purga de los 14 días reconoce `.zip` y los `.json` anteriores.
  - Google Drive (spec 032 H4): pasa de subida `multipart`, que Drive limita a 5 MB, a **subida reanudable** (`uploadType=resumable`), con el `.zip` escrito antes en un fichero temporal que se borra al terminar.
- **Importación** (`POST /data-import/preview` y `/confirm`):
  - Acepta `.zip` y `.json`. El fichero se guarda en disco temporal (`multer.diskStorage`), no en memoria, y se borra al terminar. Límite: 500 MB para `.zip`; 10 MB para `.json`, como hoy.
  - El `.zip` se lee con `yauzl`, solo las entradas esperadas (`datos.json` y las que nombra cada documento), sin extraer nada a disco, así que no hay riesgo de rutas tipo `../`. Contra ficheros comprimidos maliciosos ("zip bomb"), se aborta si el tamaño descomprimido total supera 2 GB o el de una entrada difiere del declarado.
  - **Comprobación de propiedad** (como `mergeResolutions` de la spec 047): un ticket cuyo comercio es de otra cuenta no se importa; si su movimiento enlazado es de otra cuenta o desconocido, se importa sin enlace; una línea con un producto de otra cuenta, o una lista con un producto ajeno, se omite. Un documento se importa solo si su ticket es propio, su entrada existe en el `.zip` y el tamaño y el SHA-256 coinciden; si no, se omite y se cuenta.
  - El resumen de la vista previa añade las tablas nuevas, y en `receiptDocuments` cuántos documentos se omitieron y por qué.

### 3.5 Borrado de cuenta y copias de seguridad (H1 criterios 6 y 7)

- Todo cuelga de `users` en cascada (directamente o a través de `receipts`), así que el borrado de cuenta no necesita código nuevo; se cubre con un test e2e con datos en todas las tablas.
- `deploy/backup.sh` no cambia: los documentos están en la base de datos y entran en `pg_dump`. `deploy/README.md` añade una nota sobre el crecimiento esperado (§8).

## 4. Frontend

- **Subida de documentos** (`ReceiptImportPage` y el detalle del ticket):
  - `accept="image/*,application/pdf"`.
  - Antes de subir: si es una imagen que el navegador sabe abrir, se reduce a un máximo de 3000 px en el lado largo y se recodifica como JPEG al 85 %, solo si el resultado ocupa menos (`canvas`). Una foto del móvil baja de 3–6 MB a unos 400–800 KB: menos tiempo de subida por datos móviles y menos base de datos. Si el navegador no sabe abrirla (HEIC en Chrome o Android), se sube tal cual y la convierte el servidor.
  - Si el fichero, ya reducido, supera 10 MB, se avisa sin subir nada (H1 criterio 8).
- **Vista previa de importación:** el documento se ve junto a lo reconocido (una imagen en miniatura, o "PDF, N páginas"). Botón **"Guardar sin desglose"**, que vacía las líneas y pide el total (H2 criterio 2). Cada línea tiene la opción "— Sin producto —" (H2 criterio 4).
- **Detalle del ticket** (`ReceiptDetailPage`):
  - Sección "Documento": imagen visible, o botón "Abrir PDF"; "Descargar", "Sustituir" y "Quitar" (con confirmación). Sin documento: "Adjuntar documento". El binario se pide con `fetch` autenticado y se muestra con una URL de objeto: un `<img src>` directo no llevaría el token. Para eso se añade `api.getBlob` en `api/client.ts`, con el mismo reintento de refresco de sesión que el resto de peticiones.
  - Sección "Movimiento": si está enlazado, el movimiento (fecha, concepto, importe) con enlace a su edición y "Quitar enlace". Si no, los candidatos con "Enlazar" y un buscador (texto y fechas, por defecto ±15 días) que usa `GET /transactions`. Sin candidatos: "No hay ningún gasto con este importe cerca de esta fecha. Puedes buscarlo a mano o dejar el ticket sin enlazar". Nunca se ofrece crear un movimiento.
- **Movimientos** (H3 criterio 4): en el listado, la etiqueta "🧾 ticket" en los que tienen uno, que lleva a `/tickets/:id`; en la edición del movimiento, "Ticket enlazado: ver".
- **Textos** (H2 criterio 3): "Supermercado" pasa a "Comercio" en el editor de tickets, el filtro del historial, la comparativa de precios y el simulador de cesta. El menú pasa de "Tickets de supermercado" a "Tickets y facturas". El historial muestra el total (§2) y un icono si el ticket tiene documento.
- **Copia de seguridad** (`BackupPage`): "Exportar" descarga el `.zip` (`getBlob`); el selector de importación acepta `.zip,.json`; etiquetas en español para las tablas nuevas.

## 5. Casos límite

| Caso | Comportamiento |
|---|---|
| Se sube una foto en la vista previa y no se confirma nunca | Queda pendiente y se borra a las 24 horas. No es visible en ningún sitio. |
| Se confirma con el `documentId` de otro usuario, o ya usado | La actualización no encuentra la fila (`user_id` y `receipt_id IS NULL`): 400 y no se guarda nada (todo en la misma transacción). |
| Un fichero `.png` que en realidad es un SVG o un HTML | `detectDocumentType` devuelve `null`: 400. Además se sirve siempre con `nosniff` y con el tipo detectado. |
| PDF de más de 5 páginas | Se guarda entero; el OCR lee las 5 primeras y avisa. |
| HEIC que no se puede convertir | 400 "No se ha podido leer la foto; prueba a subirla en JPEG". |
| Se borra el movimiento enlazado | `transaction_id` pasa a `null`; el ticket sigue con su documento. |
| Dos tickets intentan enlazar el mismo movimiento | El índice único lo impide: el segundo recibe 409. |
| Ticket sin líneas y sin total | Se rechaza al guardar (400): no tendría importe. |
| Filtro por importe (spec 040) sobre un ticket sin líneas | Usa el total impreso (§2), así que se filtra como cualquier otro. |
| Importar en una cuenta un `.zip` de otra cuenta | Se importa bajo el usuario autenticado; los comercios, productos y movimientos ajenos se tratan como en §3.4. |
| `.zip` dañado o sin `datos.json` | 400, sin importar nada. |
| Copia `.json` antigua (sin tickets ni documentos) | Se importa como hoy; las tablas nuevas cuentan 0. |
| El contenido de un documento no coincide con su SHA-256 | Ese documento se omite y se cuenta; el resto sí se importa. |

## 6. Tests

- Unitarios de las funciones de §2, escritos antes que el código que las usa.
- e2e de documentos: vista previa (OCR simulado) → confirmar con `documentId` → descargar → sustituir → quitar; pendiente de otro usuario o ya usado; tipo falso; tamaño; purga de pendientes de más de 24 h; aislamiento (404 para otro usuario en cada endpoint).
- e2e de H2: ticket sin líneas (con total; sin total → 400), línea sin producto y que no aparece en la comparativa, filtro por importe con un ticket sin líneas.
- e2e de H3: candidatos (importe por total impreso o por suma de líneas, ventana de fechas, orden por comercio, sin los ya enlazados ni los ingresos), enlazar, cambiar, quitar, 409 por duplicado, borrar el movimiento o el ticket, `receiptId` en `GET /transactions`, aislamiento.
- e2e de exportación e importación: el `.zip` contiene `datos.json` y los documentos con SHA-256 correcto; ida y vuelta completa en otra cuenta (tickets, líneas, documentos, enlaces y listas); `.json` antiguo; `.zip` dañado; comprobaciones de propiedad; exportación programada a carpeta (`.zip` y purga); Drive con subida reanudable simulada.
- Borrado de cuenta con datos en todas las tablas nuevas.
- Frontend (Vitest y Testing Library): subida con aviso de tamaño, "Guardar sin desglose", "Sin producto", sección Documento (imagen y PDF), sección Movimiento (candidatos, buscador, sin candidatos, enlazado), etiqueta de ticket en movimientos, exportar `.zip` y aceptar `.zip`/`.json`. La reducción de imágenes con `canvas` no se puede probar en jsdom: se prueba la decisión (reducir o no, avisar o no) separada en una función pura, y el redimensionado se revisa a mano en el navegador (T8.2).

## 7. Dependencias nuevas

- Backend: `yazl` y `yauzl` (escribir y leer `.zip` en streaming; pequeñas, sin dependencias nativas, con sus `@types`) y `heic-convert` (HEIC → JPEG en JavaScript puro). Se comprueba `npm audit` y que todas funcionan en la imagen Docker de la Raspberry Pi (`linux/arm64`) antes de usarlas, igual que se hizo con `sharp` en la spec 034.
- Frontend: ninguna.

## 8. Crecimiento de la base de datos

Con la reducción del navegador, una foto ocupa unos 0,4–0,8 MB y un PDF de factura unos 0,1–0,5 MB. Con unos 40 documentos al mes, son unos 25 MB al mes y unos 300 MB al año. `pg_dump` no reduce JPEG ni PDF al comprimir, así que cada copia diaria crece en esa misma medida, y `backups/` guarda 14. Tras un año, unos 4 GB de copias. Es asumible en la Raspberry Pi, pero se anota en `deploy/README.md` por si hiciera falta guardar menos copias o hacerlas incrementales más adelante (fuera de esta spec).

## 9. Fuera de este plan (anotado, no se toca)

- **La importación de datos no comprueba la propiedad de las tablas hijas que ya existían** (por ejemplo, `stockPurchases` con un `stockId` de otra cuenta): `mergeTable` inserta la fila si su `id` no existe. Explotarlo exige conocer un UUID ajeno, así que el riesgo práctico es bajo. Las tablas nuevas de esta spec sí lo comprueban (§3.4). Arreglarlo en las antiguas toca la spec 032 y merece una tarea propia.

## 10. Orden de implementación propuesto (para `tasks.md`)

1. Dependencias y comprobación en `arm64`.
2. Migración y esquema.
3. Funciones puras con sus tests.
4. H1: documentos (backend, luego frontend).
5. H2: facturas y tickets sin líneas, OCR de PDF y cambio de textos.
6. H3: enlace con el movimiento (backend, luego frontend).
7. Exportación e importación en `.zip`, con tickets y listas.
8. Borrado de cuenta, nota de despliegue y cierre (incluida la prueba de Diego con Vision y un PDF real).
