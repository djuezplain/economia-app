# Plan 034 — Comparativa de precios de supermercado a partir de tickets escaneados (OCR)

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H5)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos — dominio nuevo (`groceries.schema.ts`)

No existe hoy ningún concepto de producto/supermercado/ticket en la app. Cuatro tablas nuevas, mismo patrón que `wealth.schema.ts` (catálogo abierto por usuario + historial, spec 019/020):

```ts
export const supermarkets = pgTable('supermarkets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('supermarkets_user_idx').on(table.userId)]);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('products_user_idx').on(table.userId)]);

export const receipts = pgTable('receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  supermarketId: uuid('supermarket_id').notNull().references(() => supermarkets.id, { onDelete: 'cascade' }), // ver nota de implementación
  date: date('date').notNull(),
  // Total impreso leído por OCR, informativo (spec.md H2 criterio 3) — nunca se
  // valida contra la suma de líneas ni se usa para nada más. `null` si no se
  // pudo leer (spec.md §1: la línea de TOTAL es justo la que peor sale).
  printedTotal: numeric('printed_total', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('receipts_user_date_idx').on(table.userId, table.date)]);

export const receiptLines = pgTable('receipt_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }), // ver nota de implementación
  // Texto de la línea tal como quedó en ESTE ticket tras la revisión de H2
  // (puede no coincidir letra a letra con `products.name` — p. ej. el ticket
  // dice "AGUACATE" pero el producto ya existente se llama "Aguacate 2ud").
  description: varchar('description', { length: 200 }).notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
  unit: varchar('unit', { length: 10 }).notNull(), // 'unidad' | 'kg' — spec.md H4 criterio 4
  pricePerUnit: numeric('price_per_unit', { precision: 10, scale: 3 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('receipt_lines_receipt_idx').on(table.receiptId),
  index('receipt_lines_product_idx').on(table.productId),
]);
```

- `unit`/`pricePerUnit` reproducen tal cual el formato de línea verificado en el ticket real (sección 1 de `spec.md`): líneas por unidad (`1 AGUADO 0,95` → quantity 1, unit "unidad", pricePerUnit 0,95, amount 0,95; `2 NACHOS 0,90 → 1,80` → quantity 2, pricePerUnit 0,90, amount 1,80) y líneas por peso (`BANANA 0,600 kg · 1,55 €/kg → 1,05` → quantity 0,600, unit "kg", pricePerUnit 1,55, amount 1,05). La comparativa de H4 usa siempre `pricePerUnit` — es el campo que ya es comparable entre supermercados sin ningún cálculo adicional.
- `receiptLines.productId` **no admite null**: en el momento de guardar (confirmar) un ticket, cada línea ya tiene un producto asignado (existente o recién creado) — el emparejamiento (§6) ocurre en la propia pantalla de revisión (H2), antes de confirmar, nunca después.
- Sin tabla de "fotos de ticket": decisión de `spec.md` §4.4, no se guarda la imagen.

> **Nota de implementación (T1.1/T4.2):** este plan proponía originalmente `onDelete: 'restrict'` en `receipts.supermarketId` y `receiptLines.productId` (mismo criterio por defecto que `categories.parent_id`/`transactions.categoryId`, spec 002). Al implementar T4.2 (borrado de cuenta con tickets ya guardados, e2e), **se reprodujo un fallo real contra Postgres** (verificado también a mano en `psql`, no solo en el test): `DELETE FROM users` cascada directamente `users → supermarkets`/`users → products` (un salto) y por otro camino `users → receipts → receiptLines` (dos saltos); con `restrict`, la cascada de un salto podía intentar borrar un supermercado/producto antes de que la cascada de dos saltos hubiera borrado el ticket que aún lo referenciaba — Postgres no garantiza el orden entre ramas de cascada de profundidad distinta. `transactions.categoryId` sí puede ser `restrict` con `categories.userId` en cascada porque ambas cuelgan de `users` a un único salto (mismo nivel); esa garantía no se cumplía aquí. Se cambiaron ambas columnas a `cascade` — sin ninguna funcionalidad de borrar un producto o supermercado en esta spec, no cambia ningún comportamiento visible hoy, solo hace segura la baja de cuenta (RGPD, spec 001 H8). Si una spec futura añade borrar un producto/supermercado directamente, esa spec decide entonces si debe bloquear el borrado (volviendo a `restrict` con el modelo de datos ya sin este riesgo, al no colgar de una cascada de `users`) o arrastrar su historial.

