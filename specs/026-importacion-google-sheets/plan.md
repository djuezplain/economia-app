# Plan — Spec 026 (Importación desde Google Sheets)

**Fase:** 2 de 4

## 1. Modelo de datos

`backend/src/db/schema/import.schema.ts` (fichero nuevo): una tabla, una fila por usuario (1:1), mismo criterio de aislamiento que el resto de la app.

```ts
export const googleSheetsImportConfigs = pgTable('google_sheets_import_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  spreadsheetId: varchar('spreadsheet_id', { length: 200 }).notNull(),
  autoImportEnabled: boolean('auto_import_enabled').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  // Mismo shape que `ImportConfirmResult` (import.service.ts) serializado, o
  // `null` si `lastRunError` no es null (la última ejecución falló antes de
  // poder clasificar nada).
  lastRunResult: jsonb('last_run_result').$type<ImportConfirmResult | null>(),
  lastRunError: text('last_run_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`userId` con `unique()`: un usuario tiene como mucho una hoja configurada (H1 no contempla varias). `lastRunAt`/`lastRunResult`/`lastRunError` se sobrescriben en cada ejecución (manual o automática) — no se guarda histórico de ejecuciones anteriores, solo la última (H3 criterio 3 solo pide ver "la última").

Migración `CREATE TABLE` pura, generada por `drizzle-kit generate` (siguiente número libre en `backend/drizzle/`).

## 2. Credenciales de la cuenta de servicio

Dos variables de entorno nuevas, mismo patrón que `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (auth con Google, spec 001): opcionales por defecto (`''`), para no romper el arranque en entornos donde todavía no se han configurado.

```ts
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY: Joi.string().allow('').default(''),
```

La clave privada se guarda en `.env` con los saltos de línea escapados (`\n`), igual que cualquier clave PEM en una variable de entorno; se desescapan (`.replace(/\\n/g, '\n')`) al leerla.

Reutilizando el mismo criterio que `GoogleConfiguredGuard` (spec 001, auth con Google): un `GoogleSheetsConfiguredGuard` bloquea con 503 los endpoints de este módulo mientras las dos variables estén vacías, en vez de fallar de forma confusa contra la API de Google. El cron (§5) simplemente no se ejecuta si no están configuradas.

**Dependencia nueva:** `google-auth-library` (cliente oficial de Google, ligero — solo autenticación, no todo el SDK `googleapis`) para construir un `JWT` con `client_email`/`private_key` y el scope `https://www.googleapis.com/auth/spreadsheets.readonly`, y obtener un access token. La llamada a la API de Sheets en sí se hace con `fetch` nativo contra `GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values:batchGet`, sin añadir el paquete `googleapis` completo (mucho más pesado y no aporta nada más de lo que se necesita aquí).

## 3. Lectura de la hoja (`GoogleSheetsService`, nuevo)

`backend/src/import/google-sheets.service.ts`:

- `extractSpreadsheetId(input: string): string | null` — función pura: acepta tanto un ID pelado como una URL completa (`https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0`) y extrae el ID con una regex; `null` si no reconoce el formato (H1 criterio 2, error claro antes de llamar a Google).
- `fetchWorkbook(spreadsheetId: string): Promise<ParsedWorkbook>` — pide con `batchGet` los rangos `Ingresos!A1:J1000` y `Gastos!A1:M1000` (mismas columnas que ya usa `import.parsing.ts` para el Excel, spec 003 §4: G-J en Ingresos, H-M en Gastos; 1000 filas de margen, generoso para el volumen real de Diego) con `valueRenderOption: 'FORMATTED_VALUE'`, y mapea cada fila a `RawIncomeRow`/`RawExpenseRow` por posición de columna — **misma forma exacta que produce `parseExcelWorkbook`**, así que `ImportService.classify()` y toda la validación (`import.parsing.ts`) se reutilizan sin ningún cambio.
  - `FORMATTED_VALUE` (que es además el valor por defecto de la API) devuelve fechas y números como el texto ya formateado en la hoja — mismo tipo de dato (`string`) que `parseDate`/la validación de importe ya saben interpretar hoy para celdas de texto (spec 003 §4: "el importe se acepta si la celda es un número o un texto que lo representa"), así que no hace falta ninguna función de parseo nueva.
  - Falta la pestaña "Ingresos" o "Gastos" en la hoja → la API de Sheets devuelve el rango vacío (no un error) para una pestaña inexistente; se detecta comprobando los nombres de pestaña reales (`spreadsheets.get` con `fields=sheets.properties.title` antes del `batchGet`) y se lanza el mismo `InvalidWorkbookError` que ya usa `parseExcelWorkbook` — mensaje idéntico al que ya conoce el usuario de la importación de fichero.
  - Sin acceso (hoja no compartida, ID inexistente, revocado) → la API de Google devuelve 403/404; se traduce a un `GoogleSheetAccessError` propio con el mensaje que consumen H1 criterio 2 y H2 criterio 5.

