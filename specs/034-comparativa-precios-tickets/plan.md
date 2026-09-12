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

- **`sharp`** (recorte, escala de grises, upscale, autocontraste — mismas operaciones que la prueba con Pillow de `spec.md` §1, ahora en Node). Módulo nativo con binarios precompilados para `linux-arm64`; se verifica explícitamente en el Raspberry Pi de despliegue (§10) antes de dar la tarea por cerrada — mismo tipo de riesgo que `argon2` (Dockerfile actual ya instala `python3 build-essential` como red de seguridad si hiciera falta compilar).
- **`tesseract-ocr` + `tesseract-ocr-spa`**: no es un paquete npm, es un binario del sistema operativo que el backend invoca como subproceso (`child_process.execFile`). Se añade al `Dockerfile` del backend vía `apt-get install` (Debian bookworm, mismo paquete y versión ya verificados en la prueba real de `spec.md` §1). Fuera de Docker (desarrollo local), cada máquina necesita instalarlo aparte (`brew install tesseract tesseract-lang` en macOS, documentado en el README del backend).

## 3. Endpoints

**Importación (mismo patrón que `StockImportController`, spec 033):**

| Método y ruta | Guard | Descripción |
|---|---|---|
| `POST /receipt-import/preview` | `AuthGuard`, `RequireActiveUserGuard` | H1. `multipart/form-data`, campo `file` (imagen, `.jpg`/`.jpeg`/`.png`, máx. 15 MB — fotos de móvil modernas superan el límite de 10 MB ya usado para CSV/Excel). Ejecuta el pipeline completo (§4-§6) y devuelve la vista previa. No escribe nada. |
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

## 4. Pipeline de imagen → texto (receta verificada en `spec.md` §1, ahora con `sharp`)

1. **Recorte del papel**: en escala de grises, se calculan las columnas y filas cuyo brillo medio supera un umbral (mismo método que el script de prueba: `mean > 140` sobre 0-255) y se recorta al rectángulo resultante. Si el recorte da un área menor al 5 % de la imagen original (fallo de detección — p. ej. una foto ya muy recortada o con el ticket ocupando toda la imagen), se usa la imagen completa sin recortar en vez de un recorte absurdo.
2. **Escala de grises + upscale x3 + autocontraste** — sin binarizar (verificado que empeora, `spec.md` §1).
3. `execFile('tesseract', [tmpFile, 'stdout', '-l', 'spa', '--psm', '6'])` sobre un fichero temporal (Tesseract CLI no acepta un buffer por stdin de forma fiable en todas las versiones; se escribe a `os.tmpdir()` y se borra en un `finally`).
4. El texto plano resultante pasa al parseo (§5).

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

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
    tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*
```

Riesgo a verificar en la primera tarea de implementación (no asumido aquí): que `sharp` resuelva un binario precompilado para `linux-arm64` sobre `node:22-bookworm-slim` sin necesitar `libvips` adicional — es una librería muy usada en ese target, pero no hay una prueba real todavía contra el Raspberry Pi de Diego (a diferencia del resto de esta spec, que sí se verificó contra un ticket real).

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

- **`ReceiptImportPage.tsx`** (`/tickets/importar`): selector de fichero de imagen (`<input type="file" accept="image/*" capture="environment">` — `capture` abre la cámara directamente en móvil, sin construir una vista de cámara propia, coherente con `spec.md` §4 "sin vista de cámara integrada"). Al subir, `POST /receipt-import/preview` y se muestra una tabla editable: supermercado (desplegable + opción "nuevo"), fecha, y una fila por línea (descripción, cantidad, unidad, precio/unidad, importe, producto emparejado — desplegable con búsqueda + opción "nuevo") — cada celda editable (H2 criterio 1), con botón para borrar la línea o añadir una nueva vacía (H2 criterio 2). Se muestra `linesTotal` junto a `printedTotal` con un aviso visual si no coinciden (H2 criterio 3, sin bloquear). Botón "Confirmar" → `POST /receipt-import/confirm` con el DTO ya editado.
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

`ReceiptOcrService` (pipeline §4) y `ReceiptParsingService` (parseo §5-§6) son las dos piezas separadas explícitamente: la primera es la única que toca `sharp`/`tesseract`/el sistema de ficheros temporal, la segunda son funciones puras sobre texto (testeables sin invocar Tesseract de verdad, igual criterio que `stock-import.parsing.ts` en spec 033).

## 13. Tests

- **Unit**: `receipt-import.parsing.spec.ts` — cada regla de §5 con líneas de texto sintéticas (incluida la línea de dos importes y la de peso), detección de fecha/total/supermercado (§6), sin invocar Tesseract real.
- **Integración/e2e**: `receipt-import.e2e-spec.ts` contra una imagen sintética generada en el propio test (un PNG con texto renderizado a mano con `sharp`/`canvas`, no una foto real) para el pipeline completo incluyendo `confirm`; y contra el texto ya extraído (mockeando `ReceiptOcrService`) para cubrir más casos de parseo sin depender de que Tesseract esté instalado en el entorno de CI.
- **Backend `groceries`**: tests de servicio para los 5 endpoints de consulta (§3), incluido aislamiento por `userId` (constitution §2: un usuario nunca ve supermercados/productos/tickets de otro).
- **Frontend**: `ReceiptImportPage.test.tsx` (preview/confirm mockeados, edición de una línea, aviso de total no coincidente), `ProductPricesPage.test.tsx`.

## 14. Datos de prueba

El ticket real fotografiado por Diego (sección 1 de `spec.md`) no se incorpora al repositorio — mismo criterio que el CSV real de spec 033 §13. Los tests usan imágenes/textos sintéticos que reproducen los mismos patrones ya verificados (líneas por unidad, por peso, con dos importes, cabecera y total).

## 15. Fuera de este plan

Igual que `spec.md` §3: sin crear Movimientos/gastos, sin código de barras, sin fusión automática de nombres de producto, sin conversión de divisa/unidad, sin vista de cámara propia, sin compartir datos entre usuarios.

---
**Siguiente paso:** revisar este plan con Diego (especialmente §5, el parseo heurístico — es la parte con más incertidumbre real — y §10, el riesgo de `sharp` en el Raspberry Pi) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