## 2. Dependencias nuevas

> **Revisado (ver nota de implementación al final de esta sección):** esta sección describía originalmente `sharp` + `tesseract-ocr` (motor local, gratuito). Diego pidió pasar a **Google Cloud Vision**; el contenido de esta sección refleja ya la versión final (Vision), no la original.

- **Ninguna dependencia npm nueva de producción.** Se llama a la API REST de Google Cloud Vision (`https://vision.googleapis.com/v1/images:annotate`) con el `fetch` global de Node 22 — sin SDK de Google Cloud (`@google-cloud/vision` arrastra `grpc-js`/`google-gax`, mucho más peso del que hace falta para una única llamada REST) y sin el patrón de cuenta de servicio + `google-auth-library`/JWT que ya usa `GoogleSheetsService` (spec 026): Vision, a diferencia de Sheets, no necesita acceder a un recurso privado de un usuario concreto, así que una **API key** de proyecto (autenticación más simple posible, forma estándar recomendada por Google para este caso) es suficiente.
- **Variable de entorno nueva**: `GOOGLE_CLOUD_VISION_API_KEY` (`env.validation.ts`, `.env.example`) — Diego la obtiene habilitando "Cloud Vision API" en un proyecto de Google Cloud Console y creando una API key restringida a esa API. Sin ella, `ReceiptOcrService` rechaza con un 503 claro en vez de fallar de forma confusa contra Google (mismo criterio que `GoogleConfiguredGuard`, spec 001 grupo 4, para credenciales de Google no configuradas).
- **Sin preprocesado de imagen** (`sharp` queda retirado, ver nota): Vision es robusto contra fondo, rotación e iluminación variable sin ayuda adicional — a diferencia de Tesseract, no hace falta recortar/escalar/aumentar contraste antes de enviarle la foto.

> **Nota de implementación — cambio de motor de OCR (Tesseract → Google Cloud Vision), pedido por Diego después de la implementación inicial ya cerrada y desplegada:**
> - Se retiran `sharp` (preprocesado de imagen) y `tesseract-ocr`/`tesseract-ocr-spa` (Dockerfile) — ninguno de los dos hace falta ya. `ReceiptOcrService.extractText(buffer): Promise<string>` mantiene exactamente la misma firma; todo lo demás (parseo de §5, detección de §6, endpoints de §3, frontend) no cambia una línea — exactamente la garantía que ya anticipaba `spec.md` §4 decisión 1 al dejar el motor como "revisable".
> - `MAX_IMAGE_SIZE_BYTES` del controller baja de 15 MB a 10 MB (§3): la API de Vision acepta la imagen codificada en base64 dentro del cuerpo JSON de la petición, que añade ~33% de overhead sobre el tamaño del fichero original — 10 MB de foto quedan en ~13,3 MB codificados, con margen cómodo bajo cualquier límite razonable de tamaño de petición, sin necesitar `sharp` para reescalar antes de enviar.
> - **Coste**: Google Cloud Vision no es gratuito sin límite como Tesseract — tiene una capa gratuita mensual y cobra por imagen a partir de ahí. Asumido por Diego al pedir el cambio; no se implementa ningún control de cuota o límite de uso propio en esta revisión (fuera de alcance, igual que el resto de "fuera de alcance" de `spec.md` §3).
> - **Tests**: ya no es posible (ni deseable) invocar el motor real en la suite automática — a diferencia de Tesseract (binario local, gratis, sin red), cada llamada a Vision cuesta dinero y depende de red/credenciales. `ReceiptOcrService.spec.ts` pasa a mockear `global.fetch`; `receipt-import.e2e-spec.ts` pasa a sobreescribir el provider `ReceiptOcrService` con un doble de test (`overrideProvider`, ya nativo de `@nestjs/testing`) en vez de generar imágenes sintéticas con texto renderizado y esperar un OCR real. Ver §13.

## 3. Endpoints

**Importación (mismo patrón que `StockImportController`, spec 033):**

