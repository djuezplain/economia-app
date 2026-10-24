# Tasks — Spec 051 (gestor de tickets: etiquetas, buscador, notas, garantías y galería)

**Fase:** 4 de 4 (implementada)

Orden de plan.md §9. Cada tarea es como mucho un commit (constitution §4) y no se da por hecha si rompe un test existente.

## Grupo 0 — Dependencias

- **T0.1** — Instalar `sharp` (versión exacta) y revisar `npm audit`. Comprobar en `linux/arm64` emulado (mismo método que la spec 048 T0.2): redimensionar un JPEG de 12 MP a 480 px y medir tiempo y memoria. Si no funciona, parar y ajustar `plan.md` antes de seguir.

## Grupo 1 — Modelo de datos

- **T1.1** — Migración `0034_receipt_manager` (plan.md §1): extensiones, `immutable_unaccent`, columnas nuevas de `receipts`, `receipt_documents` y `users`, tablas `receipt_tags`, `receipt_tag_links` y `warranty_reminders_sent`, e índices. Generar con `drizzle-kit` y añadir a mano lo que no sabe generar (extensiones, función, índices de expresión). Aplicar sobre una base con datos de las specs 048 y 050: no se pierde nada. Aceptación: los tests existentes siguen en verde.

## Grupo 2 — Funciones puras (tests primero)

- **T2.1** — `normalizeSearch`, `searchTerms` y `findSnippet`. Tests: tildes, ñ, mayúsculas, palabras a medias, términos repetidos o de un carácter, fragmento al principio, en medio y al final del texto, con tildes en el original.
- **T2.2** — `warrantyShortcut`, `warrantyStatus` y `warrantyRemindersDue`. Tests: 29 de febrero, bordes de los 30 días, caducada, ya avisada para esa fecha y avisada para otra fecha.

## Grupo 3 — Etiquetas (H1)

- **T3.1** — Backend: `ReceiptTagsService`/`Controller` (`GET`, `POST`, `PATCH`, `DELETE /receipt-tags`), `PUT /receipts/:id/tags` con creación al vuelo, `tags` en el listado y el detalle, y `tagIds`/`newTags` al confirmar una importación. Tests e2e: CRUD, nombre repetido sin distinguir tildes (409, también al renombrar), crear al vuelo reutilizando la existente, borrar una etiqueta en uso, color fuera de la paleta (400), aislamiento (404) y la importación con etiquetas.
- **T3.2** — Frontend: sección "Etiquetas" del detalle (chips y campo con sugerencias que crea al pulsar Intro), etiquetas en la revisión de una importación, chips en el historial y pantalla `/tickets/etiquetas`. Tests de componente.

## Grupo 4 — Notas y garantías (H4, H5)

- **T4.1** — Backend: `PATCH /receipts/:id/details` (`note`, `warrantyUntil`), `hasNote`/`warrantyUntil` en el listado y `note` en el detalle, `note` al confirmar una importación. Tests e2e: guardar, quitar, nota de más de 2000 caracteres (400), fecha no válida (400), aislamiento.
- **T4.2** — Avisos: `WarrantyRemindersService` + `WarrantyRemindersScheduler` (8:00 Madrid) + plantilla `warrantyReminderEmail`, y `warrantyReminderEmails` en el perfil. Tests: plantilla (escapa el HTML), e2e con `MailService` falso (a 30 días, no repetir, cambiar la fecha vuelve a avisar, desactivados, caducada, usuario sin verificar).
- **T4.3** — Frontend: secciones "Nota" y "Garantía" del detalle (atajos +2 y +3 años), nota en la revisión de una importación, 📝 y 🛡️ en el historial, e interruptor del perfil. Tests de componente.

## Grupo 5 — Texto del documento (H3)

- **T5.1** — Backend: el texto del OCR se guarda en el documento pendiente al previsualizar; adjuntar y sustituir leen el texto (con `ocrWarning` si falla); `POST` y `GET /receipts/:id/document/text`; `hasText` en `document`. Tests e2e con OCR simulado: confirmar una importación guarda el texto, adjuntar y sustituir, fallo del OCR sin perder el documento, releer, 503 sin Vision, 404 sin documento, aislamiento.
- **T5.2** — Frontend: desplegable "Texto del documento", botón "Leer el texto del documento" y aviso cuando el OCR falla al adjuntar. Tests de componente.

