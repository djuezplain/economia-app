# Plan — Spec 032 (Exportación e importación de todos los datos)

**Fase:** H1-H5: 4 de 4 — implementada (H4/Google Drive ver §9, tasks.md Grupos 5-9; H5/exportación programada ver §11, tasks.md Grupos 10-12).

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

## 9. H4 — Exportar a Google Drive

### 9.1 Credenciales y variables de entorno nuevas

Mismo proyecto de Google Cloud que ya usa el login (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `auth/google/google.strategy.ts`) — H4 solo necesita que Diego habilite la **Google Drive API** en ese proyecto (Google Cloud Console → APIs & Services → Library) y registre una segunda Redirect URI (distinta de la del login, ver §9.3). No hace falta un proyecto ni unas credenciales nuevas.

```
# backend/.env.example — nuevas
GOOGLE_DRIVE_CALLBACK_URL="http://localhost:3000/auth/drive/callback"
DRIVE_TOKEN_ENCRYPTION_KEY=""   # 32 bytes en base64 — `openssl rand -base64 32`
```

`env.validation.ts`: `GOOGLE_DRIVE_CALLBACK_URL: Joi.string().uri().default('http://localhost:3000/auth/drive/callback')`, `DRIVE_TOKEN_ENCRYPTION_KEY: Joi.string().allow('').default('')` (igual criterio que `GOOGLE_CLIENT_ID` — opcional a nivel de arranque, bloqueado a nivel de ruta por un guard, mismo patrón que `GoogleConfiguredGuard` — ver §9.4).

### 9.2 Tabla nueva `google_drive_connections`

