# Tasks — Spec 034 (Comparativa de precios de supermercado a partir de tickets escaneados)

**Fase:** 3 de 4

## Grupo 0 — Dependencias e infraestructura

- **T0.1** — Instalar `sharp` (backend). Comprobar `npm audit` (mismo criterio que plan.md §2/spec 003 §2). Instalar Tesseract localmente en la máquina de desarrollo (`brew install tesseract tesseract-lang` en macOS, ya verificado en la exploración de `spec.md` §1) y documentar el paso en el README del backend para cualquier otra máquina de desarrollo.
- **T0.2** — Añadir `tesseract-ocr tesseract-ocr-spa` al `apt-get install` de `backend/Dockerfile` (plan.md §10). Reconstruir la imagen localmente (`docker compose build backend`) y comprobar en el contenedor que `tesseract --list-langs` incluye `spa` — sin esto no se puede confiar en que el resto de la spec funcione en el Raspberry Pi de despliegue.
- **T0.3** — Verificar que `sharp` resuelve un binario precompilado para `linux-arm64` dentro de esa misma imagen Docker (plan.md §10, riesgo señalado explícitamente sin resolver en el plan) — `docker compose run backend node -e "require('sharp')"` sin errores de compilación. Si no hay binario precompilado y hace falta compilar, confirmar que las herramientas ya presentes (`python3 build-essential`) bastan; si no bastan, parar y ajustar `plan.md` antes de seguir (no parchear el Dockerfile a ciegas).

## Grupo 1 — Modelo de datos

- **T1.1** — `backend/src/db/schema/groceries.schema.ts`: las 4 tablas de plan.md §1 (`supermarkets`, `products`, `receipts`, `receiptLines`), exportadas también desde `schema/index.ts`. Migración con `drizzle-kit generate` + revisión manual del SQL generado antes de aplicarla (mismo hábito que specs anteriores). Aplicar contra `economia_dev` y `economia_test`.
  Sin test propio (solo definición de esquema) — se verifica indirectamente en cuanto el Grupo 4 escriba/lea contra estas tablas.

## Grupo 2 — Parseo y detección (funciones puras, sin Tesseract real)

- **T2.1** — `receipt-import/receipt-import.parsing.ts`: las 5 reglas de línea de plan.md §5 (peso en dos líneas, dos importes, un importe, unidad por defecto, línea no reconocida se descarta) sobre texto ya extraído (strings sintéticos, nunca invocando Tesseract). Tests unitarios: cada regla por separado con el texto real observado en la prueba de `spec.md` §1 (incluida literalmente la línea `2 NACHOS ... 1480` mal fusionada, para confirmar que la regla 2 la interpreta como `pricePerUnit: 0.90, amount: 1.80` — o, si no es recuperable de esa cadena exacta, un caso equivalente bien formado que sí demuestre la regla) y una línea de ruido total (p. ej. la salida ilegible de la sección de tarjeta bancaria) que debe descartarse sin lanzar error.
- **T2.2** — Mismo fichero: detección de supermercado (primeras 5 líneas normalizadas contra una lista dada), fecha (`dd/mm/aaaa` → ISO, plan.md §6) y total (línea con "TOTAL" + precio). Tests: detecta "MERCADONA, S.A." normalizado; sin coincidencia devuelve la primera línea no vacía como sugerencia; fecha ausente o con formato inesperado devuelve `null` sin lanzar; línea de total con el papel arrugado (número sin forma de precio) devuelve `null` en vez de un valor inventado.
- **T2.3** — Emparejamiento por nombre normalizado (plan.md §8) reutilizando `normalizeText` (`common/normalize-text.util.ts`, ya extraído en spec 033 T1.1 — sin duplicar). Dos funciones pequeñas, una para supermercados y otra para productos, cada una devolviendo `{ matchedId } | { suggestedName }` contra una lista de candidatos dada. Tests: coincidencia exacta tras normalizar (mayúsculas/tildes/espacios); sin coincidencia; lista vacía.

