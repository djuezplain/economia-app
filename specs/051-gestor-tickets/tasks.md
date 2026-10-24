# Tasks — Spec 051 (gestor de tickets: etiquetas, buscador, notas, garantías y galería)

**Fase:** 3 de 4 (aprobado)

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

*(se rellena al terminar cada tarea)*
