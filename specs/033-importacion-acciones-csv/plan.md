# Plan 033 — Importación de posiciones de acciones desde CSV (Investing.com)

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1-H5)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos

**No se añade ninguna tabla ni columna nueva.** Reutiliza `stocks`, `stockPurchases`, `stockSales`, `stockValuations` tal cual las dejó spec 020/031 (`backend/src/db/schema/wealth.schema.ts`). No hay tabla de "historial de importaciones" — igual que spec 003, el flujo es sin estado en el servidor entre `preview` y `confirm` (el CSV se vuelve a subir en `confirm`, mismo criterio ya aceptado en spec 003 plan.md §3 decisión 3).

## 2. Librería nueva

**`csv-parse`** (paquete `csv-parse/sync`, de la familia `node-csv`) para el parseo de líneas/celdas con comillas — todas las celdas del fichero real van entre comillas, incluidas las que no lo necesitarían estrictamente, así que hace falta un parser de verdad, no un `split(',')`. Comprobar `npm audit` al instalar (T1.1), mismo criterio que spec 003 §2 con `exceljs`/`xlsx` — si aparece algo equivalente al problema de SheetJS, se reconsidera antes de seguir.

## 3. Endpoints (mismo patrón que `ImportController`, spec 003)

| Método y ruta | Guard | Descripción |
|---|---|---|
| `POST /stock-import/preview` | `AuthGuard`, `RequireActiveUserGuard` | H1. `multipart/form-data`, campo `file` (`.csv`, máx. 10 MB). Parsea y calcula el resumen sin escribir nada. |
| `POST /stock-import/confirm` | ídem | H1-H5. Mismo campo `file`, se vuelve a subir. Repite exactamente el mismo parseo/emparejamiento que `preview` dentro de una `db.transaction()`, e inserta lo que corresponda. |

```ts
interface StockImportSummary {
  stocks: StockImportRowSummary[];
  totals: { newStocks: number; existingStocks: number; ambiguousStocks: number };
}
interface StockImportRowSummary {
  name: string;               // columna "Nombre" del CSV, tal cual
  status: 'new' | 'existing' | 'ambiguous';
  custodyBank: string | null; // banco existente reutilizado, "-" si es nueva, null si es ambigua (no se importa nada de esta fila)
  purchases: TableImportCount;
  sales: TableImportCount;
  valuations: TableImportCount;
}
interface TableImportCount { total: number; toImport: number; alreadyExisting: number }
```

`TableImportCount` es deliberadamente la misma forma que `TableImportSummary` de spec 032 (`data-import.types.ts`) — incluso el nombre, para no inventar un segundo vocabulario para "cuántos nuevo/cuántos ya existía" en la misma aplicación; no se reutiliza el tipo en sí (vive en un módulo sin relación) porque acoplar `stock-import` a `data-import` solo para compartir una interfaz de 3 campos no aporta nada.

## 4. Estructura exacta del CSV (verificada contra el fichero real, no supuesta)

Fichero de Investing.com ("Resumen de posiciones"), codificación UTF-8, todas las celdas entre comillas, números en formato mixto (ver §5). Tres secciones dentro del mismo fichero, cada una detectada por su título — **no por número de fila fijo** (a diferencia del Excel de spec 003, aquí no hay garantía de que el número de posiciones/filas de totales sea siempre el mismo, así que localizar por título es más robusto que contar filas):

- Una fila de una sola celda con el texto exacto `Resumen de posiciones` marca el inicio de la sección 1. La fila siguiente no vacía es su cabecera; los datos son todas las filas siguientes hasta la primera fila vacía.
- Igual para `Posiciones abiertas` (sección 2) y `Posiciones cerradas` (sección 3).
- Las filas de totales entre secciones (`Val. mercado`, `B/P posic. abiertas`, ...) no se leen nunca — quedan fuera porque la lectura de cada sección para en la primera fila vacía que seure inmediatamente a sus datos, antes de llegar a esos totales.

Si falta cualquiera de las 3 secciones, o su cabecera no contiene todas las columnas que hacen falta (tabla siguiente), se rechaza con `BadRequestException` (H1 criterio 3) — igual que spec 003 con la hoja "Ingresos"/"Gastos".

Columnas usadas por sección (localizadas por **nombre de cabecera**, no por posición fija — el resto de columnas de cada sección, como `Beta`, `PER`, `Horario ampliado`..., se ignoran):

