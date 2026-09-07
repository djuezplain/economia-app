# Plan — Spec 032 (Exportación e importación de todos los datos)

**Fase:** 2 de 4

## 1. Forma del fichero JSON

`formatVersion: 1` en la raíz (entero) — permite rechazar limpiamente un fichero de una versión futura incompatible sin adivinar (H2 criterio 1). `economicData` es un objeto con **una clave por tabla** (array plano), no anidado bajo su entidad padre — más mecánico de recorrer genéricamente al importar (§3) que reconstruir un árbol.

```ts
// backend/src/data-export/account-export.types.ts
export const EXPORT_FORMAT_VERSION = 1;

export interface AccountExportFile {
  formatVersion: 1;
  exportedAt: string; // ISO
  // Informativo únicamente — nunca se usa para escribir nada al importar (spec.md §2).
  profile: { name: string; currency: string; locale: string };
  economicData: {
    categories: CategoryRow[];
    transactions: TransactionRow[];
    savingsGoals: SavingsGoalRow[];
    expenseBudgets: ExpenseBudgetRow[];
    bankAccounts: BankAccountRow[];
    bankAccountBalances: BankAccountBalanceRow[];
    stocks: StockRow[];
    stockPurchases: StockPurchaseRow[];
    stockSales: StockSaleRow[];
    stockValuations: StockValuationRow[];
    stockDividends: StockDividendRow[];
    funds: FundRow[];
    fundPurchases: FundPurchaseRow[];
    fundValuations: FundValuationRow[];
    fundDividends: FundDividendRow[];
    cryptos: CryptoRow[];
    cryptoPurchases: CryptoPurchaseRow[];
    cryptoValuations: CryptoValuationRow[];
    vehicles: VehicleRow[];
    vehicleValuations: VehicleValuationRow[];
    pensionPlans: PensionPlanRow[];
    pensionPlanContributions: PensionPlanContributionRow[];
    pensionPlanValuations: PensionPlanValuationRow[];
    cashHoldings: CashHoldingRow[];
    cashBalances: CashBalanceRow[];
  };
}
```

Cada `XRow` es exactamente `typeof <table>.$inferSelect` (la fila tal cual la devuelve Drizzle: `numeric` como `string`, `date`/`timestamp` serializados por `JSON.stringify` de forma nativa) — mismo criterio que ya usa el `AccountExport` actual (`categories`/`transactions`), solo que ahora para las 24 tablas de datos económicos que existen hoy. **Excluidas a propósito** (spec.md §2): `users`, `oauthAccounts`, `sessions`, `emailTokens`, `auditLogs`, `googleSheetsImportConfigs` — ninguna es "dato económico", y varias contienen secretos (hash de contraseña, tokens).

## 2. Export — se amplía `UsersService.exportData()`, no se crea un endpoint nuevo

`backend/src/users/users.service.ts`: `AccountExport`/`exportData()` pasan a consultar las 24 tablas (antes solo `categories`/`transactions`), cada una filtrada por `userId` (directo en las tablas con `userId` propio; en las tablas hijas, vía `inArray(<fk>, db.select({ id }).from(<padre>).where(eq(<padre>.userId, userId)))` — mismo patrón de aislamiento ya usado en el resto de la app, solo que aquí hace falta explícito porque no hay un `WHERE` directo). Un único `Promise.all` con las 24 consultas, igual que hoy con las 2. `GET /users/me/export` (`ProfileController`) no cambia de ruta, guard, ni forma de invocación — sigue siendo la misma respuesta JSON, ahora más grande. El frontend (`exportAccountData()`, `api/users.ts`) tampoco cambia de firma.

`AccountExport` pasa a ser literalmente `AccountExportFile` (§1) más `profile: UserProfile` completo (el export ya incluía más campos de perfil que los tres de §1 — se mantiene tal cual, no se recorta; §1 solo describe el mínimo que usa el import).

## 3. Import — módulo nuevo `backend/src/data-import/`

Mismo patrón de dos pasos que `ImportController` (`import/excel`, spec 003): subida del fichero por `multipart/form-data` (`FileInterceptor('file')`, límite 10 MB, mismo criterio), `preview` (no escribe nada) y `confirm` (mismo fichero se vuelve a subir — decisión ya tomada en spec 003 plan.md §3, se reutiliza sin discutirla de nuevo). Guard: `@UseGuards(AuthGuard, RequireActiveUserGuard)`, igual que el resto de rutas de datos económicos.

```
POST /data-import/preview   (file: .json) → DataImportSummary
POST /data-import/confirm   (file: .json) → DataImportSummary
```