## 4. Refactor de `ImportService` (mínimo, sin cambiar comportamiento existente)

`preview()`/`confirm()` (fichero `.xlsx`) siguen igual. Se extrae el tramo común a partir de un `ParsedWorkbook` ya obtenido (antes solo alcanzable vía `parseOrThrow(buffer)`), en un método nuevo:

```ts
async importWorkbook(userId: string, workbook: ParsedWorkbook): Promise<ImportConfirmResult> { /* mismo cuerpo que confirm(), a partir de `classify()` */ }
```

`confirm(userId, buffer)` pasa a ser `this.importWorkbook(userId, await this.parseOrThrow(buffer))`. El nuevo flujo de Google Sheets (§5) llama a `importWorkbook` directamente con el `ParsedWorkbook` que produce `GoogleSheetsService.fetchWorkbook()` — cero duplicación de la lógica de clasificación/dedup/inserción (specs 003 y 012 se heredan intactas).

## 5. Endpoints

Controller nuevo `backend/src/import/google-sheets-import.controller.ts`, montado en `/import/google-sheet`, mismos guards que `/import/excel` más `GoogleSheetsConfiguredGuard`:

- `GET /import/google-sheet/config` → `{ serviceAccountEmail, spreadsheetId: string | null, autoImportEnabled, lastRun: { at, importedIncome, importedExpense, skippedDuplicateIncome, skippedDuplicateExpense, invalidIncomeCount, invalidExpenseCount, error } | null }`. `serviceAccountEmail` sale directo de la variable de entorno (H1 criterio 1: instrucciones con el email fijo), no se persiste.
- `PUT /import/google-sheet/config` — body `{ spreadsheetId: string }` (acepta URL o ID, `extractSpreadsheetId` los normaliza). Antes de guardar, llama a `fetchWorkbook` una vez a modo de comprobación (H1 criterio 2); si falla, 400 con el motivo, sin guardar nada. Si funciona, hace upsert de la fila (crea si no existía, actualiza `spreadsheetId` si ya existía) — no toca `autoImportEnabled`.
- `DELETE /import/google-sheet/config` → borra la fila (H1 criterio 3). Los movimientos ya importados no se tocan (no hay FK desde `transactions` hacia esta tabla).
- `PATCH /import/google-sheet/config/auto-import` — body `{ enabled: boolean }`. 400 si no hay `spreadsheetId` configurado todavía (H3 criterio 1: hace falta la hoja antes de poder activarlo).
- `POST /import/google-sheet/run` — H2: ejecuta `fetchWorkbook` + `importWorkbook` para el usuario autenticado, actualiza `lastRunAt`/`lastRunResult`/`lastRunError` de su fila, y devuelve el mismo `ImportConfirmResult` que ya devuelve `POST /import/excel/confirm` (mismo shape, consistencia con la UI existente). 400 si no hay hoja configurada.

## 6. Ejecución automática (cron)

`backend/src/import/google-sheets-import.scheduler.ts`, usando `@nestjs/schedule` (dependencia nueva — no usado hoy en el proyecto):