| Sección | Columnas usadas |
|---|---|
| Resumen de posiciones | `Nombre`, `Símbolo`, `Precio actual` |
| Posiciones abiertas | `Nombre`, `Símbolo`, `Fecha apertura`, `Cantidad`, `Precio entrada` |
| Posiciones cerradas | `Nombre`, `Símbolo`, `F. apertura`, `Cantidad`, `Precio entrada`, `Fecha cierre`, `Precio cierre` |

## 5. Parseo de números y fechas (regla real encontrada, asimétrica entre columnas)

Verificado celda a celda contra el fichero real: **la columna `Cantidad` no usa el mismo formato que las columnas de precio.**

- `Cantidad` (nº de acciones): número con **punto como separador decimal, sin separador de miles** — p. ej. `1420.00000000` (mil cuatrocientas veinte acciones, no 1,42), `3490.00000000`. Se parsea como `parseFloat` directo.
- `Precio entrada` / `Precio cierre` / `Precio actual` (importes): formato español — punto de miles, coma decimal — p. ej. `1.014,200` = 1014,200. Se parsea quitando los puntos y sustituyendo la coma por punto, igual criterio que `import/import.parsing.ts` (`parseAmount`) ya usa para el Excel, adaptado a que aquí sí puede haber separador de miles (a diferencia del Excel, donde el importe ya llega como número de celda).

Confundir ambas reglas rompería exactamente los casos con más de 3 dígitos enteros (p. ej. `IAG`, `Telefónica`, `Repsol`, con cantidades > 1000) — verificado explícitamente contra esas filas del fichero real antes de fijar esta regla.

**Fechas** (`Fecha apertura`/`F. apertura`/`Fecha cierre`, formato `dd/mm/aaaa` en el CSV) se convierten a `aaaa-mm-dd` (columna `date` de Postgres) con un parseo directo por posición de carácter — no `new Date(string)` (ambiguo entre `dd/mm` y `mm/dd` según locale del runtime).

## 6. Algoritmo de emparejamiento con acciones ya existentes (H3)

1. Se listan las acciones ya existentes del usuario (`stocks.userId = userId`) una sola vez al principio de `preview`/`confirm`.
2. Se recopila el conjunto de nombres distintos (columna `Nombre`) que aparecen en las secciones "Posiciones abiertas" y "Posiciones cerradas" del CSV — cada nombre distinto es una posible acción a crear o reutilizar.
3. Cada nombre del CSV se normaliza (minúsculas, sin tildes, espacios recortados — función `normalizeText`, extraída de `import/import.parsing.ts` a `common/normalize-text.util.ts` para reutilizarla aquí sin duplicar la misma lógica de 3 líneas dos veces; `import/import.parsing.ts` pasa a importarla en vez de tener su propia copia).
4. Se compara contra el mismo nombre normalizado de cada acción ya existente del usuario (campo `stock`, ignorando `custodyBank` en la comparación — H3 criterio 1):
   - **0 coincidencias** → `status: 'new'`, `custodyBank: '-'` (H3 criterio 3).
   - **1 coincidencia** → `status: 'existing'`, se reutiliza su `id` y su `custodyBank` real (H3 criterio 1).
   - **≥2 coincidencias** → `status: 'ambiguous'`, no se importa ninguna compra/venta/valoración de esa fila (H3 criterio 2) — se informa en el resumen para que Diego lo resuelva a mano.

## 7. Detección de duplicados (H2, H5 criterio 2)

Sin `id` en el fichero de origen (a diferencia de spec 032), la coincidencia es por contenido — mismo criterio de "coincidencia exacta" que spec 012 H1 criterio 1:

- **Compra**: ya existe si hay una `stockPurchase` de esa acción con el mismo `date`, `shareCount` y `purchasePrice` exactos.
- **Venta**: igual, contra `stockSales` (`date`, `shareCount`, `salePrice`).
- **Valoración**: ya existe si hay una `stockValuation` de esa acción con el mismo `date` (sin comparar el precio — si el precio cambiara para la misma fecha, no debería pasar en la práctica porque `date` es la fecha de importación, siempre "hoy"; se trata iguales por fecha, no se sobrescribe ni se duplica).
- Una acción `status: 'new'` no tiene historial previo — todas sus filas del CSV son siempre "a importar", nunca "ya existente".
- Estas comprobaciones se hacen también dentro de la propia sesión del CSV (dos lotes idénticos dentro del mismo fichero, si los hubiera) contando lo que ya se ha decidido importar en filas anteriores del mismo fichero, no solo contra lo que ya hay en la base — mismo razonamiento que la doble pasada de `categories` en spec 032 plan.md §3.2.1: evita que dos filas iguales dentro del mismo CSV se conviertan en dos inserts en vez de uno.