```ts
export interface TableImportSummary {
  total: number;
  toImport: number;
  alreadyExisting: number; // mismo id ya presente — se omite (H2 criterio 3)
}
export type DataImportSummary = Record<keyof AccountExportFile['economicData'], TableImportSummary>;
```

### 3.1 Validación de forma (H2 criterio 1/6)

`DataImportService.parseFile(buffer)`:
1. `JSON.parse` — si falla, `BadRequestException('El fichero no es un JSON válido.')`.
2. `formatVersion !== EXPORT_FORMAT_VERSION` → `BadRequestException('Este fichero no es compatible con la versión actual de la exportación.')` (dato: hoy solo existe la versión 1; el campo ya deja preparado el terreno para aceptar un rango en el futuro sin romper ficheros viejos).
3. `economicData` debe ser un objeto cuyas claves sean exactamente las 24 esperadas (ni de más ni de menos) y cada valor un array.
4. Cada fila de cada array debe ser un objeto plano con un campo `id` con forma de UUID (`isUUID` de `class-validator`, ya usado en el proyecto). No se valida nada más de cada fila (ver decisión §5.2) — cualquier fila con una forma inesperada más allá de esto se detecta igualmente al insertar (paso 3.3), dentro de la misma transacción, y aborta todo el import (H2 criterio 5/7).

Cualquier fallo de 1-4 se lanza **antes** de tocar la base de datos, en `preview` y en `confirm` por igual (se re-valida en `confirm`, no se confía en que el frontend ya validó en el paso anterior).

### 3.2 Orden de inserción (dependencias por FK)

Fijo, no calculado dinámicamente — son las mismas 24 tablas de `wealth.schema.ts`/`transactions.schema.ts`/`goals.schema.ts`, sus FKs no cambian:

1. `categories` — en dos pasadas (autorreferencia `parentId`, máximo 2 niveles ya por diseño, spec 002): primero las filas con `parentId: null`, después las que lo tienen (su padre, si es nuevo, ya se ha insertado en la primera pasada de este mismo import).
2. `transactions` (depende de `categories`/subcategoría)
3. `savingsGoals`
4. `expenseBudgets` (depende de `categories`, nullable)
5. `bankAccounts` → `bankAccountBalances`
6. `stocks` → `stockPurchases`, `stockSales`, `stockValuations`, `stockDividends`
7. `funds` → `fundPurchases`, `fundValuations`, `fundDividends`
8. `cryptos` → `cryptoPurchases`, `cryptoValuations`
9. `vehicles` → `vehicleValuations`
10. `pensionPlans` → `pensionPlanContributions`, `pensionPlanValuations`
11. `cashHoldings` → `cashBalances`

### 3.3 Fusión genérica por tabla (H2 criterio 2/3)

Una función reutilizada para las 24 tablas — sin ninguna regla especial por tabla más allá de "qué columna de FK/userId le toca" (ya fijado por §3.2):

```ts
async function mergeTable<T extends { id: string }>(
  tx: Tx,
  table: PgTable,
  rows: T[],
  forceUserId?: { column: string; userId: string }, // solo en tablas con `userId` propio
): Promise<TableImportSummary> {
  if (rows.length === 0) return { total: 0, toImport: 0, alreadyExisting: 0 };
  const existingIds = new Set(
    (await tx.select({ id: table.id }).from(table).where(inArray(table.id, rows.map((r) => r.id)))).map((r) => r.id),
  );
  const toInsert = rows
    .filter((r) => !existingIds.has(r.id))
    .map((r) => (forceUserId ? { ...r, [forceUserId.column]: forceUserId.userId } : r));
  if (toInsert.length > 0) await tx.insert(table).values(toInsert);
  return { total: rows.length, toImport: toInsert.length, alreadyExisting: existingIds.size };
}
```

- **`existingIds` se comprueba por `id`, sin filtrar por usuario** — el `id` es la clave primaria global de la tabla; si ya existe (de cualquier usuario), se omite. Es la variante segura: o bien es una fila propia ya importada antes (idempotencia, H2 criterio 3) o bien un `id` que por lo que sea coincide con el de otro usuario — en ambos casos, "omitir" es lo correcto, nunca se sobrescribe nada ajeno.
- **`forceUserId` ignora siempre el `userId` que traiga el fichero** y usa `req.user.id` (H2 criterio 6, aislamiento — no negociable, constitution §2): sin esto, un fichero manipulado a mano podría intentar insertar filas con el `userId` de otra cuenta. Se aplica en las 11 tablas con `userId` propio (`categories`, `transactions`, `savingsGoals`, `expenseBudgets`, `bankAccounts`, `stocks`, `funds`, `cryptos`, `vehicles`, `pensionPlans`, `cashHoldings`); el resto son tablas hijas sin `userId` propio (aislamiento normalizado vía su padre, igual que en el resto de la app) y no necesitan este paso.
- `preview` ejecuta la misma función pero contra una transacción que siempre se revierte (`tx.rollback()` al final, o mejor: fuera de una transacción de escritura, solo con los `SELECT` de `existingIds` — no hace falta ni abrir transacción de escritura para `preview`, ya que no llama a `tx.insert`).

