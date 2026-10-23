# Tasks — Spec 048 (tickets y facturas: documento original, cualquier comercio y enlace con el movimiento)

**Fase:** 3 de 4 (pendiente de aprobación)

Orden de plan.md §10. Cada tarea es como mucho un commit (constitution §4) y no se da por hecha si rompe un test existente.

## Grupo 0 — Dependencias

- **T0.1** — Instalar `yazl`, `yauzl`, `heic-convert` y sus tipos (`@types/yazl`, `@types/yauzl`; `heic-convert` no trae tipos: declaración mínima en `src/types/`). Revisar `npm audit` (mismo criterio que la spec 034 T0.1).
- **T0.2** — Comprobar que funcionan en `linux/arm64`, la arquitectura de la Raspberry Pi: dentro de un contenedor `node:22` para `arm64` (`docker run --platform linux/arm64`, emulado), crear un `.zip` con `yazl`, leerlo con `yauzl` y convertir un HEIC de prueba a JPEG con `heic-convert`. Medir el tiempo y la memoria de la conversión de un HEIC de 12 MP. Si no se puede emular `arm64` en este entorno, o algo falla, parar y ajustar `plan.md` antes de seguir. Aceptación: las tres cosas funcionan y la conversión cabe en la memoria del contenedor del backend.

## Grupo 1 — Modelo de datos

- **T1.1** — Migración `0033_receipt_documents_and_links` (plan.md §1): tabla `receipt_documents` con su índice único parcial sobre `receipt_id`; `receipts.transaction_id` (FK `SET NULL`) con índice único parcial; `receipt_lines.product_id` nullable. Generar con `drizzle-kit generate`, revisar el SQL a mano y aplicar sobre una base con tickets, líneas y listas ya guardados (como se hizo con la 0032): no se pierde nada y los índices únicos se comportan como se espera. Aceptación: los tests existentes siguen en verde.

## Grupo 2 — Funciones puras (tests primero)

- **T2.1** — `detectDocumentType` (plan.md §2). Tests: cabecera real de JPEG, PNG, WEBP, HEIC (marcas `heic`, `heix`, `mif1`, `msf1`) y PDF; SVG, HTML, ZIP, fichero vacío y fichero de 3 bytes → `null`.
- **T2.2** — `receiptTotal`. Tests: con líneas (ignora el total impreso), sin líneas con total, sin nada → `null`, precisión decimal.
- **T2.3** — `merchantSimilarity` y `rankLinkCandidates`. Tests: parecido con y sin palabras de relleno, mayúsculas y tildes; candidato por total impreso y por suma de líneas; bordes de la ventana (2 días antes y 5 después dentro; 3 antes y 6 después fuera); ingresos excluidos; orden por comercio y luego por fecha.
- **T2.4** — Cambios en `detectDate` y `detectPrintedTotal` (plan.md §2). Tests nuevos con fechas `dd-mm-aaaa`, `dd.mm.aa` y "15 de octubre de 2026", y con facturas que traen "Subtotal", "Base imponible" e "IVA" antes del total. Aceptación extra: los tests existentes del parseo, con tickets reales de Mercadona y Lidl, pasan sin tocarlos.

## Grupo 3 — H1: documento original

- **T3.1** — `ReceiptDocumentsService` (`storePending`, `attachPending`, `replace`, `remove`, `getContent`, `purgeStalePending`) con conversión de HEIC, y `ReceiptDocumentsCleanupScheduler` (4:00 de Madrid). Tests e2e: guardar pendiente; tipo falso → 400; HEIC se guarda como JPEG; purga solo los pendientes de más de 24 h, y nunca uno ya asociado.
- **T3.2** — Vista previa y confirmación: `preview` acepta los cinco tipos, guarda el pendiente y devuelve `document`; `confirm` acepta `documentId` y lo asocia en la misma transacción. Tests e2e (OCR simulado): flujo completo; `documentId` de otro usuario, ya usado o inexistente → 400 sin guardar nada; un fallo al guardar las líneas no deja el documento asociado.
- **T3.3** — OCR de PDF con `files:annotate` (plan.md §3.2): texto por páginas y aviso con más de 5. Tests con `fetch` simulado (respuesta de una y de varias páginas; error de Vision). Se deja anotado en el checklist que falta la prueba de Diego con su clave y un PDF real.
- **T3.4** — Endpoints `GET`/`PUT`/`DELETE /receipts/:id/document` y `document` en el listado y el detalle de tickets. Tests e2e: descargar (cabeceras `Content-Type`, `Content-Disposition` con y sin `?download=1`, `nosniff`, `no-store`); sustituir; quitar; adjuntar a un ticket antiguo; tamaño de más de 10 MB → 400 con mensaje en español; borrar el ticket se lleva el documento; 404 para otro usuario en cada endpoint.
- **T3.5** — Frontend: `api.getBlob` en `api/client.ts` (con el reintento de refresco de sesión), con test. Función pura `prepareUpload` (reducir o no, avisar por tamaño), con tests, y su uso con `canvas` en la subida. Vista previa de importación con el documento. Sección "Documento" del detalle (imagen o "Abrir PDF", descargar, sustituir, quitar con confirmación, adjuntar). Tests de componente.

