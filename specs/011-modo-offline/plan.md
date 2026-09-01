# Plan 011 — Modo offline (registrar movimientos sin conexión)

**Basado en:** `specs/011-modo-offline/spec.md` (aprobada).

## 1. Arquitectura general

Tres piezas nuevas en el frontend, ningún cambio de infraestructura en el backend salvo uno puntual (§2):

1. **Service Worker** (precache del shell de la app) → hace que la app cargue sin red (H6 criterio 2 aparte, ver §4).
2. **Caché local en IndexedDB** (copia de movimientos y categorías + cola de cambios pendientes) → hace que Movimientos/Categorías/Resumen/Dashboard se puedan leer offline (H3) y que los cambios offline sobre movimientos sean posibles (H2).
3. **Procesador de cola** que, al recuperar conexión, aplica los cambios pendientes contra la API real en orden, y expone su estado a la UI (H4/H5).

Librerías nuevas propuestas (ninguna toca `constitution.md §3`, que fija framework/BD/ORM/auth/testing, no cada dependencia puntual):

- `vite-plugin-pwa` (Workbox) para el Service Worker — generación y versionado del precache ligados al build de Vite, en vez de mantener un `sw.js` a mano y arriesgarse a servir assets cacheados desincronizados de un build nuevo.
- `idb` (envoltorio promesificado de IndexedDB, de Jake Archibald, ~1 KB) — la API nativa de IndexedDB es basada en eventos y muy verbosa; `idb` es el estándar de facto para no reimplementar ese boilerplate.

## 2. Cambio en backend: creación idempotente de movimientos

**Problema:** un movimiento creado offline necesita un `id` antes de que exista conexión (para poder mostrarlo ya en el listado y para que ediciones/borrados posteriores, también offline, sepan a qué movimiento se refieren). Hoy `transactions.id` lo genera siempre el servidor (`defaultRandom()`, `backend/src/db/schema/transactions.schema.ts`).

**Decisión:** el cliente puede generar el `id` (UUID v4) en el momento de crear el movimiento offline y mandarlo en el `POST`. El servidor lo usa si viene informado; si no viene (todas las creaciones online actuales, sin cambios), sigue generándolo él como hasta ahora.

- `CreateTransactionDto` (`backend/src/transactions/dto/create-transaction.dto.ts`): nuevo campo `@IsOptional() @IsUUID() id?: string`.
- `TransactionsService.create`: si `dto.id` viene informado, se usa como PK del insert.
  - **Idempotencia (reintento tras una respuesta perdida, H5):** si el insert falla por violación de unicidad de PK (mismo patrón ya usado en el proyecto para distinguir errores de Postgres — ver nota de `constitution.md` sobre `isForeignKeyViolation`, aquí un `isUniqueViolation` análogo para el código `23505`), se busca el registro existente con ese `id`:
    - Si pertenece al mismo `userId` que hace la petición → se devuelve tal cual (200), es un reintento del mismo cambio, no un movimiento nuevo.
    - Si pertenece a otro usuario (colisión de UUID, probabilísticamente irrelevante pero no descartable si un cliente manipulado la fuerza) → 409, sin exponer ni tocar el registro ajeno — no se relaja el aislamiento por usuario (`constitution.md §2`).
- No se toca `UpdateTransactionDto` ni `PATCH`/`DELETE`: ya son idempotentes por `id` (aplicar el mismo `PATCH` dos veces dos el mismo resultado; un `DELETE` sobre un `id` ya borrado es el único caso nuevo a decidir — ver §6).
- **Migración de base de datos: ninguna.** `id` ya es una columna `uuid` con PK; pasar un valor explícito en el insert en vez de dejar `defaultRandom()` no requiere tocar el esquema.

No se expone el origen del `id` (si lo puso el cliente o el servidor) en la respuesta — no lo necesita ningún consumidor.

## 3. Modelo de datos local (IndexedDB, vía `idb`)