## 8. Confirmación — todo o nada (mismo criterio que spec 003/032)

`confirm()` dentro de un único `db.transaction()`:

1. Por cada nombre distinto del CSV (orden estable, p. ej. el de aparición): si `status: 'ambiguous'`, se salta entero (no se toca nada de esa acción). Si `status: 'new'`, `INSERT` en `stocks` (`custodyBank: '-'`, `stock: nombre`) y se usa el `id` recién creado. Si `status: 'existing'`, se usa el `id` ya encontrado.
2. Se insertan las compras/ventas/valoraciones no duplicadas (§7) de esa acción, referenciando ese `stockId`.
3. Igual que `DataImportService` (spec 032 §3.3-3.4): se inserta directamente con Drizzle, **sin pasar por `StocksService`/`StockPurchasesService`/etc.** — sus comprobaciones de negocio (p. ej. "no vender más de lo que hay en cartera", spec 031 plan.md §2) no aplican aquí porque cada lote cerrado del CSV trae su propia compra y venta emparejadas 1:1 con el mismo `shareCount` (spec.md H4 criterio 1) — nunca puede generar una venta huérfana o superior a lo comprado. Mismo precedente ya aceptado en spec 032 (`data-import.service.ts`, comentario: "no hace falta un DTO por tabla").
4. Cualquier error de un `INSERT` (constraint, tipo de dato) revierte toda la transacción y se traduce a un `BadRequestException` con el mensaje real de Postgres — mismo patrón que `DataImportService.confirm()`.

## 9. Casos límite a cubrir con tests (verificados contra el fichero real)

- Lote con `Precio entrada` = `0,000` (Vidrala, Viscofan) → se importa con `purchasePrice: '0'`, no se descarta (spec.md §3/§5 decisión 3).
- `Cantidad` > 999 (`IAG`: 1000, 1500, 3490; `Telefónica`: 1420; `Repsol`: 870) → se parsea como miles, no como formato español con separador de miles (§5) — test dedicado por ser la regla más fácil de romper por error.
- Acción que solo aparece en "Posiciones cerradas" (p. ej. `Amadeus`, `Cellnex Telecom`, `Inditex`) → se crea igual (H3 criterio 3, H4 criterio 2), sin ninguna valoración (no aparece en "Resumen de posiciones").
- Mismo nombre normalizado coincide con dos acciones ya existentes del usuario (p. ej. Diego tiene "Santander" dado de alta dos veces bajo dos bancos custodia distintos) → `status: 'ambiguous'`, cero filas importadas de esa acción, señalada en el resumen.
- Reimportar el mismo fichero completo dos veces seguidas → segunda vez, 0 nuevas compras/ventas/valoraciones en todas las acciones (H2 criterio 3).
- Fichero al que le falta la sección "Posiciones cerradas" completa (p. ej. Diego exporta antes de tener nunca una venta) → se importa igual con `Posiciones cerradas` vacía (0 ventas), sin rechazar el fichero — a diferencia de que falte la sección entera con su cabecera, que si sí rechaza (H1 criterio 3); ver nota de implementación pendiente en T-preview: comprobar en el fichero real de Diego (o uno sintético) si Investing.com omite la sección entera o la deja con cabecera y cero filas cuando no hay posiciones cerradas — fija el comportamiento exacto al implementar T1, no asumido aquí.
- CSV con una columna requerida ausente (p. ej. cabecera de "Posiciones abiertas" sin `Fecha apertura`) → 400 claro, nada escrito.
- Aislamiento: todo lo creado pertenece al usuario autenticado; el emparejamiento de H3 solo compara contra las acciones del propio usuario, nunca contra las de otro.

## 10. Frontend

Página nueva `StockImportPage.tsx`, ruta `/patrimonio/acciones/importar` (mismo prefijo que `StockDetailPage`, `/patrimonio/acciones/:id`, spec 020). Enlazada con un botón "Importar desde CSV" en la cabecera de la sección "Acciones" de `WealthPage.tsx` (junto al botón ya existente de añadir acción) — no un ítem nuevo en la navegación principal, es una acción secundaria dentro de una sección ya existente, a diferencia de spec 003/032 (que sí son puntos de entrada de primer nivel).