### 3.4 Todo-o-nada (H2 criterio 5/7)

`confirm` completo dentro de un único `db.transaction(async (tx) => { ... })` (mismo patrón que `AuthService`/`ImportService`, §"db.transaction" ya usado en el proyecto): las 24 llamadas a `mergeTable` en el orden de §3.2, secuenciales (cada tabla puede depender de ids insertados en el paso anterior). Cualquier excepción (violación de constraint no capturada por la validación de forma de §3.1 — p. ej. un `date` con formato imposible) revierte toda la transacción automáticamente; el controller la traduce a un 400 genérico ("No se ha podido importar el fichero: {mensaje}"), sin dejar ninguna fila a medio insertar.

## 4. Módulo backend

```ts
// backend/src/data-import/data-import.module.ts
@Module({
  imports: [AuthGuardModule], // mismo criterio que ImportModule — sin depender de módulos de negocio, accede a DB directamente
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
```

`app.module.ts` añade `DataImportModule` a sus `imports`.

## 5. Decisiones de este plan

1. **Sin DTOs de `class-validator` por tabla.** Sería 24 DTOs redundantes con los ya existentes de cada `create-*.dto.ts`, para datos que en su inmensa mayoría ya pasaron esa validación cuando se crearon originalmente (vía la UI normal, antes de exportarse). Se valida solo la forma mínima que hace falta para procesar el fichero con seguridad (§3.1: `formatVersion`, claves conocidas, `id` con forma de UUID); cualquier otro problema de datos lo detecta el propio `INSERT` (tipo de columna, `NOT NULL`) y aborta todo el import igual (§3.4) — mismo resultado para el usuario (fichero rechazado, nada importado), sin escribir 24 clases nuevas.
2. **`existingIds` por `id` global, no por `(id, userId)`.** Ver razonamiento en §3.3 — comprobar solo por `userId` además de `id` no aporta nada (un `id` que ya existe para *otro* usuario tampoco se debe insertar) y complica la consulta sin necesidad.
3. **Preview no abre transacción de escritura** — son solo `SELECT`, ninguna de las 24 comprobaciones de "¿existe ya este id?" escribe nada, así que no hace falta ni open/rollback de una transacción para calcular el resumen (H2 criterio 4).
4. **No se reutiliza `ImportModule` (spec 003/026)** — ese módulo importa movimientos desde Excel/Google Sheets (parseo de columnas, mapeo de texto libre a categorías); esta importación es un merge estructural de un JSON ya tipado, sin nada en común salvo "sube un fichero" (y eso ya lo da el mismo patrón `FileInterceptor`, no una dependencia compartida). Un módulo `DataImportModule` propio es más simple que forzar que convivan dos responsabilidades muy distintas en el mismo sitio.

## 6. Frontend

### 6.1 Página nueva `BackupPage.tsx` (`/backup`, nav "Copia de seguridad")

`AppLayout.tsx`: `NAV_ITEMS` añade `{ to: '/backup', end: false, label: 'Copia de seguridad' }` (H3 criterio 1 — 10º ítem, mismo patrón que el resto). `App.tsx` añade `<Route path="/backup" element={<BackupPage />} />` dentro de `AppLayout`.

- **Sección "Exportar todos tus datos":** el botón y `handleExport()` que hoy viven en `ProfilePage.tsx` (H8 criterio 1 original) se **mueven** aquí tal cual (mismo `exportAccountData()` + Blob + descarga, `api/users.ts` no cambia). `ProfilePage.tsx` sustituye esa tarjeta por un enlace corto a `/backup` (H3 criterio 2) — evita mantener el mismo botón en dos sitios.
- **Sección "Importar datos":** `<input type="file" accept=".json">` → al seleccionar, guarda el `File` en estado y llama a `previewImport(file)`; mientras no hay fichero seleccionado, no se llama a nada (H2 criterio 4, "sin tocar mis datos todavía"). Se muestra una tabla con el resumen por tipo de dato (`DataImportSummary` — clave técnica de tabla mapeada a una etiqueta en español, p. ej. `stockPurchases` → "Compras de acciones") y un botón "Confirmar importación", deshabilitado hasta tener una preview válida. Al confirmar, llama a `confirmImport(file)` (mismo `File` ya en estado, sin volver a pedirlo — spec 003 plan.md §3 decisión 3) y muestra el resultado final o el error (`ApiError`, mismo patrón que el resto de la app).