## Grupo 6 — Búsqueda y filtros (H2, H1 criterio 4, H5 criterio 2)

- **T6.1** — Backend: `q`, `tagIds` y `warranty` en `GET /receipts`, con `match` y fragmento. Tests e2e: búsqueda en cada campo, tildes, palabras a medias, varias palabras en campos distintos, comodines escapados, combinada con los filtros existentes, fragmento correcto, filtro por varias etiquetas (todas), garantía vigente y que caduca, y aislamiento (nunca encuentra tickets de otro usuario). Medir el tiempo con 5000 tickets con texto de documento.
- **T6.2** — Frontend: caja de búsqueda con espera, filtros de etiquetas y garantía, y "Coincide en …" en cada resultado. Tests de componente.

## Grupo 7 — Miniaturas y galería (H6)

- **T7.1** — Backend: miniatura al guardar una imagen y `GET /receipts/:id/document/thumbnail` (generada a demanda para documentos antiguos, guardada, 404 para PDF, imagen dañada o sin documento). Tests e2e: generada al subir y a demanda, tamaño y tipo, PDF → 404, imagen dañada sin reintentos, cabeceras, aislamiento.
- **T7.2** — Frontend: conmutador Lista / Galería recordado en el dispositivo, rejilla con carga perezosa de miniaturas e icono para PDF y tickets sin documento. Tests de componente (carga perezosa simulada y liberación de `objectURL`).

## Grupo 8 — Datos del usuario (H7)

- **T8.1** — Exportación e importación: `receiptTags` y `receiptTagLinks` (claves opcionales), `ocrText`/`ocrReadAt` en los metadatos de los documentos (sin miniatura), y fusiones propias (etiqueta con el mismo nombre → se reutiliza; enlace a ticket o etiqueta no utilizables → omitido). Etiquetas en español en Copia de seguridad. Tests e2e: ida y vuelta completa en otra cuenta, etiqueta ya existente con el mismo nombre, enlaces ajenos, copia antigua sin estas claves.
- **T8.2** — Borrado de cuenta con datos en todas las tablas nuevas (test e2e).

## Grupo 9 — Cierre

- **T9.1** — Tests de backend (unitarios y e2e, en serie) y frontend, `tsc` y oxlint en verde; revisión visual a 1280 y 375 px (historial en lista y galería con búsqueda, detalle con etiquetas, nota, garantía y texto, pantalla de etiquetas); contrastar la spec historia por historia; rellenar el checklist; `deploy/README.md` si hace falta (dependencia nativa nueva).

---

## Checklist de cierre — spec 051