## Grupo 3 — Pipeline de OCR (la única pieza que toca `sharp`/Tesseract de verdad)

- **T3.1** — `receipt-import/receipt-ocr.service.ts`: recorte por brillo medio, escala de grises + upscale x3 + autocontraste con `sharp` (plan.md §4.1-4.2), fichero temporal + `execFile('tesseract', ...)` + borrado en `finally` (plan.md §4.3). Sin lógica de parseo aquí (eso es el Grupo 2) — esta pieza solo expone `extractText(imageBuffer): Promise<string>`.
  Tests de integración (requieren Tesseract instalado, T0.1): una imagen sintética generada en el propio test (texto renderizado con `sharp` sobre un fondo, no una foto real, plan.md §14) produce un texto reconocible; una imagen casi en blanco no lanza excepción, devuelve texto vacío o irrelevante; el recorte por brillo con una imagen ya sin fondo (ocupa el 100 %) no reduce el área a casi cero (plan.md §4.1, caso del recorte que falla).

## Grupo 4 — Backend: importación (`receipt-import`)

- **T4.1** — `ReceiptImportService.preview()`: junta Grupo 2 + Grupo 3 (`extractText` → parseo → detección → emparejamiento contra los supermercados/productos ya existentes del usuario) y devuelve `ReceiptPreview` (plan.md §3) sin escribir nada. `ReceiptImportController` (`POST /receipt-import/preview`, `AuthGuard`+`RequireActiveUserGuard`, `FileInterceptor('file')`, límite 15 MB, solo `image/jpeg`/`image/png`). `ReceiptImportModule` (plan.md §12), añadido a `app.module.ts`.
  Tests e2e: imagen sintética con líneas conocidas → preview con supermercado/fecha/líneas/`linesTotal` correctos, nada en `receipts`/`receiptLines` tras la llamada; imagen sin ningún texto legible → `warnings` no vacío, `lines: []`, no un 500; fichero que no es imagen → 400; 401 sin autenticar; 403 `PENDING_VERIFICATION`.
- **T4.2** — `ReceiptImportService.confirm(userId, dto: ConfirmReceiptDto)`: dentro de `db.transaction()`, resuelve supermercado y producto por línea (crea o reutiliza, plan.md §8-§9), inserta `receipts`+`receiptLines`. `POST /receipt-import/confirm` en el controller (JSON, no multipart — plan.md §7, no vuelve a subirse la imagen).
  Tests e2e: DTO con supermercado nuevo + producto nuevo + producto ya existente → 1 `receipt`, N `receiptLines`, el producto reutilizado no se duplica en `products`; `{ id }` de un supermercado/producto que pertenece a otro usuario → 404, nada escrito (aislamiento); fallo a mitad (p. ej. una línea con `unit` inválido) revierte toda la transacción.

## Grupo 5 — Backend: consulta (`groceries`)

- **T5.1** — `SupermarketsController`/`Service`: `GET /supermarkets` (lista del usuario). `ProductsController`/`Service`: `GET /products?search=` (`ILIKE` sobre `name`, normalizado). `GroceriesModule` (plan.md §12).
  Tests: cada endpoint filtra por `userId`; `search` vacío devuelve todos/una página razonable; `search` sin coincidencias devuelve `[]`.
- **T5.2** — `ProductsController`: `GET /products/:id/prices` (H4 criterio 3) — join `receiptLines`+`receipts`+`supermarkets` del producto, ordenado ascendente por `pricePerUnit`. `ReceiptsController`: `GET /receipts` (H5 criterio 1, orden por fecha desc.) y `GET /receipts/:id` (H5 criterio 2, con líneas y producto emparejado de cada una).
  Tests: precios de un producto comprado en 2 supermercados distintos salen ordenados de más barato a más caro; producto de otro usuario → 404; ticket con líneas de peso y de unidad mezcladas se lista correctamente con su `unit` propio en cada línea.