1. Selector de fichero (`<input type="file" accept=".csv">`) y botón "Validar".
2. Al validar, `POST /stock-import/preview` y se muestra una tabla: una fila por acción del CSV, con su nombre, estado (Nueva / Ya existe, con su banco custodia / Ambigua, sin importar), y cuántas compras/ventas/valoraciones nuevas traería.
3. Botón "Confirmar importación" (deshabilitado si el fichero no es válido) → `POST /stock-import/confirm` con el mismo fichero ya seleccionado, mismo criterio que spec 003 plan.md §3 decisión 3. Tras confirmar, enlace a `/patrimonio` para ver el resultado.

`frontend/src/api/stock-import.ts`: `previewStockImport(file)`/`confirmStockImport(file)`, mismo patrón `fileFormData` + `api.postForm` que `api/import.ts`/`api/data-import.ts`.

## 11. Módulo backend

```ts
// backend/src/stock-import/stock-import.module.ts
@Module({
  imports: [AuthGuardModule], // consulta/escribe stocks/stockPurchases/... directamente vía DB, sin depender de WealthModule/StocksModule (mismo criterio que ImportModule/DataImportModule)
  controllers: [StockImportController],
  providers: [StockImportService],
})
export class StockImportModule {}
```

## 12. Tests

- Backend: `stock-import.e2e-spec.ts`, ficheros CSV sintéticos construidos en el propio test (nunca el CSV real de Diego, ver §13) reproduciendo la estructura de §4 con los casos límite de §9. Unit tests de las funciones puras de parseo (`stock-import.parsing.ts`): parseo de `Cantidad` vs. columnas de precio (§5), localización de secciones por título, fechas `dd/mm/aaaa` → ISO.
- Frontend: `StockImportPage.test.tsx` (preview/confirm mockeados, los tres estados de fila).

## 13. Datos de prueba — misma regla que spec 003 §9

**El CSV real de Diego (`Actual_Holdings_10092026.csv`) contiene datos financieros personales reales y no se incorpora al repositorio bajo ningún concepto.** Los tests construyen CSVs sintéticos con datos inventados que reproducen la misma estructura y los mismos casos límite ya verificados contra el fichero real (§9), nunca el fichero original.

## 14. Fuera de este plan

Igual que `spec.md` §4: sin conversión de divisa, sin importar dividendos, sin fusión difusa de nombres parecidos-no-idénticos, sin adaptarse a otra estructura de columnas, sin editar filas desde la propia pantalla de importación.

---
**Siguiente paso:** revisar este plan con Diego (especialmente §5, la regla de parseo asimétrica, y §6, el criterio de emparejamiento) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.

## 15. Revisión: selección de historiales a importar (H6)

### 15.1 Endpoints — nuevos campos en el mismo `multipart/form-data`

`preview`/`confirm` no cambian de ruta ni de guard; se añaden 3 campos de formulario junto a `file`, leídos con `@Body()` (Nest/multer ya deja los campos de texto de un `multipart/form-data` en `req.body`, separados del fichero):

```ts
// backend/src/stock-import/dto/stock-import-options.dto.ts
export class StockImportOptionsDto {
  @Transform(toBoolean) @IsBoolean() includePurchases!: boolean;
  @Transform(toBoolean) @IsBoolean() includeSales!: boolean;
  @Transform(toBoolean) @IsBoolean() includeValuations!: boolean;
}
```

`toBoolean` interpreta el valor tal como llega de un formulario (siempre texto): `undefined` → `true` (H6 criterio 1, las tres marcadas por defecto — mantiene el comportamiento de H1-H5 si algún cliente no manda estos campos), `'true'`/`true` → `true`, cualquier otra cosa (`'false'`, auscode) → `false`. `ValidationPipe` global ya tiene `transform: true` (`main.ts`), así que el `@Transform` se aplica solo.

### 15.2 Validación "al menos uno marcado" (H6 criterio 4)

No es expresable con decoradores de campo (es una regla entre los tres campos) — se comprueba con una función pequeña al principio de `preview()`/`confirm()`, antes de tocar el fichero:

```ts
private assertAtLeastOneSelected(options: StockImportOptionsDto): void {
  if (!options.includePurchases && !options.includeSales && !options.includeValuations) {
    throw new BadRequestException('Selecciona al menos un historial a importar (compras, ventas o valoraciones).');
  }
}
```

La pantalla (§15.4) ya bloquea este caso sin llamar al servidor — esta comprobación es solo la red de seguridad del lado servidor (por si se llama a la API directamente).