```ts
@Cron('0 */4 * * *')
async runDueImports() { /* ver abajo */ }
```

- Consulta `googleSheetsImportConfigs` con `autoImportEnabled = true`, `join` con `users` filtrando `status = 'ACTIVE'` (mismo criterio que `RequireActiveUserGuard`, H3 criterio 5 no debe procesar cuentas deshabilitadas/pendientes).
- Por cada fila, ejecuta la misma rutina de `POST /import/google-sheet/run` (extraída a un método compartido de `GoogleSheetsImportService` que llaman tanto el controller como el scheduler) — un fallo de un usuario (hoja inaccesible, error de red) se captura, se guarda en su `lastRunError` y **no interrumpe** el resto del bucle (H3 criterio 5).
- **Lock en memoria por `userId`** (un `Set<string>` con los usuarios en curso, mismo criterio "en memoria, una sola instancia" ya documentado en la constitution para el rate-limit guard): evita que una ejecución manual (`POST /run`) y el cron se solapen para el mismo usuario y dupliquen lectura/inserción a la vez. Si hay solape, la segunda llamada devuelve 409 ("ya hay una importación en curso").
- Si `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`/`PRIVATE_KEY` no están configuradas, el cron no hace nada (mismo criterio que `GoogleSheetsConfiguredGuard`).

## 7. Casos límite

- **Hoja compartida pero le faltan las pestañas esperadas o tienen otro nombre**: mismo `InvalidWorkbookError` que ya conoce el usuario de la importación de fichero (§3).
- **Se revoca el permiso después de configurarla**: la siguiente ejecución (manual o automática) falla con `GoogleSheetAccessError`, queda en `lastRunError`; no borra la configuración (H1 criterio 3 solo la borra si el usuario lo pide explícitamente).
- **El usuario desactiva la automática pero no borra la hoja**: `autoImportEnabled = false`, `spreadsheetId` se mantiene — `POST /run` (manual) sigue funcionando igual (H3 criterio 4).
- **Ejecución manual y automática solapadas para el mismo usuario**: lock en memoria (§6), 409 en la que llega segunda.
- **Cuenta de usuario deshabilitada o pendiente de verificar**: el cron la salta (§6); el endpoint manual ya está detrás de `RequireActiveUserGuard`, así que tampoco es alcanzable.

## 8. Frontend

- `api/google-sheets-import.ts` — nuevo, los 5 endpoints de §5.
- `ImportPage.tsx` — nueva sección "Importar desde Google Sheets", junto a la sección ya existente de subir fichero `.xlsx`:
  - Sin hoja configurada: campo para pegar URL/ID + instrucciones ("comparte tu hoja con **`{serviceAccountEmail}`** como Lector") + botón guardar (usa `PUT /config`, muestra el error tal cual si falla la comprobación de acceso).
  - Con hoja configurada: se ve el ID/URL guardado, botón "Importar ahora" (`POST /run`, muestra el mismo resumen que ya renderiza la importación de fichero tras confirmar), interruptor "Importación automática cada 4 horas" (`PATCH /auto-import`), y un bloque con el resultado de la última ejecución (`lastRun`) — fecha, contadores, o el error si falló. Botón para quitar la hoja (`DELETE /config`, con confirmación por ser irreversible en el sentido de "hay que volver a compartir y comprobar acceso").

## 9. Fuera de este plan

- No se toca `/import/excel` (subir fichero) ni su flujo de previsualización — sigue existiendo tal cual, como alternativa manual sin Google Sheets.
- No se añade histórico de ejecuciones (solo la última) — igual que se decidió en spec.md §5.4, ampliarlo a un log es una mejora futura si se prioriza.
- No se gestiona cuota de la Google Sheets API de forma explícita (retries, backoff) — el nivel gratuito es de sobra para el volumen previsto (conversación previa); un error de cuota se trata como cualquier otro fallo de lectura.

---
**Siguiente paso:** revisar este plan con Diego; con su aprobación, se genera `tasks.md` con el desglose en tareas pequeñas y verificables.