```ts
// backend/src/db/schema/google-drive.schema.ts
export const googleDriveConnections = pgTable('google_drive_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  // Se rellena en el primer export correcto (lazy, no en el momento de conectar — así
  // si el usuario borra la carpeta a mano en Drive entre dos exports, el siguiente
  // export la recrea sola en vez de fallar apuntando a un id que ya no existe).
  folderId: varchar('folder_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Una fila por usuario (`unique` en `userId`) — conectar de nuevo tras desconectar hace `ON CONFLICT (user_id) DO UPDATE` (mismo refresh token/folder nuevos, sin duplicar fila). `onDelete: 'cascade'` — igual criterio que el resto de tablas colgadas de `users` (borrar cuenta se lleva también esto, sin dato huérfano). Nunca se guarda el access token (vive solo en memoria de la petición, se pide uno nuevo a Google en cada export con el refresh token — évita otra columna con expiración que gestionar).

No se guarda el `id`/nombre de la carpeta como "dato económico" del export de H1 — es infraestructura de la conexión, no pertenece a `AccountExportFile`.

### 9.3 Cifrado del refresh token en reposo

`backend/src/common/secret-encryption.util.ts` — AES-256-GCM con Node `crypto` nativo (sin dependencia nueva):

```ts
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromEnv(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.');
}
export function decryptSecret(stored: string): string {
  const [iv, tag, ciphertext] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', keyFromEnv(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

`keyFromEnv()` lee `DRIVE_TOKEN_ENCRYPTION_KEY` (base64 → 32 bytes) una vez; si no está configurada, `GoogleDriveConfiguredGuard` (§9.4) ya ha bloqueado la ruta antes de llegar aquí, así que esta función puede asumir que existe. Utilidad genérica (no acoplada a "Drive") por si en el futuro otro secreto de terceros la necesita — no es una abstracción prematura: el propio H4 ya tiene dos usos (cifrar al guardar, descifrar en cada export).

### 9.4 Guard de disponibilidad

```ts
// backend/src/google-drive/google-drive-configured.guard.ts
```

Mismo patrón que `GoogleConfiguredGuard` (`auth/google/`): comprueba `GOOGLE_CLIENT_ID`/`SECRET` (compartidas con el login) y `DRIVE_TOKEN_ENCRYPTION_KEY`; si falta cualquiera, `ServiceUnavailableException` con mensaje claro en vez de fallar de forma confusa contra Google o al cifrar. Se aplica en las 4 rutas de §9.6.

### 9.5 Conectar Drive — flujo OAuth propio, sin exponer el access token en la URL

Problema a resolver: `GET /auth/drive/connect` lo dispara una navegación completa del navegador (`window.location.href`, no un `fetch`) porque el paso siguiente es redirigir a Google — igual que el propio login con Google (constitution.md, nota T4.1-T4.2). Pero, a diferencia del login, aquí el usuario **ya tiene sesión iniciada** y hace falta saber quién es *antes* de generar la URL de Google, sin poder mandar el `Authorization: Bearer` (una navegación de navegador no lleva headers custom).

**Decisión: se identifica al usuario con la cookie de refresh token ya existente**, en vez de pasar el access token por query string (que sí sería un patrón nuevo, y uno peor que el ya aceptado en constitution.md para el sentido contrario). La cookie (`REFRESH_COOKIE_NAME`, `session-cookie.ts`) tiene `path: '/auth'` a propósito — con las rutas nuevas bajo `/auth/drive/...`, el navegador la adjunta sola en la navegación, sin cambiar nada de la cookie ni de su alcance.

`SessionsService` añade un método de solo lectura, sin rotar nada (rotar emitiría una sesión nueva innecesaria para una acción que no es "refrescar sesión"):

```ts
async verifyActive(refreshTokenPlaintext: string): Promise<{ userId: string }> {
  const hash = hashOpaqueToken(refreshTokenPlaintext);
  const session = await this.db.query.sessions.findFirst({ where: eq(sessions.refreshTokenHash, hash) });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedException('Sesión no válida.');
  }
  return { userId: session.userId };
}
```

Flujo completo:

1. **`GET /auth/drive/connect`** (guard: `GoogleDriveConfiguredGuard`, sin `AuthGuard` — no hay header Bearer en una navegación):
   - Lee la cookie de refresh token; si falta o `verifyActive()` lanza → `res.redirect('${FRONTEND_URL}/login')` (mismo criterio que cualquier acción que exige sesión y no la encuentra).
   - `state` = JWT de corta vida firmado con el mismo `JwtService` ya inyectado en el resto de la app (`jwt.signAsync({ sub: userId }, { expiresIn: '5m' })`) — evita meter una tabla o cookie nueva solo para este único valor de ida y vuelta (mismo criterio que constitution.md ya documentó para el login: "sin `state` anti-CSRF con sesión de servidor", aquí el JWT firmado cumple el mismo papel de "no falsificable" sin introducir `express-session`).
   - `res.redirect(oauth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [DRIVE_FILE_SCOPE], state }))` — `prompt: 'consent'` fuerza que Google **siempre** devuelva `refresh_token`, incluso en una reconexión (por defecto, Google solo lo manda la primerísima vez que un usuario autoriza esa combinación app+cuenta; sin esto, desconectar y reconectar criterio 6 podría quedarse sin refresh token nuevo).

2. **`GET /auth/drive/callback`** (guard: `GoogleDriveConfiguredGuard`, tampoco `AuthGuard` — lo visita Google, no la SPA):
   - `jwt.verifyAsync(state)` → `userId` (JWT inválido/caducado → redirige a `${FRONTEND_URL}/backup?driveConnected=0&error=state`).
   - `oauth2Client.getToken(code)` → si Google no devuelve `refresh_token` (edge case ya cubierto por `prompt=consent`, pero se comprueba igual) → redirige con `?driveConnected=0&error=no_refresh_token`.
   - `encryptSecret(refresh_token)`, `INSERT ... ON CONFLICT (user_id) DO UPDATE SET refresh_token_encrypted = ..., folder_id = NULL, updated_at = now()` (una reconexión resetea `folderId` a propósito — la próxima export la reencuentra o recrea, criterio 4/6).
   - Redirige a `${FRONTEND_URL}/backup?driveConnected=1`.

`DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'` (spec H4 criterio 3 — scope más restrictivo, la app solo ve lo que ella misma crea).

### 9.6 Endpoints

```
GET    /auth/drive/connect    → 302 a Google (cookie de refresh, sin AuthGuard — §9.5)
GET    /auth/drive/callback   → 302 a /backup (sin AuthGuard — §9.5)
GET    /drive/connection      → { connected: boolean }             (AuthGuard normal, Bearer)
POST   /drive/export          → { fileId: string; webViewLink: string }  (AuthGuard normal, Bearer)
DELETE /drive/connection      → 204                                  (AuthGuard normal, Bearer)
```

Las dos últimas filas usan el guard estándar del resto de la app (`AuthGuard`, `RequireActiveUserGuard`, `GoogleDriveConfiguredGuard`) porque las dispara siempre un `fetch` normal de la SPA (ya autenticada con Bearer), no una navegación — no tienen el problema de §9.5.

### 9.7 `POST /drive/export` — subida real

```ts
async exportToDrive(userId: string): Promise<{ fileId: string; webViewLink: string }> {
  const connection = await this.getConnection(userId); // 404 con mensaje "Conecta Google Drive primero" si no existe
  const oauth2Client = this.buildClient(decryptSecret(connection.refreshTokenEncrypted));
  const folderId = await this.ensureFolder(oauth2Client, connection); // §9.7.1
  const file = await this.usersService.exportData(userId); // MISMO método que ya usa GET /users/me/export — no se duplica lógica
  const filename = `economia-app-datos-${new Date().toISOString().slice(0, 10)}.json`;
  return this.uploadJson(oauth2Client, folderId, filename, file); // §9.7.2
}
```

- **Reutiliza `UsersService.exportData()` directamente (llamada a método, no HTTP a sí mismo)** — el mismo `AccountExportFile` que ya arma H1, sin recomponer nada. Evita que H1 y H4 puedan divergir en qué incluyen.
- **9.7.1 `ensureFolder`**: si `connection.folderId` existe, `GET https://www.googleapis.com/drive/v3/files/{id}?fields=id,trashed` — si 404 o `trashed: true` (usuario la borró/papelera a mano en Drive), se trata como "no existe". Si no existe, busca por nombre exacto (`files.list` con `q="name='Economía App' and mimeType='application/vnd.google-apps.folder' and trashed=false"`, con `drive.file` esto solo puede encontrar una carpeta que la propia app ya haya creado antes, coherente con el scope) y si tampoco aparece, la crea (`files.create`, `mimeType: 'application/vnd.google-apps.folder'`). Guarda el `id` resultante en `connection.folderId` (`UPDATE`) para la próxima vez.
- **9.7.2 `uploadJson`**: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`, cuerpo `multipart/related` con la parte de metadata (`{ name, parents: [folderId] }`, `Content-Type: application/json`) y la parte de contenido (`JSON.stringify(file)`, `Content-Type: application/json`) — mismo criterio de llamada cruda con `JWT`/`OAuth2Client.request()` de `google-auth-library` que ya usa `GoogleSheetsService` (`import/google-sheets.service.ts` §"request<T>"), no se añade la librería `googleapis` completa solo para dos llamadas.
- **Errores**: mismo patrón que `GoogleSheetsService.request()` — captura `gaxios.GaxiosError`; si el status es 401 o el cuerpo trae `invalid_grant` (token revocado desde fuera de la app, p. ej. el usuario quitó el permiso en myaccount.google.com/permissions), `BadRequestException('El acceso a Google Drive ha caducado o ha sido revocado. Desconecta y vuelve a conectar Google Drive.')` — no se borra la conexión sola (criterio 6 deja el borrado como acción explícita del usuario, no automática); cualquier otro fallo (cuota, 5xx de Google) → `BadRequestException('No se ha podido guardar el fichero en Google Drive. Inténtalo de nuevo más tarde.')`.

### 9.8 Módulo backend

```ts
// backend/src/google-drive/google-drive.module.ts
@Module({
  imports: [AuthGuardModule, UsersModule], // UsersModule: reutiliza UsersService.exportData() (§9.7)
  controllers: [GoogleDriveOAuthController, GoogleDriveController],
  providers: [GoogleDriveService],
})
export class GoogleDriveModule {}
```

`app.module.ts` añade `GoogleDriveModule`. `UsersModule` debe exportar `UsersService` si no lo hace ya (comprobar al implementar; si no lo exporta, se añade a sus `exports`, sin más cambios — ya lo consume igual `ProfileController` hoy).

### 9.9 Frontend

- **`frontend/src/api/google-drive.ts`**: `getDriveConnectionStatus()` (`GET /drive/connection`), `disconnectDrive()` (`DELETE /drive/connection`), `exportToDrive()` (`POST /drive/export`, mismo `api.post` con Bearer que el resto de `api/*.ts`) y `driveConnectUrl()` que simplemente construye `${API_BASE_URL}/auth/drive/connect` (no es una llamada `fetch` — se usa como `window.location.href`, §9.5).
- **`BackupPage.tsx`**: nueva sub-sección dentro de "Exportar todos tus datos". Al montar, `getDriveConnectionStatus()`. Si `connected: false`: botón "Conectar Google Drive" → `window.location.href = driveConnectUrl()`. Si `connected: true`: botón "Guardar en Google Drive" (`exportToDrive()`, muestra enlace `webViewLink` al terminar, criterio 5) y enlace "Desconectar" (`disconnectDrive()`, confirmación simple tipo `window.confirm`, criterio 6). Al volver de Google, la página lee `?driveConnected=1|0&error=...` de la URL (`useSearchParams`) para mostrar la confirmación/error y vuelve a pedir el estado — mismo criterio que `OAuthCallbackPage` ya usa para leer query params tras un redirect de Google.

### 9.10 Decisiones de este plan (H4)

1. **Identificación del usuario en `/auth/drive/connect` vía cookie de refresh, no vía access token en query string.** Ver razonamiento completo en §9.5 — reutiliza una cookie y un alcance (`path: '/auth'`) que ya existen, sin inventar un mecanismo nuevo ni exponer un token más sensible (access token válido para toda la API) en una URL/historial del navegador.
2. **`state` firmado con JWT de 5 minutos, sin `express-session`** — mismo criterio ya aceptado en constitution.md para el login con Google, aplicado aquí también.
3. **`folderId` se resuelve de forma perezosa (lazy) en cada export, no solo al conectar** — tolera que el usuario manipule la carpeta a mano en Drive entre dos exports (criterio 4), sin dejar la conexión en un estado roto.
4. **`prompt: 'consent'` siempre en el `connect`** — sin esto, una desconexión+reconexión (criterio 6) se quedaría sin `refresh_token` nuevo (Google solo lo emite la primera vez por defecto), dejando la reconexión rota de una forma no evidente hasta el primer export.
5. **Sin librería `googleapis`** — se reutiliza `google-auth-library` (ya en el proyecto, usada por `GoogleSheetsService`) con llamadas REST crudas, mismo patrón ya establecido, en vez de añadir una dependencia grande para dos endpoints de Drive.
6. **Revocación en Google no es responsabilidad de "desconectar"** — `DELETE /drive/connection` solo borra la fila local; no se llama al endpoint de revocación de Google (`oauth2.revoke`). Simplifica el caso feliz (el usuario puede reconectar sin ir a Google) y evita un fallo de red en el borrado local por un problema al revocar; si Diego prefiere revocar también en Google, es un cambio pequeño y aislado a esa única ruta.

### 9.11 Tests (H4)

- Backend: `google-drive.e2e-spec.ts` — conectar (mock de `oauth2Client.getToken`) guarda la fila cifrada; reconectar hace upsert sin duplicar; `export` sin conexión previa → 404/mensaje claro; `export` con conexión pero token revocado (mock 401) → error claro, conexión no se borra sola; `ensureFolder` crea la carpeta si `folderId` es `null` y la reutiliza en el segundo export (mock de `files.get`/`files.list`/`files.create`); aislamiento — la conexión de un usuario nunca se usa para otro. Unit test de `secret-encryption.util.ts` (round-trip cifra/descifra, y que un texto cifrado con una key no descifra con otra).
- Frontend: `BackupPage.test.tsx` se amplía con los tres estados (no conectado / conectado / tras volver de Google con `driveConnected=1` y con `=0&error=...`).

## 10. Fuera de este plan (H4)

- Igual que spec.md §2 (Fuera de alcance de H4): sin importar desde Drive, sin selector de carpeta (Google Picker). Las copias periódicas/automáticas, fuera de H4, pasan a cubrirlas H5 — ver §11.
- Sin revocar el token en Google al desconectar (§9.10 decisión 6) — solo se borra la conexión local.
- Sin refrescar/cachear el access token entre peticiones — cada `POST /drive/export` pide uno nuevo a Google con el refresh token (una operación manual, poco frecuente; no compensa la complejidad de cachear un token de 1h de vida para este volumen de uso).

## 11. H5 — Programar exportaciones automáticas

### 11.1 Tabla nueva `scheduled_exports`

```ts
// backend/src/db/schema/scheduled-export.schema.ts
export const scheduleFrequencyEnum = pgEnum('schedule_frequency', ['DAILY', 'WEEKLY', 'MONTHLY']);
export const scheduleDestinationEnum = pgEnum('schedule_destination', ['LOCAL', 'DRIVE']);

export const scheduledExports = pgTable('scheduled_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  frequency: scheduleFrequencyEnum('frequency').notNull(),
  // 0 (domingo) - 6 (sábado); solo relevante/obligatorio si frequency = WEEKLY.
  dayOfWeek: smallint('day_of_week'),
  // 1-28; solo relevante/obligatorio si frequency = MONTHLY — nunca 29-31 (§11.7 decisión 3).
  dayOfMonth: smallint('day_of_month'),
  // "HH:mm", zona horaria del servidor (spec.md §3 decisión 9). varchar, no el tipo
  // `time` de Postgres — se compara como string contra la hora local ya formateada
  // igual (§11.3), sin añadir el manejo de tipo `time` de drizzle/pg para esto.
  timeOfDay: varchar('time_of_day', { length: 5 }).notNull(),
  destination: scheduleDestinationEnum('destination').notNull(),
  // Solo si destination = LOCAL: subcarpeta opcional dentro de la carpeta propia del
  // usuario (§11.2) — nunca una ruta absoluta ni con `..` (saneada al guardar).
  localSubfolder: varchar('local_subfolder', { length: 100 }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  // `null` = la última ejecución fue bien (o no se ha ejecutado nunca todavía).
  lastRunError: text('last_run_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledExportsRelations = relations(scheduledExports, ({ one }) => ({
  user: one(users, { fields: [scheduledExports.userId], references: [users.id] }),
}));
```

Una fila por usuario (`unique` en `userId`, upsert al guardar) — mismo criterio que `googleSheetsImportConfigs` (spec 026) y `googleDriveConnections` (§9.2): una única configuración activa (spec.md §3 decisión "varias programaciones simultáneas", fuera de alcance).

### 11.2 Directorio local — namespaced por usuario, sin rutas arbitrarias (spec.md H5 criterio 7)

Variable de entorno nueva:

```
# backend/.env.example
SCHEDULED_EXPORT_LOCAL_DIR="./scheduled-exports"   # mismo criterio que backups/ de deploy/backup.sh; en producción, volumen de Docker
```

`env.validation.ts`: `SCHEDULED_EXPORT_LOCAL_DIR: Joi.string().default('./scheduled-exports')`.

Cada export local se escribe en `path.join(SCHEDULED_EXPORT_LOCAL_DIR, userId, sanitizeSubfolder(localSubfolder), filename)`:

```ts
// backend/src/scheduled-exports/local-export-path.util.ts
/** Solo letras/dígitos/espacio/guion/guion bajo/barra — sin `..`, sin barra inicial, colapsando barras repetidas. Vacío si `localSubfolder` es `null`/no pasa el filtro. */
export function sanitizeSubfolder(input: string | null): string {
  if (!input) return '';
  return input
    .replace(/[^a-zA-Z0-9\-_ /]/g, '')
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}
```

`userId` es un UUID generado por la propia app (nunca por el usuario) — garantiza aislamiento por carpeta incluso a nivel de sistema de ficheros, con o sin `sanitizeSubfolder()`; `sanitizeSubfolder()` es la segunda capa (defensa en profundidad, constitution §2) para que tampoco se pueda escapar de la carpeta propia del usuario vía `localSubfolder`. `writeLocal()` hace `fs.mkdir(dir, { recursive: true })` antes de escribir (mismo criterio que `mkdir -p backups` de `deploy/backup.sh`).

### 11.3 Scheduler — barrido periódico, "debido" por periodo, no por minuto exacto

```ts
// backend/src/scheduled-exports/scheduled-exports.scheduler.ts
@Cron('*/15 * * * *')
async runDue(): Promise<void> {
  const configs = await this.db.query.scheduledExports.findMany({
    where: eq(scheduledExports.enabled, true),
    with: { user: true },
  });
  const now = new Date();

  for (const config of configs) {
    if (config.user.status !== 'ACTIVE') continue; // mismo criterio que GoogleSheetsImportScheduler
    if (!isDue(config, now)) continue;

    try {
      await this.scheduledExportsService.run(config);
    } catch (err) {
      // `run()` ya deja el motivo en `lastRunError` de la propia fila — aquí solo
      // constancia en el log del proceso, un fallo no interrumpe a los demás usuarios.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Exportación programada fallida para el usuario ${config.userId}: ${message}`);
    }
  }
}
```

```ts
// backend/src/scheduled-exports/scheduled-exports.due.ts
/**
 * "Debido" = ya ha pasado la hora programada de hoy Y no se ha ejecutado
 * todavía dentro del periodo actual (hoy/esta semana/este mes). No exige
 * coincidencia exacta de minuto: un barrido cada 15 minutos es suficiente, y
 * si el proceso estuvo caído justo a la hora programada, se recupera sola en
 * el siguiente barrido en vez de saltarse el día — mismo espíritu de
 * "recuperación automática" que ya tiene el cron de spec 026, sin ningún
 * mecanismo nuevo (cola de reintentos, etc.).
 */
export function isDue(config: { frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; dayOfWeek: number | null; dayOfMonth: number | null; timeOfDay: string; lastRunAt: Date | null }, now: Date): boolean {
  if (formatHHmm(now) < config.timeOfDay) return false;
  if (config.frequency === 'WEEKLY' && now.getDay() !== config.dayOfWeek) return false;
  if (config.frequency === 'MONTHLY' && now.getDate() !== config.dayOfMonth) return false;
  if (!config.lastRunAt) return true;
  return !isSamePeriod(config.frequency, config.lastRunAt, now);
}
```

`isSamePeriod()`: mismo día calendario (DAILY), misma semana ISO (WEEKLY), mismo mes+año (MONTHLY) — comparación de fecha del servidor entre `lastRunAt` y `now`, sin librería nueva (`date-fns` no está en el proyecto; un puñado de comparaciones directas de `Date` es suficiente para 3 casos).

### 11.4 `ScheduledExportsService.run()`

```ts
async run(config: ScheduledExportRow): Promise<void> {
  try {
    if (config.destination === 'LOCAL') {
      const file = await this.usersService.exportData(config.userId);
      await this.writeLocal(config, file);
    } else {
      await this.googleDriveService.exportToDrive(config.userId); // MISMO método que ya usa H4 manual — sin recomponer nada
    }
    await this.markRun(config.id, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await this.markRun(config.id, message);
    throw err; // el scheduler (§11.3) ya lo captura solo para el log de proceso
  }
}

private async markRun(id: string, error: string | null): Promise<void> {
  await this.db.update(scheduledExports).set({ lastRunAt: new Date(), lastRunError: error }).where(eq(scheduledExports.id, id));
}

private async writeLocal(config: ScheduledExportRow, file: AccountExport): Promise<void> {
  const dir = path.join(this.localDir, config.userId, sanitizeSubfolder(config.localSubfolder));
  await fs.mkdir(dir, { recursive: true });
  const filename = `economia-app-datos-${new Date().toISOString().slice(0, 10)}.json`;
  await fs.writeFile(path.join(dir, filename), JSON.stringify(file, null, 2), 'utf-8');
  await this.purgeOldFiles(dir); // §11.5
}
```

Si `destination = DRIVE` y no hay conexión, `GoogleDriveService.exportToDrive()` ya lanza `NotFoundException('Conecta Google Drive primero.')` (§9.7) — se captura aquí igual que cualquier otro error y queda en `lastRunError`, sin caso especial.

### 11.5 Purga de ficheros locales antiguos

Mismo criterio que `deploy/backup.sh` (`-mtime +14 -delete`): tras escribir el fichero nuevo, `purgeOldFiles(dir)` lista los ficheros `economia-app-datos-*.json` de esa misma carpeta (la del propio usuario, nunca fuera de `SCHEDULED_EXPORT_LOCAL_DIR`) y borra los de más de 14 días. Sin retención equivalente en Drive — H4 ya no gestiona el contenido del Drive del usuario más allá de subir un fichero (§9.10 decisión 6), fuera de alcance también aquí.

### 11.6 Endpoints

```
GET    /scheduled-exports   → la config actual, o 200 con `null` si nunca se ha configurado   (AuthGuard, RequireActiveUserGuard)
PUT    /scheduled-exports   → upsert de la config completa → 200 con la fila                  (ídem)
DELETE /scheduled-exports   → enabled = false (no borra la fila — conserva la config, H5 criterio 4) → 204   (ídem)
```

`SaveScheduledExportDto` (`class-validator`): `frequency` (`IsIn(['DAILY','WEEKLY','MONTHLY'])`), `dayOfWeek`/`dayOfMonth` con `@ValidateIf` cruzado (`dayOfWeek` obligatorio y `IsInt({min:0,max:6})` solo si `frequency === 'WEEKLY'`; `dayOfMonth` obligatorio y `IsInt({min:1,max:28})` solo si `frequency === 'MONTHLY'`; el que no aplica debe venir ausente — evita guardar un `dayOfWeek` residual de una config anterior que ya no se usa), `timeOfDay` (`Matches(/^([01]\d|2[0-3]):[0-5]\d$/)`), `destination` (`IsIn(['LOCAL','DRIVE'])`), `localSubfolder` (opcional, `MaxLength(100)`), `enabled` (`IsBoolean`).

`ScheduledExportsService.save()`: si `destination === 'DRIVE'`, comprueba `googleDriveService.isConnected(userId)` (método ya existente, §9) antes de guardar con `enabled: true` — si no está conectado, `BadRequestException('Conecta Google Drive antes de programar una exportación a Drive.')` (H5 criterio 3). Guardar con `enabled: false` (o `destination: 'LOCAL'`) nunca exige esa comprobación.

### 11.7 Decisiones de este plan (H5)

1. **Directorio local namespaced por `userId`, nunca una ruta que el usuario escriba a mano** — §11.2; única forma segura de ofrecer "ruta local" sin abrir una escritura arbitraria en el servidor (spec.md H5 criterio 7 / decisión 7).
2. **Un único barrido cada 15 minutos, "debido" por comparación de periodo, no por coincidencia exacta de minuto** — §11.3; tolera que el proceso esté caído a la hora exacta programada sin perder la ejecución del día, sin necesitar un cron por usuario ni una cola de trabajos.
3. **`dayOfMonth` limitado a 1-28** — evita la ambigüedad de "día 31 en un mes de 30 días"; límite explícito documentado, no un bug ni un TODO.
4. **Sin reintento automático si falla, sin aviso por email** — spec.md §3 decisión 8, mismo criterio ya aceptado para el auto-import de Google Sheets (spec 026).
5. **La hora programada se interpreta en la zona horaria del servidor** — spec.md §3 decisión 9.
6. **Una única configuración activa por usuario** (`unique` en `userId`) — spec.md, "varias programaciones simultáneas" fuera de alcance.
7. **`ScheduledExportsService.run()` reutiliza `UsersService.exportData()`/`GoogleDriveService.exportToDrive()` tal cual, sin ningún parámetro nuevo** — cuando `destination = DRIVE`, `exportToDrive()` recalcula el export internamente (una llamada extra a `Promise.all` de consultas por ejecución programada, volumen irrelevante para esta app) en vez de añadir una variante que acepte un `AccountExport` ya calculado — evita una rama de código nueva en H4 (ya cerrada y probada) solo para ahorrar una consulta.

### 11.8 Módulo backend

```ts
// backend/src/scheduled-exports/scheduled-exports.module.ts
@Module({
  imports: [AuthGuardModule, UsersModule, GoogleDriveModule],
  controllers: [ScheduledExportsController],
  providers: [ScheduledExportsService, ScheduledExportsScheduler],
})
export class ScheduledExportsModule {}
```

`GoogleDriveModule` debe añadir `GoogleDriveService` a sus `exports` (no lo hace hoy — comprobar al implementar; mismo tipo de ajuste que ya hizo falta con `UsersService`/`UsersModule` en H4, T6.4). `app.module.ts` añade `ScheduledExportsModule`.

### 11.9 Frontend

- `frontend/src/api/scheduled-exports.ts`: `ScheduledExportConfig`, `getScheduledExport()` (`GET`), `saveScheduledExport(input)` (`PUT`), `disableScheduledExport()` (`DELETE`) — mismo patrón que `api/google-drive.ts`.
- `BackupPage.tsx`: nueva sección "Exportación programada", después de la de Google Drive. Formulario: periodicidad (`<select>` Diaria/Semanal/Mensual), campo condicional (día de la semana si Semanal, día del mes 1-28 si Mensual), hora (`<input type="time">`), destino (radio: "Carpeta en el servidor", con un campo de texto opcional para la subcarpeta / "Google Drive", deshabilitado con aviso "Conecta Google Drive primero" si `!isDriveConnected`), checkbox/botón "Activada", botón "Guardar". Debajo, si hay una config guardada: estado de la última ejecución (fecha + "correcta"/el error, mismo patrón visual que la sección de auto-import de Google Sheets en `ImportPage.tsx`) y un botón "Desactivar" (mismo criterio que "Quitar hoja" de `ImportPage.tsx`: no borra la config, solo `enabled: false`).

### 11.10 Tests (H5)

- Backend: `scheduled-exports.e2e-spec.ts` — guardar config válida (LOCAL y DRIVE con conexión ya existente); validaciones (`WEEKLY` sin `dayOfWeek` → 400; `MONTHLY` con `dayOfMonth: 31` → 400; `DRIVE` sin conexión → 400 pidiendo conectar primero); desactivar conserva el resto de la config (`GET` tras `DELETE` sigue devolviendo periodicidad/hora/destino, con `enabled: false`); aislamiento (la config de un usuario nunca aparece/afecta a otro). Unit test de `isDue()` (`scheduled-exports.due.spec.ts`): las 3 periodicidades dan `true`/`false` correctamente; catch-up tras un "ciclo perdido" (el proceso no corrió a la hora exacta, sigue debido en el siguiente barrido); no vuelve a estar debido el mismo día/semana/mes tras un `run` correcto. Unit test de `sanitizeSubfolder()`: quita `..`, barras repetidas y caracteres fuera del conjunto permitido. `scheduled-exports.scheduler.spec.ts`: un fallo de un usuario no interrumpe el barrido de los demás (mismo test que ya existe para `GoogleSheetsImportScheduler`).
- Frontend: `BackupPage.test.tsx` ampliado con la nueva sección — guardar cada periodicidad con su campo condicional, validación en cliente (deshabilita Drive si no conectado), desactivar, estado de la última ejecución (correcta / con error).

### 11.11bis Encontrado durante la implementación

**`GET /scheduled-exports` devolvía un cuerpo vacío, no JSON `null`, cuando no había configuración — bug real, no solo de los tests.** El controlador inicial simplemente devolvía `this.scheduledExportsService.get(userId)` (que resuelve a `null`) para que Nest lo serializara. Nest trata un valor de retorno `null`/`undefined` como "sin cuerpo" y manda la respuesta con `Content-Length: 0` y sin `Content-Type`, en vez de serializar `null` a JSON — encontrado al verificar la ruta en un navegador real (backend-dev + frontend-dev): `fetch(...).json()` fallaba con `SyntaxError: Unexpected end of JSON input` pese a que la petición respondía 200, así que `BackupPage` mostraba "No se ha podido cargar la exportación programada." con una configuración nueva (el caso más común: la primera vez que cualquier usuario visita la página). Los tests e2e no lo habían detectado porque `supertest`/`superagent` tiene el mismo problema por otro motivo (`res.text`/`res.body` tampoco distinguen de forma fiable un cuerpo `"null"` de uno vacío, ver `node_modules/superagent/lib/node/response.js`) — los primeros tests de este grupo comprobaban solo el status 200 y la fila en BD, sin ver el problema real. Corregido inyectando `@Res()` y llamando a `res.json(row)` de Express directamente (que sí serializa `null` de verdad), en vez de dejar que Nest decida — único endpoint de toda la app cuyo valor "vacío" legítimo es `null` en la raíz de la respuesta (el resto de endpoints que devuelven "nada" usan 204 sin cuerpo, `DeleteAccountDto`/`disable()` incluidos, así que no les afecta este mismo problema). Los tests de este endpoint ahora comprueban `res.text === 'null'` explícitamente, verificado también en el navegador real tras la corrección.

### 11.11 Fuera de este plan (H5)

- Igual que spec.md §2 (Fuera de alcance de H5): sin ruta arbitraria, sin email, sin varias programaciones simultáneas, sin selector de zona horaria.
- Sin purga/retención para el destino Drive — solo para `LOCAL` (§11.5).
- Sin exponer `SCHEDULED_EXPORT_LOCAL_DIR` ni ninguna ruta física en las respuestas de la API — el frontend nunca necesita saber dónde vive el fichero en el servidor, solo que existe (`lastRunAt`/`lastRunError`).