| Método y ruta | Guard | Descripción |
|---|---|---|
| `POST /receipt-import/preview` | `AuthGuard`, `RequireActiveUserGuard` | H1. `multipart/form-data`, campo `file` (imagen, `.jpg`/`.jpeg`/`.png`, máx. 10 MB — ver nota de implementación de §2 sobre el overhead de base64 de Vision). Ejecuta el pipeline completo (§4-§6) y devuelve la vista previa. No escribe nada. |
| `POST /receipt-import/confirm` | ídem | H2-H5. **A diferencia de `stock-import`/`import`, no vuelve a subirse el fichero** — recibe JSON con los datos ya corregidos por Diego en la vista previa (§7 explica por qué). |

```ts
// Respuesta de preview — ninguno de estos valores está persistido todavía.
interface ReceiptPreview {
  supermarket: { matchedId: string | null; suggestedName: string | null }; // H3
  date: string | null; // ISO, null si no se pudo leer (Diego lo rellena a mano)
  printedTotal: string | null; // string decimal, igual criterio que el resto de importes de la app
  linesTotal: string; // suma de `lines[].amount`, para el aviso de H2 criterio 3
  lines: ReceiptPreviewLine[];
  warnings: string[]; // p. ej. "no se ha podido leer el total del ticket"
}
interface ReceiptPreviewLine {
  description: string;
  quantity: string;
  unit: 'unidad' | 'kg';
  pricePerUnit: string;
  amount: string;
  product: { matchedId: string | null; suggestedName: string }; // H4 criterio 1
}

// Payload de confirm — ya corregido por Diego en pantalla (H2).
interface ConfirmReceiptDto {
  supermarket: { id: string } | { name: string }; // existente o nuevo (H3)
  date: string; // ISO
  printedTotal: string | null;
  lines: Array<{
    description: string;
    quantity: string;
    unit: 'unidad' | 'kg';
    pricePerUnit: string;
    amount: string;
    product: { id: string } | { name: string }; // existente o nuevo (H4 criterio 1)
  }>;
}
```

**Consulta (nuevo módulo `groceries`, sin relación con `receipt-import` — mismo criterio de separación lectura/escritura que `wealth`/`stock-import`):**

| Método y ruta | Descripción |
|---|---|
| `GET /supermarkets` | Lista para el desplegable de H3 criterio 2. |
| `GET /products?search=` | Búsqueda por nombre (autocompletado al emparejar una línea, H4 criterio 1). |
| `GET /products/:id/prices` | H4 criterio 3: precio (`pricePerUnit` + `unit`) de ese producto en cada supermercado y fecha, ordenado ascendente por precio. |
| `GET /receipts` | H5 criterio 1: listado (fecha desc.) con supermercado y `printedTotal`. |
| `GET /receipts/:id` | H5 criterio 2: detalle con sus líneas y el producto emparejado de cada una. |

Las cuatro rutas de consulta llevan los mismos guards (`AuthGuard`, `RequireActiveUserGuard`) y filtran siempre por `userId` (constitution §2).

## 4. Pipeline de imagen → texto (revisado: Google Cloud Vision, ver nota de implementación de §2)

1. Se codifica el buffer de la imagen en base64, tal cual llega del `multipart/form-data` — sin recorte, sin escala de grises, sin upscale ni autocontraste (innecesarios con Vision, a diferencia de Tesseract).
2. `POST https://vision.googleapis.com/v1/images:annotate?key=<GOOGLE_CLOUD_VISION_API_KEY>` con `features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]` (el modo de Vision pensado para bloques densos de texto como recibos/documentos, no `TEXT_DETECTION`, pensado para texto disperso en fotos) e `imageContext: { languageHints: ['es'] }`.
3. Si Google responde con un HTTP no-2xx, o con un `responses[0].error`, se lanza un error claro (mensaje real de Google incluido) — sin reintentos automáticos, misma filosofía de "fallar con un mensaje claro" que el resto de integraciones externas de la app.
4. El texto resultante es `responses[0].fullTextAnnotation.text` (cadena única con saltos de línea, misma forma que la salida de `tesseract ... stdout` que ya esperaba el parseo — **`receipt-import.parsing.ts` no cambia nada**, es agnóstico al motor). `''` si Vision no reconoce ningún texto (imagen ilegible, H1 criterio 4).
5. El texto plano resultante pasa al parseo (§5).

