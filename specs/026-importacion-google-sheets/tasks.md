# Tasks — Spec 026 (Importación desde Google Sheets)

**Fase:** 3 de 4

## Grupo 1 — Esquema, migración y configuración

- **T1.1** — `googleSheetsImportConfigs` en `backend/src/db/schema/import.schema.ts` (fichero nuevo). Migración `CREATE TABLE` generada con `drizzle-kit generate`, aplicada a los entornos local (dev y test).
- **T1.2** — `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` añadidas a `env.validation.ts` (opcionales, `''` por defecto) y a `.env.example`. Dependencias nuevas instaladas: `google-auth-library`, `@nestjs/schedule`.

## Grupo 2 — Lectura de la hoja y refactor de importación

- **T2.1** — `GoogleSheetsService`: `extractSpreadsheetId()` (función pura — URL completa, ID pelado, y formato irreconocible → `null`; tests unitarios con los tres casos y variantes reales de URL de Google Sheets). `fetchWorkbook()`: autenticación JWT con `google-auth-library`, comprobación de pestañas (`spreadsheets.get`) → `InvalidWorkbookError` si falta "Ingresos" o "Gastos", `batchGet` de los rangos ya usados por el Excel y mapeo a `RawIncomeRow`/`RawExpenseRow`, errores de acceso (403/404) → `GoogleSheetAccessError`. Tests con la llamada `fetch` a la API de Sheets mockeada (éxito, pestaña faltante, sin acceso, ID inexistente).
- **T2.2** — Refactor de `ImportService`: extraído `importWorkbook(userId, workbook)` a partir del cuerpo de `confirm()`; `confirm()` pasa a llamarlo tras `parseOrThrow()`. Sin cambios de comportamiento — `import.e2e-spec.ts` existente sigue en verde tal cual, sin modificar sus expectativas.
- **T2.3** — `GoogleSheetsConfiguredGuard` (503 si las credenciales están vacías), mismo patrón que `GoogleConfiguredGuard` (spec 001).

## Grupo 3 — Endpoints y ejecución manual

- **T3.1** — `GoogleSheetsImportService`: `getConfig()`, `saveConfig()` (comprueba acceso llamando a `fetchWorkbook` antes de guardar, upsert), `setAutoImport()` (400 sin hoja configurada), `removeConfig()`, `runNow()` (lock en memoria por `userId`, 409 si ya hay una en curso, actualiza `lastRunAt`/`lastRunResult`/`lastRunError`, devuelve `ImportConfirmResult`).
- **T3.2** — `GoogleSheetsImportController` (`/import/google-sheet`, `AuthGuard` + `RequireActiveUserGuard` + `GoogleSheetsConfiguredGuard`) + DTOs (`SaveGoogleSheetConfigDto`, `SetAutoImportDto`). Tests e2e: 401, aislamiento entre usuarios, guardar hoja válida, guardar hoja inaccesible (400, no persiste), activar automática sin hoja (400), activar/desactivar con hoja, importar ahora (movimientos creados, duplicados de una segunda ejecución saltados igual que spec 012), 409 en solape, borrar configuración (auto-import queda desactivado de facto al no existir fila).

## Grupo 4 — Ejecución automática

- **T4.1** — `GoogleSheetsImportScheduler` (`@Cron('0 */4 * * *')`): consulta configs con `autoImportEnabled = true` y usuario `status = 'ACTIVE'`, invoca el mismo método que usa `runNow()` para cada una, captura y guarda el error de una fila sin interrumpir las demás. No se ejecuta si las credenciales de servicio no están configuradas. Tests unitarios con el repositorio/servicio mockeados (varios usuarios, uno falla) — no depende de esperar 4 horas reales.

## Grupo 5 — Frontend

- **T5.1** — `api/google-sheets-import.ts`: los 5 endpoints del Grupo 3.
- **T5.2** — `ImportPage.tsx`: nueva sección "Importar desde Google Sheets" junto a la de subir fichero `.xlsx` (que no se toca). Tres estados: sin hoja configurada (campo + instrucciones con el email de la cuenta de servicio + guardar), con hoja configurada (ID/URL guardado, botón "Importar ahora", interruptor de automática, botón quitar hoja), y bloque de resultado de la última ejecución (reutiliza el componente de resumen que ya usa la importación de fichero al confirmar, si es directamente reutilizable).
- **T5.3** — `ImportPage.test.tsx` actualizado: configurar hoja (éxito y error de acceso), importar ahora (resumen mostrado), activar/desactivar automática, quitar hoja.

## Grupo 6 — Cierre

- **T6.1** — `npm test` (backend y frontend) y `tsc -b` (backend y frontend) en verde.
- **T6.2** — Revisión manual: crear una Google Sheet de prueba con pestañas "Ingresos"/"Gastos" (mismas columnas que el Excel real), compartirla con el email de la cuenta de servicio, configurarla desde la app, pulsar "Importar ahora" y comprobar que los movimientos aparecen; reimportar y comprobar que no se duplican (spec 012); activar la automática y verificar el disparo del cron (en local, acortando temporalmente el intervalo para no esperar 4 horas reales, revertido antes de cerrar la tarea) y que el resultado se refleja en la pantalla.

---
**Siguiente paso:** ejecutar las tareas del Grupo 1 en adelante, en orden, validando cada una contra su criterio antes de pasar a la siguiente (fase 4, implementación).