Una base de datos por navegador, `economia-offline`, con estos object stores:

- **`transactions`** — key path `id`. Espejo de `Transaction` (`frontend/src/api/transactions.ts`), más dos campos locales: `pending: boolean` (tiene algún cambio en la cola sin confirmar) y `pendingAction: 'CREATE' | 'UPDATE' | 'DELETE' | null`.
- **`categories`** — key path `id`. Espejo de `Category` (necesarias para el desplegable del formulario de movimiento y para pintar Categorías/Dashboard offline).
- **`syncQueue`** — key path `queueId` (autoincremental, para que el orden de inserción sea el de procesamiento, H4 criterio 3). Cada entrada:
  ```
  {
    queueId: number,        // autoincremental
    entity: 'transaction',
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    transactionId: string,  // el id (cliente o servidor) del movimiento afectado
    payload: object | null, // body para CREATE/UPDATE; null en DELETE
    createdAt: string,      // ISO, momento en que se encoló offline
    status: 'pending' | 'syncing' | 'failed',
    failureReason: string | null,
    failureKind: 'validation' | 'not_found' | 'session_expired' | null,
  }
  ```
- **`meta`** — pares clave/valor sueltos: `lastFullSyncAt` (para mostrar "datos de la última sincronización", H3 criterio 3) y `userId` (para invalidar la caché completa si cambia el usuario autenticado en el mismo navegador — ver §6).

Todo el store se vacía al hacer logout o al detectarse un `userId` distinto al de la última sesión cacheada — evita que los datos económicos de un usuario queden accesibles (aunque sea leyendo IndexedDB) tras cerrar sesión en un dispositivo compartido, coherente con `constitution.md §2` (aislamiento por usuario).

## 4. Capa de sincronización de lectura (hidratar y mantener la caché)

- **Hidratación completa** (`syncFullHistory()`): pagina `GET /transactions` (usando el `limit` máximo ya soportado, 200) hasta agotar páginas, y `GET /categories`, y vuelca todo en `transactions`/`categories`. Se ejecuta:
  1. Al arrancar la app con sesión válida y conexión.
  2. Al terminar de procesar la cola de pendientes con éxito (para traer el estado real del servidor: `updatedAt`, posibles cambios hechos desde otro dispositivo, etc.).
- **Escritura de paso** (write-through): cualquier respuesta de `GET /transactions`, `GET /transactions/:id`, `GET /categories` que ya se pide hoy durante el uso normal de la app también actualiza el registro correspondiente en IndexedDB, sin esperar a la siguiente hidratación completa.
- No hay sincronización en segundo plano periódica (p. ej. cada minuto) — fuera de alcance de la spec (sin tiempo real entre dispositivos, spec §2).

## 5. Cola de sincronización de escritura (movimientos)

`frontend/src/offline/queue.ts` centraliza esto; las páginas de movimientos (`RegisterMovementPage`, `MovementsListPage`) no implementan lógica offline por sí mismas, llaman a las mismas funciones de `api/transactions.ts` de siempre, que internamente:

- **Online:** llaman a la API real, y de paso actualizan la caché IndexedDB con la respuesta (igual que cualquier otro GET, §4).
- **Offline:**
  - `createTransaction`: genera `id = crypto.randomUUID()`, guarda el registro optimista en `transactions` (`pending: true`, `pendingAction: 'CREATE'`) y encola `{ action: 'CREATE', transactionId: id, payload }`. Devuelve el registro optimista (mismo tipo `Transaction` que devolvería el servidor) para que el código de la página no distinga los dos casos.
  - `updateTransaction`/`deleteTransaction`: actualizan el registro local en `transactions` (o lo marcan borrado) y encolan `{ action: 'UPDATE' | 'DELETE', transactionId, payload }`.

**Procesador de cola** (arranca al recuperar conexión, H4 criterio 1; también permite reintento manual de un ítem, H5 criterio 3):