## Grupo 6 — Frontend

- **T6.1** — `frontend/src/api/receipt-import.ts` (`previewReceiptImport(file)`/`confirmReceiptImport(dto)`) y `frontend/src/api/groceries.ts` (`listSupermarkets`, `searchProducts`, `getProductPrices`, `listReceipts`, `getReceipt`), mismo patrón `api.postForm`/`api.get`/`api.post` que el resto de `api/`.
- **T6.2** — `ReceiptImportPage.tsx` (`/tickets/importar`, plan.md §11): selector de imagen con `capture="environment"`, preview editable (supermercado, fecha, líneas con descripción/cantidad/unidad/precio-unidad/importe/producto, añadir/borrar línea), aviso si `linesTotal` ≠ `printedTotal` (H2 criterio 3), botón "Confirmar".
  Tests: sin fichero no llama a la API; edición de un campo de línea se refleja en el DTO enviado a `confirm`; borrar y añadir una línea; aviso de total visible solo cuando no coinciden y no bloquea el botón de confirmar.
- **T6.3** — `ReceiptsPage.tsx` (`/tickets`, H5 criterio 1) y `ReceiptDetailPage.tsx` (`/tickets/:id`, H5 criterio 2).
  Tests: listado ordenado por fecha; detalle muestra cada línea con su producto emparejado.
- **T6.4** — `ProductPricesPage.tsx` (`/tickets/productos`, H4 criterio 3): buscador de producto + tabla de precios por supermercado/fecha ordenada.
  Tests: buscar sin resultados muestra mensaje claro; selecciona un producto y pinta la tabla ordenada por precio.
- **T6.5** — Entrada de navegación nueva en `AppLayout.tsx` (plan.md §11: "Tickets de supermercado" con sus 3 sub-rutas). `AppLayout.test.tsx` ampliado con el enlace nuevo.

## Grupo 7 — Tests y cierre

- **T7.1** — Repasar `spec.md` historia por historia (H1-H5) y confirmar que cada criterio de aceptación está cubierto por al menos un test automático — mismo checklist de cierre que spec 033.
- **T7.2** — `npm run lint`, `npm run build`/`tsc -b` (recordatorio: `tsc -b`, no `tsc --noEmit`, en `frontend/`) y `npm test` (backend y frontend) en verde. Revisión manual en el navegador: fotografiar/subir un ticket real de prueba (no el de Diego usado para verificar `spec.md` §1, o el mismo si ya está solo en el entorno local y nunca se commitea), corregir la vista previa, confirmar, comprobar en `ProductPricesPage` que un producto repetido en dos tickets de supermercados distintos aparece comparado correctamente.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo — en particular el parseo heurístico de T2.1 o el riesgo de `sharp`/ARM de T0.3 — se para y se ajusta `plan.md` antes de seguir (no se parchea en silencio).

---

## Checklist de cierre — spec 034 (T7.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático.

### H1 — Subir la foto de un ticket y ver qué se ha reconocido, antes de guardar nada

- [x] Criterio 1 (se acepta una imagen): `test/receipt-import.e2e-spec.ts` — todos los tests de `preview` suben un `.jpg` real vía `multipart/form-data`.
- [x] Criterio 2 (vista previa con nombre+precio por línea, y fecha/supermercado/total por separado): "reconoce supermercado, fecha, líneas y total, sin escribir nada" — comprueba explícitamente `supermarket`, `date`, `lines[].description/pricePerUnit`, `printedTotal` (añadida la comprobación de `date`, hueco real encontrado en el cierre — la lectura de fecha ya estaba implementada y unit-testeada en `receipt-import.parsing.spec.ts`, pero ningún test de integración comprobaba que `ReceiptImportService.preview()` la propagara hasta la respuesta).
- [x] Criterio 3 (nada se escribe hasta confirmar): mismo test, comprueba `db.select().from(receipts)` vacío tras el preview.
- [x] Criterio 4 (imagen ilegible → aviso, nunca una vista previa vacía sin más): "una imagen sin ningún texto legible avisa..." (añadido en el cierre — hueco real: `ReceiptOcrService.spec.ts` ya probaba que una imagen en blanco no lanza excepción, pero ningún test comprobaba que `ReceiptImportService.preview()` tradujera eso en el aviso de `warnings` que pide este criterio).