### 15.3 `computeSummary` — aplicar la selección sin tocar el resto del algoritmo

`computeSummary` (plan.md §6-§8) recibe `options` y la usa en dos sitios, sin cambiar nada más de la lógica de emparejamiento (§6) ni de la forma del resumen (§3 — `TableImportCount.total` sigue siendo el nº real de filas del CSV, marcado o no, H6 criterio 2):

1. **No se consulta el historial ya existente de un historial desmarcado** (evita una consulta que no hace falta, no solo una optimización — H6 criterio 3, "ni siquiera para comprobar duplicados"):
   ```ts
   const existingPurchaseKeys = hasExistingHistory && options.includePurchases ? await this.fetchPurchaseKeys(executor, stockId) : new Set<string>();
   // ídem existingSaleKeys/existingValuationKeys con includeSales/includeValuations
   ```
2. **`toImport` es siempre `[]` para un historial desmarcado**, sin pasar por `dedupeAgainstExisting`:
   ```ts
   const purchaseResult = options.includePurchases ? dedupeAgainstExisting(csvPurchases, existingPurchaseKeys, amountKey) : { toImport: [], alreadyExisting: 0 };
   ```
   El bloque `if (write) { ... }` que inserta no cambia — al recibir `toImport: []` para un historial desmarcado, sencillamente no inserta nada de ese historial, sin necesitar una rama `if` adicional.

### 15.4 No crear una acción nueva vacía (H6 criterio 6)

Tras calcular `purchaseResult`/`saleResult`/`valuationResult` para un match `status: 'new'`, si los tres `toImport` están vacíos, no se inserta la fila de `stocks` — el resto del cálculo del resumen (totales reales, `status: 'new'`) sigue igual, solo cambia que no hay `INSERT` en `stocks` ni en sus historiales:

```ts
const nothingToImport = purchaseResult.toImport.length === 0 && saleResult.toImport.length === 0 && valuationResult.toImport.length === 0;
if (write && match.status === 'new' && !nothingToImport) {
  // INSERT en stocks (como ya hacía) y se usa su id para las 3 tablas hijas
}
```

Nota: `totals.newStocks` (plan.md §3) sigue contando esta fila como "nueva" aunque no llegue a crearse — es la clasificación de la fila del CSV (H3), no si terminó insertándose; distinguir ambas cosas con un campo nuevo sería una precisión que hoy nadie necesita (el propio resumen de la fila, con sus 3 `TableImportCount` en 0, ya deja claro que no se creó nada).

### 15.5 Frontend

`StockImportPage.tsx`: 3 checkboxes ("Compras", "Ventas", "Valoraciones", las tres marcadas por defecto) en la sección "1. Seleccionar fichero", antes del botón "Validar". Botón "Validar" deshabilitado si las tres están desmarcadas (H6 criterio 4) — mismo `disabled` que ya usa cuando no hay fichero seleccionado. Cambiar cualquier checkbox descarta la vista previa/resultado actuales exactamente igual que `handleFileChange` (H6 criterio 5) — incluso se maneja con el mismo handler, generalizado.

`frontend/src/api/stock-import.ts`: `previewStockImport`/`confirmStockImport` pasan a aceptar un segundo parámetro `options: StockImportOptions` (`{ includePurchases, includeSales, includeValuations }`), añadido al mismo `FormData` que ya lleva `file` (como texto: `String(value)`).

### 15.6 Tests

- Backend: unit — `assertAtLeastOneSelected` (o el 400 correspondiente desde el endpoint); e2e — desmarcar cada historial por separado deja su `toImport` a 0 sin tocar la base de datos (comprobado con `db.select`), `total` sigue mostrando el nº real; las tres desmarcadas → 400; una acción nueva que solo tendría filas de un historial desmarcado no se crea (`db.select().from(stocks)` no la encuentra).
- Frontend: checkboxes marcados por defecto; desmarcar una y validar llama a `previewStockImport` con esa opción en `false`; las tres desmarcadas deshabilitan "Validar"; cambiar un checkbox tras una vista previa la descarta.

### 15.7 Fuera de esta revisión

- Selección fila a fila (por acción individual) — H6 es una selección global por tipo de historial (compras/ventas/valoraciones), no por acción; seleccionar solo algunas acciones del CSV sigue sin existir (fuera de alcance, spec.md §4).
- Recordar la última selección usada (p. ej. en `localStorage`) — cada importación empieza con las tres marcadas por defecto.