## 5. Parseo del texto OCR a líneas estructuradas (heurístico, best-effort — H1 criterio 4)

No puede ser un parseo determinista como el del CSV de spec 033 — es la razón de ser de H2. Reglas, en este orden, sobre las líneas de texto entre la cabecera ("Descripción...Imp") y la línea de TOTAL:

1. **Línea por peso** (dos líneas físicas): la línea *siguiente* a una línea de producto contiene un patrón `<número> kg` seguido de `<número>[,.]\d{2,3}\s*€?/?kg` — se combinan en una sola línea con `unit: 'kg'`, `quantity` = el número antes de "kg", `pricePerUnit` = el número junto a "kg", `amount` = el último número de esa segunda línea.
2. **Línea simple con dos importes** (p. ej. `2 NACHOS 0,90 1,80`): si tras quitar la cantidad inicial quedan **dos** números con forma de precio (`\d+[,.]\d{2}`) al final de la línea, el primero es `pricePerUnit` y el segundo `amount`.
3. **Línea simple con un importe**: el único número con forma de precio al final es `amount`; `pricePerUnit = amount / quantity` (`quantity` es el dígito inicial de la línea, o 1 si no hay ninguno).
4. **`unit` por defecto es `'unidad'`** salvo que se haya aplicado la regla 1.
5. Una línea que no encaja en ninguna regla **se descarta silenciosamente** de la vista previa — no aparece como línea rota ni bloquea nada; Diego la añade a mano en H2 criterio 2 si nota que falta.

Esto es exactamente lo verificado a mano contra el ticket real de `spec.md` §1 (incluida la línea `2 NACHOS` que ahí salió mal fusionada — la regla 2 existe precisamente para ese caso).

## 6. Detección de supermercado, fecha y total

- **Supermercado**: se normaliza (minúsculas, sin tildes, `normalizeText` ya existente, reutilizada igual que en spec 033 §6) cada una de las primeras 5 líneas del texto OCR y se compara contra los supermercados ya existentes del usuario. Si hay coincidencia exacta, `matchedId` se rellena; si no, `suggestedName` es la primera línea no vacía del ticket tal cual (normalmente el nombre del comercio, como en la prueba real "MERCADONA, S.A.") para que Diego la confirme o corrija en H3 criterio 3.
- **Fecha**: primer patrón `\d{2}/\d{2}/\d{4}` encontrado en el texto, convertido a ISO por posición de carácter — mismo criterio que spec 033 §5 (no `new Date(string)`, ambiguo según locale).
- **Total**: primera línea que contiene la palabra "TOTAL" (insensible a mayúsculas) seguida de un número con forma de precio. Se devuelve tal cual en `printedTotal`, **nunca se usa para validar ni bloquear** (`spec.md` H2 criterio 3 y §1: es el campo con más probabilidad real de salir mal).

## 7. Por qué `confirm` no vuelve a subir la imagen (a diferencia de spec 003/032/033)

Esas importaciones son deterministas: volver a parsear el mismo fichero da siempre el mismo resultado, así que no hace falta guardar estado entre `preview` y `confirm` (spec 003 plan.md §3 decisión 3). El OCR **no** es determinista de esa forma — y H2 exige explícitamente que lo que se guarda sea lo que Diego corrigió en pantalla, no un segundo intento de lectura de la misma foto. Por eso `confirm` recibe el `ConfirmReceiptDto` ya editado (§3) como única fuente de verdad; la imagen no vuelve a tocarse tras `preview`.

## 8. Emparejamiento con supermercados y productos ya existentes (H3, H4 criterio 1-2)

Mismo algoritmo, ya usado en spec 033 §6 para acciones, aplicado dos veces (independiente una de otra):