### H2 — Corregir lo reconocido antes de guardar

- [x] Criterio 1 (cada línea editable): `ReceiptImportPage.test.tsx` — "editar un campo de una línea se refleja en el DTO enviado a confirmar".
- [x] Criterio 2 (borrar/añadir línea a mano): "borrar una línea la quita de lo que se envía al confirmar", "añadir una línea nueva vacía y rellenarla se incluye al confirmar".
- [x] Criterio 3 (aviso de suma vs. total impreso, sin bloquear): "muestra un aviso si la suma de las líneas no coincide con el total impreso, sin bloquear confirmar", "sin desajuste de totales, no muestra ningún aviso".

### H3 — Asociar el ticket a un supermercado

- [x] Criterio 1 (detectar de la cabecera): `receipt-import.parsing.spec.ts` — `guessSupermarketName`; e2e — sugiere "MERCADONA, S.A." de la cabecera real reconocida por OCR.
- [x] Criterio 2 (sin confianza → elegir existente o crear nuevo): e2e — "sugiere un supermercado ya existente del usuario en vez de uno nuevo"; `ReceiptImportPage.test.tsx` — "permite elegir un supermercado y un producto ya existentes en vez de crear nuevos" (añadida en el cierre — hueco real: todos los tests de la página usaban listas vacías de supermercados/productos, así que la rama "seleccionar uno ya existente" del `<select>` nunca se había ejercitado, solo la de "crear nuevo").
- [x] Criterio 3 (editable antes de confirmar): mismo test — cambia el `<select>` y comprueba que el payload enviado usa `{ id }` en vez de `{ name }`.

### H4 — Comparar el precio de un mismo producto entre supermercados

- [x] Criterio 1 (emparejar con existente o crear nuevo): `test/receipt-import.e2e-spec.ts` — "reutiliza un producto ya existente en vez de duplicarlo"; frontend — mismo test de H3 criterio 2.
- [x] Criterio 2 (sin fusión automática): `receipt-import.parsing.spec.ts` — `matchByNormalizedName`, "sin coincidencia, sugiere el nombre tal cual" (nunca fusiona nombres parecidos-no-idénticos, solo coincidencia exacta tras normalizar).
- [x] Criterio 3 (pantalla de precios ordenada de más barato a más caro): `test/groceries.e2e-spec.ts` — "GET /products/:id/prices"; `ProductPricesPage.test.tsx` — "selecciona un producto y pinta la tabla de precios ordenada por precio".
- [x] Criterio 4 (por peso vs. por unidad, sin conversión): `receipt-import.parsing.spec.ts` — "combina una línea por peso en dos líneas físicas" (`unit: 'kg'` propagado tal cual, sin ningún cálculo de conversión en `ProductsService.getPrices`).

### H5 — Ver el historial de tickets importados

- [x] Criterio 1 (listado por fecha descendente, con supermercado y total): `test/groceries.e2e-spec.ts` — "GET /receipts"; `ReceiptsPage.test.tsx`.
- [x] Criterio 2 (detalle con producto emparejado por línea): `test/groceries.e2e-spec.ts` — "GET /receipts/:id"; `ReceiptDetailPage.test.tsx`.

### Aislamiento de datos (spec.md §3, constitution §2)