### 6.2 `frontend/src/api/data-import.ts`

Mismo patrón que `api/import.ts` (`fileFormData` + `api.postForm`):

```ts
export function previewDataImport(file: File): Promise<DataImportSummary> {
  return api.postForm<DataImportSummary>('/data-import/preview', fileFormData(file));
}
export function confirmDataImport(file: File): Promise<DataImportSummary> {
  return api.postForm<DataImportSummary>('/data-import/confirm', fileFormData(file));
}
```

`DataImportSummary` espejo del tipo del backend (§3), igual que ya hace `api/import.ts` con `ImportPreviewResult`.

## 7. Tests

- Backend: `data-import.e2e-spec.ts` — mismo estilo que `import.e2e-spec.ts`/`google-sheets-import.e2e-spec.ts`. Casos: fichero con formato inválido/versión incompatible (rechazado, nada escrito); import de un export propio recién generado (todo nuevo, todo se inserta, jerarquía padre-hijo correcta — comprobar que una acción importada trae sus compras/ventas/valoraciones/dividendos); reimport del mismo fichero (todo `alreadyExisting`, nada cambia); aislamiento — un fichero con `userId` de otro usuario en sus filas no puede escribir en la cuenta de otro (criterio 6); fallo a mitad de camino (fila con un campo obligatorio ausente) revierte el import completo, sin dejar nada de las tablas anteriores del orden de §3.2.
- `users.e2e-spec.ts`/`users-account.e2e-spec.ts` (el export existente): se amplía para comprobar que `GET /users/me/export` incluye ahora también, p. ej., una acción con su compra — no solo categorías/movimientos.
- Frontend: `BackupPage.test.tsx` nuevo (export movido, import con preview/confirm mockeados); `ProfilePage.test.tsx` se ajusta al enlace nuevo en vez del botón de exportar.

## 8bis. Encontrado durante la implementación (Grupo 2)

- **Coerción de `createdAt`/`updatedAt` antes de insertar.** `JSON.parse` deja esos campos como texto ISO (así los serializó `JSON.stringify` al exportar), pero Drizzle exige un `Date` real para una columna `timestamp` (`PgTimestamp.mapToDriverValue` llama a `.toISOString()` sobre el valor recibido) — sin esto, cualquier `INSERT` con datos reales fallaba con `TypeError: value.toISOString is not a function`. Corregido con `coerceTimestamps()` en `mergeTable`: detecta genéricamente, vía `getTableColumns()`, qué columnas de cada tabla son `PgTimestamp` (sin ninguna regla especial por tabla, mismo criterio del resto de la fusión) y convierte esos campos a `Date` justo antes de insertar.
- **`confirm()` capturaba el error del `INSERT` fallido como 500, no como 400.** `parseFile()` (§3.1) rechaza los problemas de forma más comunes, pero un fallo real de constraint (p. ej. una columna `NOT NULL` sin valor, detectado en el test "todo o nada") se escapaba de la transacción como una excepción no controlada — la transacción sí se revertía correctamente (la garantía de "nada importado" nunca estuvo en riesgo), pero NestJS lo traducía a un 500 genérico en vez del 400 que pide H2 criterio 7. Corregido envolviendo `db.transaction(...)` en un `try/catch` en `confirm()`: cualquier error que no sea ya un `BadRequestException` (de `parseFile`) se relanza como `BadRequestException`, usando el mensaje de `err.cause` (el error real de Postgres, p. ej. "null value in column... violates not-null constraint") en vez del mensaje de Drizzle, que incluye la consulta SQL completa con sus parámetros — no se quiere reenviar eso al cliente.

## 8. Fuera de este plan

- Igual que spec.md §2: sin modo "reemplazar todo", sin fusión por clave de negocio (solo por `id`), sin tocar perfil/autenticación, sin CSV/Excel.
- No se añade paginación/streaming al export ni al import — el volumen de datos de un usuario de esta app (registros manuales, no un histórico bancario masivo) no lo justifica; si en el futuro hiciera falta, es un cambio localizado a `mergeTable`/las consultas de `exportData()`, no al formato del fichero.