- **Supermercado** (al confirmar): si `supermarket` llega como `{ id }`, se verifica que pertenece al usuario (404 si no); si llega como `{ name }`, se crea uno nuevo. No hay caso "ambiguo" aquí — a diferencia de acciones, no hay dos campos (como banco custodia) que puedan multiplicar coincidencias, así que H3 no necesita un estado "ambiguous": simplemente `matchedId` es de una sola coincidencia exacta o `null`.
- **Producto** (por línea, tanto en `preview` para sugerir como en `confirm` para resolver): mismo criterio, `normalizeText` sobre `products.name` del usuario. 0 coincidencias → se sugiere/crea nuevo con el nombre de la línea; 1 coincidencia → se sugiere/reutiliza; **no existe el caso "≥2 coincidencias"** porque `products.name` es el único campo del catálogo (a diferencia de acciones, banco+nombre) — la propia constraint de negocio en `ProductsService`-equivalente (si se crea) evitaría duplicados por nombre normalizado igual que `BankAccountsService`/`StocksService`, así que nunca puede haber dos productos con el mismo nombre normalizado del mismo usuario.

## 9. Confirmación — todo o nada

`confirm()` dentro de un único `db.transaction()`:

1. Resuelve `supermarketId` (crea si `{ name }`, verifica pertenencia si `{ id }`).
2. `INSERT` en `receipts` (`userId`, `supermarketId`, `date`, `printedTotal`).
3. Por cada línea del DTO: resuelve `productId` (crea si `{ name }`, verifica pertenencia si `{ id }`) e inserta en `receiptLines`.
4. Cualquier error revierte toda la transacción y se traduce a `BadRequestException` con el mensaje real de Postgres — mismo patrón que `StockImportService`/`DataImportService`.

**No hay detección de "ticket duplicado"** (mismo supermercado+fecha+total ya importado antes). A diferencia de las importaciones por fichero (spec 003/012/033), aquí Diego ve y corrige cada línea a mano en la propia pantalla (H2) antes de confirmar — una reimportación accidental del mismo ticket sería visible en ese momento (los productos y precios repetidos saltarían a la vista), no silenciosa como una recarga de fichero completo. Si en la práctica llega a pasar, se añade como mejora futura; no se resuelve en esta spec.

## 10. Despliegue (Raspberry Pi, `backend/Dockerfile`)

**Revisado:** sin `sharp` ni Tesseract, no hace falta ningún cambio en el `Dockerfile` más allá de lo que ya traía antes de esta spec (`python3 build-essential` para `argon2`, sin relación con el OCR). El único requisito de despliegue nuevo es la variable de entorno `GOOGLE_CLOUD_VISION_API_KEY` en el `.env` de producción — sin ella, `ReceiptImportModule` arranca igual, pero `POST /receipt-import/preview` responde 503 hasta que se configure.

## 11. Frontend

Nueva entrada de primer nivel en `AppLayout.tsx` (mismo patrón que "Ingresos y gastos", no anidada dentro de "Resumen Patrimonio" — esto no es patrimonio, es comparación de gasto):

```ts
{
  to: '/tickets',
  end: false,
  label: 'Tickets de supermercado',
  icon: '🧾',
  children: [
    { to: '/tickets/importar', end: true, label: 'Importar ticket', icon: '📷' },
    { to: '/tickets', end: true, label: 'Historial', icon: '📋' },
    { to: '/tickets/productos', end: false, label: 'Comparar precios', icon: '⚖️' },
  ],
}
```

- **`ReceiptImportPage.tsx`** (`/tickets/importar`): selector de fichero de imagen estándar (`<input type="file" accept="image/*">`, **sin** `capture` — ese atributo fuerza la cámara directamente en algunos navegadores móviles, sin ofrecer elegir una foto ya existente de la galería; corregido tras una prueba real de Diego). Sin vista de cámara propia (`spec.md` §3), el propio selector del sistema operativo ofrece cámara y galería. Al subir, `POST /receipt-import/preview` y se muestra una tabla editable: supermercado (desplegable + opción "nuevo"), fecha, y una fila por línea (descripción, cantidad, unidad, precio/unidad, importe, producto emparejado — desplegable con búsqueda + opción "nuevo") — cada celda editable (H2 criterio 1), con botón para borrar la línea o añadir una nueva vacía (H2 criterio 2). Se muestra `linesTotal` junto a `printedTotal` con un aviso visual si no coinciden (H2 criterio 3, sin bloquear). Botón "Confirmar" → `POST /receipt-import/confirm` con el DTO ya editado.
- **`ReceiptsPage.tsx`** (`/tickets`): tabla de `GET /receipts` (H5 criterio 1); cada fila enlaza a `ReceiptDetailPage.tsx` (`/tickets/:id`, `GET /receipts/:id`, H5 criterio 2).
- **`ProductPricesPage.tsx`** (`/tickets/productos`): buscador de producto (`GET /products?search=`) y, al elegir uno, tabla de `GET /products/:id/prices` ordenada por precio (H4 criterio 3).