1. Lee `syncQueue` ordenada por `queueId` (orden de creación, H4 criterio 3).
2. **Optimización sin red:** si para un mismo `transactionId` hay un `CREATE` seguido de un `DELETE` y ninguno de los dos se ha sincronizado todavía, se eliminan ambos de la cola sin llamar al servidor — el movimiento nunca llegó a existir para el backend, no hay nada que revertir.
3. Procesa cada entrada restante en orden, secuencialmente (no en paralelo — evita que un `UPDATE` adelante a su propio `CREATE`):
   - `CREATE` → `POST /transactions` con el `id` generado (§2, idempotente si ya se había enviado antes).
   - `UPDATE` → `PATCH /transactions/:id`. Si el servidor responde 404 → ver punto 5.
   - `DELETE` → `DELETE /transactions/:id`. Un 404 aquí se trata como éxito (el estado deseado — que no exista — ya se cumple; no es un fallo, H5 no aplica a este caso).
4. Cada entrada procesada con éxito se borra de `syncQueue` y su registro en `transactions` pasa a `pending: false`.
5. **Fallos** (H5): la entrada pasa a `status: 'failed'` con `failureReason`/`failureKind` según la respuesta:
   - 400/409 de validación o de FK (ej. categoría ya no existe) → `failureKind: 'validation'`, mensaje tomado del `message` de la respuesta (ya son mensajes claros, reutilizados tal cual — mismo patrón que usa el resto de la app).
   - 404 en `UPDATE` (el movimiento ya no existe, borrado desde otro sitio) → `failureKind: 'not_found'`.
   - 401 que persiste tras el reintento automático de refresco ya existente (`api/client.ts`, `refreshHandler`) → `failureKind: 'session_expired'`. Al detectar el primer fallo de este tipo, **se detiene el procesamiento del resto de la cola** (no tiene sentido seguir intentando: todos fallarán igual sin sesión) y se marca el resto de entradas pendientes como bloqueadas por sesión caducada, no como fallidas una a una.
   - El resto de entradas sigue procesándose con normalidad tras un fallo de validación/not_found individual (H5 criterio 1: no bloquea el resto).
6. Reintentar un ítem (H5 criterio 3) vuelve a ponerlo en `pending` y repite el paso 3 solo para ese ítem. Descartarlo (H5 criterio 4) lo borra de `syncQueue` sin tocar el servidor — si era un `CREATE` nunca sincronizado, también se borra el registro optimista de `transactions`.
7. Reintento tras volver a iniciar sesión (H5 criterio 5): `AuthContext`, tras un `login()` con éxito, dispara automáticamente el reprocesado de las entradas marcadas `session_expired`.

**Coordinación entre pestañas:** si el usuario tiene la app abierta en varias pestañas, solo una debe procesar la cola a la vez (si no, un mismo cambio podría intentarse dos veces en paralelo). Se usa la [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) (`navigator.locks.request('sync-queue', ...)`, soportada en los navegadores modernos que ya soportan Service Workers) para que solo una pestaña ejecute el procesador; las demás siguen leyendo el mismo IndexedDB y ven los resultados en cuanto la que procesa termina cada ítem.

## 6. Autenticación y arranque sin conexión (H6 criterio 2)

`AuthContext.tsx` hoy trata "no hay red" igual que "no hay sesión válida" (ambos casos caen en el mismo `catch` de `apiRefresh()`, spec 001 T3.5). Cambios:

- Un nuevo módulo `frontend/src/offline/connectivity.ts` expone el estado de conexión: combina `navigator.onLine`/eventos `online`/`offline` con una comprobación activa ligera contra `GET /health` (ya existe, `backend/src/health`) cuando `navigator.onLine` es `true` pero no se ha confirmado recientemente que el backend responde — `navigator.onLine` por sí solo da falsos positivos (conectado a una red sin salida a internet).
- En el efecto de arranque de `AuthProvider`, si `apiRefresh()` falla y en ese momento `connectivity` indica offline, se distingue explícitamente de un fallo de sesión real: se expone `isOffline: true` en el contexto de auth en vez de limitarse a `isAuthenticated: false`.
- Un guard de rutas (mismo sitio que hoy decide "sin sesión → a /login", dentro de `AppLayout`/rutas protegidas) muestra una pantalla dedicada "Sin conexión — vuelve a conectarte para continuar" cuando `isOffline && !isAuthenticated`, en vez de redirigir a `/login` (que necesitaría red para poder autenticar igualmente).
- `LoginPage`/`RegisterPage`/etc. comprueban `connectivity` antes de intentar el envío: si están offline, muestran el mismo aviso en vez de lanzar la petición y obtener un error de red poco claro.
- Nada de esto persiste el token ni cambia `token-store.ts` — sigue en memoria únicamente (spec 011 §4 decisión 5, spec 001).

## 7. UI: dónde vive el aviso y el listado de pendientes

- **Sin rutas nuevas** — spec 005 fijó las 8 páginas autenticadas con menú lateral; esta spec no añade una novena. El aviso de conexión (H1) y el panel de cambios pendientes (H4/H5) viven dentro de `AppLayout.tsx` (el layout compartido por esas 8 páginas), como una franja fija arriba del contenido: siempre visible si hay algo que mostrar (offline, o hay pendientes/fallidos), colapsada si no hay nada que decir.
- La franja es expandible: al pulsarla (o automáticamente mientras se están procesando cambios) se despliega el listado de H4/H5 (cada entrada con su estado, motivo de fallo, y los botones reintentar/descartar).
- Los movimientos con `pending: true` se marcan visualmente en `MovementsListPage` (spec 006) con la misma información que ya usa el listado, añadiendo una etiqueta "pendiente de sincronizar" (reutiliza el sistema de `.tag` de spec 010, sin inventar un componente nuevo).

## 8. Casos límite a cubrir con tests

1. Crear un movimiento offline, editarlo offline otra vez antes de recuperar conexión → un solo `POST` (con el `PATCH` aplicado después) al sincronizar, nunca dos creaciones.
2. Crear y borrar el mismo movimiento offline sin recuperar conexión entre medias → no se envía ninguna petición al sincronizar (§5 punto 2).
3. Reintentar un `POST` de creación que en realidad sí llegó a aplicarse en el servidor (la respuesta se perdió) → idempotente, no duplica el movimiento (§2).
4. `DELETE` de un movimiento que otro dispositivo ya borró mientras se estaba offline → se trata como éxito, no como fallo.
5. `UPDATE`/`DELETE` de un movimiento cuya categoría fue borrada desde otro dispositivo mientras se estaba offline → falla con motivo claro, no bloquea el resto de la cola.
6. Se agota el refresh token estando offline mucho tiempo (token de sesión caducado) → el primer fallo de sesión detiene el resto de la cola sin marcarla toda como "fallida" ítem a ítem; tras volver a iniciar sesión, se reprocesa sola.
7. Dos pestañas abiertas a la vez recuperan conexión simultáneamente → la cola se procesa una sola vez (Web Locks), sin duplicados.
8. Cerrar sesión con cambios pendientes sin sincronizar → se avisa antes de vaciar la caché de que hay cambios sin guardar (evita perderlos en silencio); si el usuario confirma, se vacía (§3).
9. Recargar la app offline sin sesión en memoria → pantalla "vuelve a conectarte", no un error de red críptico ni una app en blanco.
10. `npm run build` de producción (`tsc -b && vite build`) genera un Service Worker consistente con el hash de los assets del build — verificado manualmente, no con un test automático (no es una unidad de lógica de negocio).

## 9. Fuera de este plan

Todo lo ya marcado como fuera de alcance en `spec.md §2` (categorías/objetivos/presupuestos/importación offline, resolución automática de conflictos de servidor, tiempo real, sesión persistida sin red, push, UI de instalación guiada).