- [x] `test/receipt-import.e2e-spec.ts` — "un id de supermercado de otro usuario responde 404 y no escribe nada (aislamiento)"; 401 sin autenticar, 403 `PENDING_VERIFICATION`.
- [x] `test/groceries.e2e-spec.ts` — 404 en `GET /products/:id/prices` y `GET /receipts/:id` para un recurso de otro usuario; los listados solo devuelven lo del usuario autenticado.

### Fuera de alcance (spec.md §3)

Sin Movimiento/gasto automático, sin código de barras, sin fusión difusa de nombres, sin conversión de divisa/unidad, sin vista de cámara propia, sin compartir datos entre usuarios: ninguno tiene código en esta spec — ausencia deliberada, nada que verificar (mismo criterio que el cierre de spec 033).

### Resultado del cierre

Todos los criterios de aceptación de H1-H5 quedan cubiertos por al menos un test automático. El repaso encontró **tres huecos reales de cobertura**, los tres del mismo tipo (una pieza ya estaba bien implementada y unit-testeada, pero ningún test de integración/e2e comprobaba que quedara bien conectada de punta a punta): H1 criterio 2 (fecha no comprobada en el `preview` real), H1 criterio 4 (aviso de imagen ilegible no comprobado contra el endpoint real) y H3 criterio 2/H4 criterio 1 (la rama de "elegir existente" del frontend nunca se había ejercitado). Los tres se corrigieron añadiendo el test que faltaba — ninguno reveló un bug de comportamiento, a diferencia del hallazgo de T4.2 (cascada de borrado), que sí era un bug real y ya quedó documentado en `plan.md` §1 en su momento.

### T7.2 — Verificación final

- Backend: `npm run build`/`lint` en verde; 226 tests unitarios en verde; 565 tests e2e en verde (`--no-file-parallelism` — un intento anterior tuvo 1 fallo aislado por contención de conexiones contra el Postgres local compartido, no relacionado con esta spec, no reproducible en la repetición inmediata; mismo tipo de flakiness ya documentado en el cierre de spec 033).
- Frontend: `tsc -b` (no `--noEmit`) y `lint` en verde; 537/539 tests en verde — los 2 fallos son en `SyncStatusPanel.test.tsx` y `WealthPage.test.tsx`, ficheros no tocados por esta spec; mismos fallos pre-existentes dependientes de la fecha de hoy ya documentados en el cierre de spec 033.
- **Verificación manual real contra los servidores de desarrollo** (`backend-dev`/`frontend-dev`, base de datos `economia_dev`, usuario de prueba creado y eliminado al terminar): se generó una imagen de ticket sintética directamente en el navegador (`<canvas>`, nunca el ticket real de Diego) y se subió al formulario real.
  - Ticket 1 (Mercadona, CHOCOLATE CLASSIC 1,30 € + NACHOS 1,80 €): el OCR reconoció correctamente supermercado, fecha, las 2 líneas y el total; suma de líneas = total impreso, sin aviso; confirmado sin errores; el detalle (`/tickets/:id`) muestra las líneas con su producto emparejado.
  - Ticket 2 (Carrefour, mismo "CHOCOLATE CLASSIC" a 1,60 €): el emparejamiento automático por nombre normalizado seleccionó solo el producto ya existente sin intervención manual (H4 criterio 1 verificado en vivo, no solo en test).
  - `/tickets/productos` → buscar "chocolate" → **CHOCOLATE CLASSIC aparece con Mercadona (1,30 €) antes que Carrefour (1,60 €)**, ordenado de más barato a más caro — el objetivo real de toda la spec, verificado funcionando de extremo a extremo contra el backend real.
  - `/tickets` (historial) lista ambos tickets ordenados por fecha descendente.
  - Al terminar, se borró el usuario de prueba (`DELETE FROM users`) sin ningún error — confirma en un escenario real, no solo sintético en `psql`, que la corrección de cascada de T1.1/T4.2 funciona con datos reales de tickets/productos/supermercados de por medio.

Con esto, **spec 034 queda cerrada**.
