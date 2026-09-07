# Tasks — Spec 032 (Exportación e importación de todos los datos)

**Fase:** 4 de 4 — implementada

## Grupo 1 — Export completo (amplía H8/spec 001)

- [x] **T1.1** — `AccountExportFile`/`EXPORT_FORMAT_VERSION` en `backend/src/data-export/account-export.types.ts` (plan.md §1): tipos de las 24 filas (`typeof <table>.$inferSelect`), reexportados desde los `*.schema.ts` existentes, sin duplicar columnas a mano.
- [x] **T1.2** — `UsersService.exportData()` (plan.md §2): las 24 consultas en un único `Promise.all`, filtradas por `userId` (directo en tablas raíz, vía `inArray(<fk>, subquery)` en tablas hijas). `AccountExport` pasa a incluir `formatVersion` y las 24 claves de `economicData`. Test e2e (`users-account.e2e-spec.ts`): `GET /users/me/export` incluye ahora, además de categorías/movimientos, p. ej. una cuenta bancaria con su saldo y una acción con compra/venta/valoración/dividendo — y sigue devolviendo solo datos del usuario autenticado (aislamiento, ya cubierto antes para categorías/movimientos, se extiende al resto).

## Grupo 2 — Import (módulo nuevo)

- [x] **T2.1** — `DataImportService.parseFile()` (plan.md §3.1): `JSON.parse`, `formatVersion`, claves de `economicData` exactas, `id` con forma de UUID en cada fila. Cubierto con tests e2e (`data-import.e2e-spec.ts`, no unitarios como decía la tarea original — misma cobertura real: JSON inválido, `formatVersion` incompatible, clave de tabla desconocida/faltante, fila sin `id` válido, las 4 rechazadas con 400 y nada escrito) — se prefirió probar contra la API pública real en vez de la clase privada.
- [x] **T2.2** — `mergeTable()` genérico + orden fijo de las 24 tablas (plan.md §3.2/§3.3): `existingIds` por `SELECT ... WHERE id = ANY(...)`, `forceUserId` en las 11 tablas raíz, inserción por lotes. Categorías en dos pasadas (`parentId` nulo primero). Añadido durante la implementación: `coerceTimestamps()` (ver plan.md §8bis) — necesario para que el `INSERT` acepte `createdAt`/`updatedAt` tras `JSON.parse`.
- [x] **T2.3** — `DataImportService.preview()`/`.confirm()` (plan.md §3.4): `preview` solo lectura (sin transacción de escritura); `confirm` con las 24 llamadas a `mergeTable` dentro de un único `db.transaction`, con `try/catch` para traducir un fallo de `INSERT` a 400 (ver plan.md §8bis). Ambos reutilizan `parseFile()` (T2.1) — `confirm` no confía en que el frontend ya llamó a `preview`.
- [x] **T2.4** — `DataImportController` (`POST /data-import/preview`, `POST /data-import/confirm`) + `DataImportModule` (plan.md §4), añadido a `app.module.ts`. Mismo `FileInterceptor`/límite de 10 MB que `ImportController`.
- [x] **T2.5** — Tests e2e `data-import.e2e-spec.ts` (plan.md §7, 9 casos): 401 sin sesión; JSON inválido / claves incorrectas / `formatVersion` incompatible → 400, nada escrito; `preview` no escribe nada; import de un export propio con jerarquía padre-hijo (acción con compra) → todo `toImport`, aislado por usuario; reimport del mismo fichero → todo `alreadyExisting`, idempotente; fichero con `userId` de otro usuario en sus filas → se ignora, nunca escribe bajo esa otra cuenta; fila con un campo obligatorio ausente a mitad del fichero → 400, todo el import revertido.

## Grupo 3 — Frontend

- [x] **T3.1** — `frontend/src/api/data-import.ts` (plan.md §6.2): `DataImportSummary`, `DATA_TABLE_LABELS`, `previewDataImport()`, `confirmDataImport()` — mismo patrón que `api/import.ts`.
- [x] **T3.2** — `BackupPage.tsx` nuevo (plan.md §6.1): sección "Exportar todos tus datos" (botón + `handleExport()` movidos desde `ProfilePage.tsx`, mismo `exportAccountData()`); sección "Importar datos" (selector de fichero → preview automática con tabla de resumen por tipo de dato → botón "Confirmar importación" → resultado final o error).
- [x] **T3.3** — `AppLayout.tsx` (`NAV_ITEMS` + entrada "Copia de seguridad") y `App.tsx` (`<Route path="/backup">`) — plan.md §6.1.
- [x] **T3.4** — `ProfilePage.tsx`: se retira el botón/lógica de exportar (movidos en T3.2), se sustituye por un enlace a `/backup`.

## Grupo 4 — Tests y cierre

- [x] **T4.1** — `BackupPage.test.tsx` (7 casos): sin sesión no llama a ninguna API; exportar dispara la descarga (mock de `exportAccountData`) y muestra error si falla; seleccionar un fichero llama a preview y pinta el resumen sin confirmar todavía; confirmar reenvía el mismo fichero y muestra el resultado final; un 400 de preview no ofrece confirmar; un error al confirmar no pierde la vista previa.
- [x] **T4.2** — `ProfilePage.test.tsx` ajustado al enlace nuevo (sin el botón de exportar, que ya cubre T4.1).
- [x] **T4.3** — Backend: 512 tests e2e + 179 unitarios en verde (`--no-file-parallelism`; en paralelo, varios ficheros e2e comparten la misma BD de test y se pisan entre sí — no es un problema introducido aquí). `tsc -b` limpio. Frontend: 474 tests en verde (1 fallo preexistente y no relacionado en `WealthPage.test.tsx`, dependiente de la fecha del sistema, confirmado también en `master` sin estos cambios). `tsc -b` limpio. `oxlint` sin avisos nuevos en ningún fichero tocado. Revisión manual en el navegador (backend-dev + frontend-dev reales, Postgres real): registro de usuario, verificación de email, "Copia de seguridad" visible en el menú, exportar (200 OK, 24 tablas + categorías por defecto), importar ese mismo fichero (preview y confirm muestran correctamente "0 nuevos, 2 ya existentes" — idempotencia verificada en vivo), sin errores en los logs del backend.