`frontend/src/api/receipt-import.ts` y `frontend/src/api/groceries.ts`, mismo patrón `api.postForm`/`api.get` que el resto de módulos de `api/`.

Sin soporte offline (spec 011): igual que `ImportPage`, esta funcionalidad depende del backend para el OCR y no tiene sentido sin conexión — no se añade a la cola de sincronización.

## 12. Módulos backend

```ts
// backend/src/receipt-import/receipt-import.module.ts
@Module({
  imports: [AuthGuardModule], // escribe en groceries.schema.ts directamente vía DB, sin depender de GroceriesModule — mismo criterio que StockImportModule (spec 033 §11)
  controllers: [ReceiptImportController],
  providers: [ReceiptImportService, ReceiptOcrService, ReceiptParsingService],
})
export class ReceiptImportModule {}

// backend/src/groceries/groceries.module.ts
@Module({
  imports: [AuthGuardModule],
  controllers: [SupermarketsController, ProductsController, ReceiptsController],
  providers: [SupermarketsService, ProductsService, ReceiptsService],
})
export class GroceriesModule {}
```

`ReceiptOcrService` (pipeline §4) y `receipt-import.parsing.ts` (parseo §5-§6) son las dos piezas separadas explícitamente: la primera es la única que toca la red/la API de Vision, la segunda son funciones puras sobre texto (testeables sin llamar a Google de verdad, igual criterio que `stock-import.parsing.ts` en spec 033).

## 13. Tests

**Revisado:** con un motor de pago en la nube, ya no es aceptable (ni gratis) que la suite automática invoque el motor real, a diferencia de la versión con Tesseract.

- **Unit**: `receipt-import.parsing.spec.ts` — cada regla de §5 con líneas de texto sintéticas (incluida la línea de dos importes y la de peso), detección de fecha/total/supermercado (§6), sin llamar a ningún servicio externo. `receipt-ocr.service.spec.ts` — mockea `global.fetch`: respuesta con texto, respuesta sin texto (imagen ilegible), HTTP no-2xx, `responses[0].error`, y sin `GOOGLE_CLOUD_VISION_API_KEY` configurada (503).
- **Integración/e2e**: `receipt-import.e2e-spec.ts` sobreescribe el provider `ReceiptOcrService` (`overrideProvider(ReceiptOcrService).useValue(...)` de `@nestjs/testing`) con un doble cuyo `extractText` devuelve texto ya preparado — cubre el pipeline completo (`preview`+`confirm`, emparejamiento, aislamiento) sin red ni coste; la imagen subida en el `multipart/form-data` puede ser cualquier buffer con `Content-Type` de imagen, su contenido real ya no importa para el resultado del test.
- **Backend `groceries`**: tests de servicio para los 5 endpoints de consulta (§3), incluido aislamiento por `userId` (constitution §2: un usuario nunca ve supermercados/productos/tickets de otro).
- **Frontend**: `ReceiptImportPage.test.tsx` (preview/confirm mockeados, edición de una línea, aviso de total no coincidente), `ProductPricesPage.test.tsx`.

## 14. Datos de prueba

El ticket real fotografiado por Diego (sección 1 de `spec.md`) no se incorpora al repositorio — mismo criterio que el CSV real de spec 033 §13. Los tests de parseo usan texto sintético que reproduce los mismos patrones ya verificados (líneas por unidad, por peso, con dos importes, cabecera y total); los tests de integración usan ese mismo texto como respuesta simulada de `ReceiptOcrService` (§13), sin necesitar ya una imagen realista.

## 15. Fuera de este plan

Igual que `spec.md` §3: sin crear Movimientos/gastos, sin código de barras, sin fusión automática de nombres de producto, sin conversión de divisa/unidad, sin vista de cámara propia, sin compartir datos entre usuarios.

---
**Siguiente paso:** revisar este plan con Diego (especialmente §5, el parseo heurístico — es la parte con más incertidumbre real — y §10, el riesgo de `sharp` en el Raspberry Pi) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