## Grupo 4 — H2: cualquier comercio

- **T4.1** — Backend: líneas opcionales (sin líneas, el total es obligatorio), `product: null` en las líneas, `total` en el listado y el detalle de tickets, y el filtro por importe de la spec 040 sobre `total`. Adaptar `ProductsService` y `ReceiptsService.getById` a las líneas sin producto (plan.md §1). Tests e2e: ticket sin líneas con total y sin total (400); línea sin producto, que no aparece en la comparativa ni rompe el listado de productos; filtro por importe con un ticket sin líneas; edición (spec 035) con las mismas reglas.
- **T4.2** — Frontend: "Guardar sin desglose", "— Sin producto —" en el editor de líneas, "Supermercado" → "Comercio" (editor, filtro, comparativa y simulador de cesta) y el menú "Tickets y facturas"; el historial muestra el total y el icono de documento. Tests actualizados y nuevos.

## Grupo 5 — H3: enlace con el movimiento

- **T5.1** — Backend: `GET /receipts/:id/transaction-candidates`, `PUT` y `DELETE /receipts/:id/transaction`, y `receiptId` en `GET /transactions` y `GET /transactions/:id`. Tests e2e: candidatos (por total impreso y por suma de líneas, ventana de fechas, orden, sin los ya enlazados ni los ingresos); enlazar, cambiar y quitar; 409 si el movimiento ya tiene ticket; 400 con un ingreso; borrar el movimiento deja el ticket sin enlace; borrar el ticket deja el movimiento sin ticket; ningún endpoint crea ni modifica movimientos; aislamiento (404).
- **T5.2** — Frontend: sección "Movimiento" del detalle del ticket (enlazado, candidatos, buscador con `GET /transactions` y mensaje sin candidatos, sin opción de crear); etiqueta "🧾 ticket" en el listado de movimientos y "Ticket enlazado: ver" en su edición. Tests de componente.

## Grupo 6 — Exportación e importación en `.zip`

- **T6.1** — Tablas de tickets y listas en `EconomicData` como claves opcionales (exportación JSON) y su importación con comprobación de propiedad (plan.md §3.4), sin documentos todavía. Tests e2e: ida y vuelta en otra cuenta; comercio ajeno → ticket omitido; movimiento ajeno o desconocido → ticket sin enlace; producto ajeno → línea o elemento de lista omitido; copia `.json` antigua sin estas claves.
- **T6.2** — `AccountArchiveService` (`.zip` en streaming, un documento cada vez) y `GET /users/me/export/archive`. Tests e2e: el `.zip` trae `datos.json` y cada documento en su ruta, con el SHA-256 correcto; cuenta sin documentos; aislamiento.
- **T6.3** — Importación de `.zip`: `multer.diskStorage` con borrado del temporal, límites (500 MB `.zip`, 10 MB `.json`), lectura con `yauzl` solo de las entradas esperadas, protección contra ficheros comprimidos maliciosos y documentos verificados por tamaño y SHA-256. Tests e2e: ida y vuelta completa con documentos; `.zip` dañado o sin `datos.json` → 400; documento con SHA-256 que no coincide → omitido y contado; entrada que declara un tamaño falso → se aborta; el temporal se borra también si falla.
- **T6.4** — Exportación programada a carpeta en `.zip` y purga de `.zip` y `.json` antiguos; Google Drive con subida reanudable desde un temporal. Tests: los existentes adaptados y uno nuevo de Drive con la subida reanudable simulada (sesión, subida y error a mitad).
- **T6.5** — Frontend (`BackupPage`): "Exportar" descarga el `.zip`, la importación acepta `.zip,.json` y las tablas nuevas tienen etiquetas en español. Tests de componente.

## Grupo 7 — Borrado de cuenta y cierre

- **T7.1** — Borrado de cuenta con datos en todas las tablas nuevas o ampliadas (documentos, también pendientes; tickets enlazados; listas): no queda ninguna fila (test e2e).
- **T7.2** — `deploy/README.md`: nota sobre el crecimiento de la base de datos y de las copias (plan.md §8), y que la exportación ahora es un `.zip`.
- **T7.3** — Cierre: `npm test` de backend (unitarios y e2e, en serie) y frontend, `tsc -b` y oxlint en verde; revisión visual en navegador (importar foto y PDF, ticket sin desglose, detalle con documento y movimiento, listado de movimientos, copia de seguridad) en escritorio y a 375 px, incluida la reducción real de una foto con `canvas`; contrastar la spec historia por historia; rellenar el checklist. Queda pendiente de Diego la prueba del OCR con su clave de Vision y un PDF real.

---

## Checklist de cierre — spec 048

*(se rellena al terminar cada tarea)*