- [x] **T0.1** — `sharp` 0.35.5 (exacta); `npm audit` no añade avisos. En `linux/arm64` emulado (qemu, Node 22 arm64): una foto de 12 MP pasa a miniatura de 480 px en unos 0,7 s, con unos 200 MB de pico del proceso. El Dockerfile no cambia: `npm ci` instala el binario de la arquitectura y el lockfile ya lo incluye.
- [x] **T1.1** — Migración `0034_receipt_manager`, con las extensiones y `immutable_unaccent` añadidas a mano. Aplicada sobre la base de desarrollo con datos de las specs 048 y 050 sin perder nada; el índice único de etiquetas rechaza "GARANTIA" si existe "Garantía", y el `CHECK` rechaza colores fuera de la paleta.
- [x] **T2.1–T2.2** — `normalizeSearch` (comprobada contra `immutable_unaccent(lower())` en PostgreSQL), `searchTerms`, `escapeLike`, `findSnippet`, `warrantyShortcut`, `warrantyStatus` y `warrantyRemindersDue`, con 19 tests escritos antes.
- [x] **T3.1** — Etiquetas en el backend. 8 tests e2e. **Desviación menor:** al confirmar una importación las etiquetas van agrupadas en `tags: { tagIds, newTags }`, en vez de sueltas como decía el plan, para reutilizar el mismo DTO que `PUT /receipts/:id/tags`.
- [x] **T3.2** — `TagPicker`, sección del detalle, etiquetas al importar, chips en el historial y pantalla `/tickets/etiquetas` (también en el menú). El tipo y la constante del selector van en `tag-picker.types.ts` para no añadir avisos del linter.
- [x] **T4.1** — `PATCH /receipts/:id/details`. 6 tests e2e. Editar el ticket (spec 035) no toca la nota ni la garantía.
- [x] **T4.2** — Avisos de garantía con el mecanismo de la 049. 3 tests de la plantilla y 5 e2e con un `MailService` falso.
- [x] **T4.3** — Nota y garantía en el detalle, la importación, el historial y el perfil. La sección de la nota recuerda la última guardada en su propio estado (lo detectó un test).
- [x] **T5.1** — Texto del documento. 6 tests e2e. `ReceiptOcrService` pasa a `ReceiptDocumentsModule`, que lo comparte con la importación. Las imágenes de prueba JPEG y PDF pasan a `test/support/documents.ts`: importarlas desde otro fichero de tests ejecutaba también esa suite.
- [x] **T5.2** — Desplegable del texto y "Leer el texto del documento". Añadido: si se leyó y no se encontró texto, el botón dice "Volver a leer el texto".
- [x] **T6.1** — Búsqueda y filtros. 9 tests e2e. **Medido con 5000 tickets con texto de documento (unos 1,5 KB cada uno) y 40 000 líneas:** una búsqueda tarda entre 80 y 270 ms en este entorno. Con dos palabras, una de ellas presente en todos los documentos, tardaba 960 ms por la compilación JIT de PostgreSQL; se desactiva solo para esa consulta (`SET LOCAL jit = off`) y baja a 260 ms. El listado sin filtros tarda unos 400 ms con 5000 tickets porque carga todas las líneas, pero eso ya pasaba antes de esta spec. No se ha medido en la Raspberry Pi real.
- [x] **T6.2** — Buscador (espera de 300 ms; solo vale la última respuesta), filtros de etiquetas y garantía, y "Coincide en …".
- [x] **T7.1** — Miniaturas. 3 tests unitarios y 5 e2e.
- [x] **T7.2** — Galería y conmutador recordado. Un test encontró que, sin `IntersectionObserver`, se pedía la miniatura también de los PDF; corregido.
- [x] **T8.1** — Exportación e importación. 5 tests e2e, incluida la búsqueda en el texto restaurado. Las etiquetas con el mismo nombre se reutilizan con `ImportContext.alias/resolve`.
- [x] **T8.2** — Borrado de cuenta con datos en todas las tablas nuevas.
- [x] **T9.1** — Cierre:
  - Backend: 368 unitarios y 860 e2e en 65 ficheros, en serie, todos en verde (815 antes de esta spec); `tsconfig.build.json` y oxlint limpios.
  - Frontend: 778 de 779, `tsc -b` limpio y oxlint con 11 avisos (12 en `master`). Falla `RegisterMovementPage` › "Cancelar edición", el test intermitente ya anotado en las specs 047 a 050: con el código de `master` falla igual (2 de 3 ejecuciones en este entorno).
  - Revisión visual con Chromium a 1280 y 375 px, sin scroll horizontal: historial, búsqueda con fragmento, galería (miniatura, icono de PDF e icono sin documento), detalle con etiquetas, nota, garantía y texto, ticket sin documento, pantalla de etiquetas y avisos del perfil. Corregidos: una franja encima de las miniaturas (el `padding` general de los `li`) y el formulario de crear etiqueta en el móvil.
  - Spec contrastada historia por historia: H1 a H7 cubiertas con todos sus criterios.
  - `deploy/README.md`: nota sin pasos a mano.
  - **Aparte, para Diego:** `npm audit` señala vulnerabilidades anteriores a esta spec (entre ellas `multer` ≤ 2.4.0, que fijamos a 2.2.0 en la 048, y `proxy-addr`, crítica).
