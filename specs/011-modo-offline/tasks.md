# Tasks 011 — Modo offline (registrar movimientos sin conexión)

**Estado:** Implementación completa (T0.1-T9.1)
**Fase:** 3 de 4 (Spec ✅ → Plan ✅ → Tasks → Implementación)
**Regla:** una tarea = un commit enfocado (Conventional Commits). No se marca `[x]` una tarea sin que su verificación pase.

**Nota de coordinación (no es una tarea, es contexto para cuando se implemente):** T3.3 necesita saber si hay conexión, pero eso no se construye hasta **T6.1** (`offline/connectivity.ts`). Al implementar, T6.1 se adelanta y se hace antes que T3.3 (mismo criterio que la nota de spec 006 sobre `MovementsLayout`/spec 005: una dependencia real entre tareas de grupos distintos, no un motivo para bloquear nada) — el propio T3.3, al completarse, se marcará citando T6.1 como ya hecho.

**Nota de implementación (T3.1-T3.2, grupo 3):** `plan.md` §4 no especificaba si `syncFullHistory` debía reutilizar `listTransactions`/`listCategories` de `api/*.ts` o llamar a `api.get` directamente. Se optó por llamar a `api.get` directamente: reutilizar los wrappers habría hecho que la hidratación de fondo (disparada automáticamente desde `AuthContext` en cualquier página autenticada) consumiera, de forma no determinista, las mismas respuestas mockeadas (`vi.spyOn(...).mockResolvedValueOnce(...)`) que cada página ya tenía preparadas para sus propias llamadas, rompiendo varios tests existentes (`CategoriesPage.test.tsx`, entre otros) por una carrera entre la sincronización de fondo y la petición propia de la página. Ambas llamadas siguen siendo dos fuentes independientes de la misma información — no hay pérdida de funcionalidad ni de escritura de paso, `syncFullHistory` sigue escribiendo directamente en la caché.

## Grupo 0 — Dependencias y esqueleto

- [x] **T0.1** — Añadir `idb` y `vite-plugin-pwa` a `frontend/package.json`. Crear `frontend/src/offline/` vacío (sin lógica todavía).
  *Verificación:* `npm run build` y `npm run test` en `frontend` siguen en verde, sin cambio de comportamiento (nada nuevo se importa aún). ✅ 159/159 tests, build limpio.

## Grupo 1 — Backend: creación idempotente de movimientos (`plan.md` §2)

- [x] **T1.1** — `CreateTransactionDto`: campo opcional `id` (`@IsOptional() @IsUUID()`). `TransactionsService.create` usa ese `id` si viene informado; si no, genera uno como hoy (sin cambio de comportamiento para las llamadas existentes).
  *Verificación (e2e, ampliando `transactions.e2e-spec.ts`):* crear sin `id` (comportamiento actual, regresión); crear con `id` explícito → el movimiento se crea con ese `id` exacto. ✅
- [x] **T1.2** — Manejo de colisión de PK: helper `isUniqueViolation` (mismo patrón que `isForeignKeyViolation`, código Postgres `23505`, comprobando tanto el nivel superior del error como `.cause`). Mismo `id` + mismo `userId` → devuelve el existente (200, idempotente). Mismo `id` + otro `userId` → 409, sin exponer el registro ajeno.
  *Verificación (e2e):* reintento del mismo `POST` con igual `id` y mismo usuario no duplica el movimiento (se comprueba contando filas); el mismo `id` desde un segundo usuario → 409, y el movimiento del primer usuario no se modifica. ✅ 97/97 unitarios + 191/191 e2e, lint y build limpios.

## Grupo 2 — Frontend: capa IndexedDB (`plan.md` §3)

- [x] **T2.1** — `frontend/src/offline/db.ts`: apertura de la base `economia-offline` (vía `idb`) con los stores `transactions`, `categories`, `syncQueue` (autoincremental), `meta`, y funciones CRUD mínimas tipadas sobre cada uno.
  *Verificación (Vitest + `fake-indexeddb` como devDependency nueva, jsdom no implementa IndexedDB):* test por store cubriendo alta/lectura/borrado y el autoincremento de `queueId`. ✅ 14 tests nuevos.
- [x] **T2.2** — Vaciado de la caché al hacer logout y al detectar un `meta.userId` distinto del usuario ya autenticado (evita que datos económicos de un usuario queden en IndexedDB tras cambiar de cuenta en el mismo navegador — `plan.md` §3, `constitution.md §2`).
  *Verificación:* test que puebla la caché, simula logout y confirma que los 4 stores quedan vacíos; test que puebla la caché con `userId` A y simula login de `userId` B, confirmando el vaciado antes de la siguiente hidratación. ✅ (el propio `AuthContext.logout()` se conectó a `clearAll()` en T3.2, ver nota).

## Grupo 3 — Frontend: lectura offline (`plan.md` §4)

- [x] **T3.1** — `syncFullHistory()`: pagina `GET /transactions` (límite 200) y `GET /categories` hasta agotarlas, vuelca todo en IndexedDB y actualiza `meta.lastFullSyncAt`.
  *Verificación:* test con `api` mockeada devolviendo 3 páginas de movimientos, confirma que las 3 quedan en la store y que se detiene correctamente al recibir una página incompleta. ✅ 4 tests en `sync.test.ts`.
- [x] **T3.2** — Disparo de `syncFullHistory()` al arrancar la app con sesión y conexión (hook en `AuthProvider`, tras `hydrateUser()` — y también en `login()`/`setSessionToken()`, los otros dos sitios donde se establece sesión). Write-through: los wrappers de `api/transactions.ts`/`api/categories.ts` actualizan IndexedDB con cada respuesta real de `GET`, no solo en la hidratación completa. `logout()` vacía la caché (cierra T2.2).
  *Verificación:* ver nota de implementación arriba. Suite completa del frontend: 177/177 en verde sin paralelismo de ficheros (un test preexistente y no relacionado, `RegisterMovementPage` "Cancelar edición", es flaky bajo paralelismo por una condición de carrera de temporización ya presente antes de este grupo — no es una regresión). Lint y build limpios.
- [x] **T3.3** — `MovementsListPage`, `MovementsSummaryPage`, `CategoriesPage`: cuando `connectivity` (T6.1, adelantada) indica offline, leen de IndexedDB en vez de llamar a la API, y muestran un aviso "datos de la última sincronización" (`meta.lastFullSyncAt`). `DashboardPage`: ver nota de implementación.
  *Verificación:* un test offline por página (4, incluido `DashboardPage`), confirmando que no se llama a la API real y que se muestran/avisan los datos correctos. ✅ Suite completa: 210/210, lint y build limpios.

  **Nota de implementación:** `tasks.md` (redactado antes de implementar) incluía `DashboardPage` en esta tarea, igual que `spec.md` H3 la incluía originalmente. Al implementarlo se decidió, con el mismo criterio de "no duplicar más lógica financiera de la necesaria", **no** replicar offline los cálculos del dashboard (ahorro, medias diarias, evolución mensual anual — `dashboard.service.ts`/`dashboard.calculations.ts`, más superficie que las funciones de resumen ya portadas en `offline/calculations.ts` para Movimientos/Resumen). `DashboardPage` pasa a mostrar "Esta página requiere conexión a internet" sin conexión (mismo criterio que H6), sin disparar peticiones de fondo. `spec.md` (H3 criterio 4, H6 criterio 1, decisión 3) y `plan.md` (§1, §3) se actualizaron para reflejarlo, con la nota completa en `spec.md`.

## Grupo 4 — Frontend: escritura offline de movimientos (`plan.md` §5)

- [x] **T4.1** — `createTransaction`/`updateTransaction`/`deleteTransaction` (`frontend/src/api/transactions.ts`) pasan a ser offline-aware: online, sin cambios de comportamiento (además de actualizar la caché, T3.2). Offline: `createTransaction` genera `id = crypto.randomUUID()`, guarda un registro optimista (`pending: true`, `pendingAction: 'CREATE'`) y encola la entrada; `update`/`delete` actualizan el registro local y encolan igual.
  *Verificación:* 12 tests unitarios (`api/transactions.test.ts`, nuevo) de las 3 funciones en ambos estados. ✅ 219/219 tests, lint y build limpios.
- [x] **T4.2** — Marcador visual "pendiente de sincronizar" en `MovementsListPage` para los registros con `pending: true` (reutiliza `.tag` de spec 010, sin componente nuevo). `RegisterMovementPage` no cambia su lógica (sigue llamando a las mismas funciones de `api/transactions.ts`).
  *Verificación:* los tests existentes de estas páginas siguen en verde sin modificarse; test nuevo confirma la etiqueta en el listado. ✅ 220/220 tests, lint y build limpios.

## Grupo 5 — Frontend: procesador de la cola (`plan.md` §5)

- [x] **T5.1** — Orden de procesamiento por `queueId` y colapso de `CREATE`+`DELETE` del mismo `transactionId` cuando ninguno de los dos se ha sincronizado (sin llamar al servidor).
  *Verificación:* tests unitarios del procesador con una cola simulada — casos límite 1 y 2 de `plan.md §8`. ✅
- [x] **T5.2** — Ejecución secuencial contra la API (mockeada): `CREATE`→`POST`, `UPDATE`→`PATCH`, `DELETE`→`DELETE` (un 404 en `DELETE` se trata como éxito). Actualización de estado por ítem (`pending`→`syncing`→aplicado/`failed`) y borrado de la cola al aplicar con éxito.
  *Verificación:* test con varios ítems y distintas respuestas simuladas (200, 404 en `DELETE`, 400 en `UPDATE`), confirmando el estado final de cada uno — casos límite 3, 4 y 5. ✅
- [x] **T5.3** — Fallo por sesión caducada: un 401 que persiste tras el reintento automático ya existente (`api/client.ts`) detiene el resto de la cola (marcada como bloqueada, no fallida ítem a ítem). Tras un `login()` con éxito, `AuthContext` dispara el reprocesado automático de esas entradas.
  *Verificación:* test del procesador simulando 401 persistente — caso límite 6; test de integración en `LoginPage.test.tsx` confirmando el reprocesado tras login. ✅
- [x] **T5.4** — Coordinación entre pestañas con `navigator.locks` (`navigator.locks.request(...)`, con fallback si el navegador no lo soporta), para que solo una ejecute el procesador a la vez. Dentro de la misma pestaña, varias llamadas solapadas a `processQueue()` comparten la misma ejecución (`processingPromise`).
  *Verificación:* test que simula dos invocaciones solapadas del procesador (misma pestaña — no es posible levantar dos pestañas reales en Vitest ni comprobar `navigator.locks`, que jsdom no implementa; se documenta como limitación del test, no del código) y confirma que la API real solo se llama una vez — caso límite 7. ✅
- [x] **T5.5** — Reintentar/descartar un ítem individual (H5 criterios 3-4 de `spec.md`). La confirmación explícita antes de descartar es UI (grupo 7); `discardQueueEntry`/`retryQueueEntry` son las funciones de datos que esa UI llamará.
  *Verificación:* tests de las funciones de reintento/descarte (borran o vuelven a poner en `pending` la entrada correspondiente, sin tocar el resto de la cola). ✅

  **Nota de implementación:** `afterSyncSuccess` (helper interno, no listado como tarea propia) tenía un bug real encontrado por su propio test: al calcular si un movimiento seguía `pending` tras sincronizar una entrada, contaba la propia entrada que se acababa de aplicar como "trabajo pendiente" (todavía no se había borrado de la cola en ese momento), así que un movimiento con una sola entrada en la cola nunca dejaba de marcarse `pending`. Corregido excluyendo explícitamente el `queueId` de la entrada en curso al contar lo que queda. Suite completa del frontend tras el grupo 5: 239/239 (32 ficheros); lint y build limpios.

## Grupo 6 — Frontend: conectividad y arranque sin conexión (`plan.md` §6)

- [x] **T6.1** (adelantada antes de T3.3, ver nota de coordinación) — `frontend/src/offline/connectivity.ts`: combina `navigator.onLine`/eventos `online`/`offline` con una comprobación activa contra `GET /health`. Incluye `hooks/useConnectivity.ts` (envoltorio React).
  *Verificación:* 7 tests unitarios mockeando `fetch` y los eventos del navegador (`connectivity.test.ts`), 2 del hook (`useConnectivity.test.tsx`). ✅
- [x] **T6.2** — `AuthContext` expone `isOffline` (estado en vivo de `offline/connectivity.ts`, vía `subscribe`) en `AuthContextValue`, para que quien consuma el contexto pueda distinguir "no hay sesión" de "no hay sesión porque no hay red".
  *Verificación:* cubierta junto a T6.3 (el valor se ejercita a través de `AppLayout`/`LoginPage`, no con un test aislado de `AuthContext` — este proyecto no tiene un fichero de test dedicado a `AuthContext`, se prueba siempre a través de las páginas que lo consumen, mismo patrón que el resto de la spec 001).
- [x] **T6.3** — Guard de rutas protegidas: `AppLayout` (envuelve las 8 páginas autenticadas) muestra "Sin conexión — vuelve a conectarte para continuar" cuando `isOffline && !isAuthenticated`, en vez de `<Outlet />`. `LoginPage` avisa antes de intentar el envío si `isOffline`, sin llamar a `login()`.
  *Verificación:* 2 tests nuevos en `AppLayout.test.tsx` (aviso sin sesión y offline; con sesión, offline no bloquea nada) — caso límite 9. 1 test nuevo en `LoginPage.test.tsx`. ✅ 242/242 tests, lint y build limpios.

  **Nota de implementación:** `plan.md` §6 asumía que "sin sesión → a /login" ya vivía centralizado en un guard de rutas. Al implementar se comprobó que no es así: cada una de las 8 páginas autenticadas comprueba `isAuthenticated` por su cuenta y muestra su propio aviso — no hay guard centralizado preexistente (`AppLayout` solo decide si mostrar el menú lateral, no si mostrar el contenido). Se añadió el guard offline **solo** en `AppLayout` en vez de replicarlo en las 8 páginas: cubre las 8 sin tocarlas, y es un comportamiento nuevo (no una migración del ya existente "sin sesión" de cada página, que se deja tal cual). `RegisterPage`/`ForgotPasswordPage`/etc. no se tocaron — `LoginPage` es el punto de entrada real de este flujo (recuperar sesión); ampliar el resto de páginas de acceso al mismo criterio queda anotado como mejora futura si hiciera falta, no como parte obligatoria de esta tarea.

## Grupo 7 — Frontend: UI del aviso y del listado de pendientes (`plan.md` §7)

- [x] **T7.1** — Franja de estado (`SyncStatusPanel`, nuevo) dentro de `AppLayout` (H1 de `spec.md`): visible cuando hay algo que mostrar (offline, o hay pendientes/fallidos), con el número de cambios pendientes; colapsada (no renderiza nada) si no hay nada que decir. También dispara `processQueue()` sola al recuperar conexión y al montar si ya hay conexión (H4 criterio 1).
  *Verificación:* 8 tests en `SyncStatusPanel.test.tsx` — ausente online sin pendientes; presente offline; presente con N pendientes y arranca el procesador; dispara el procesador al recuperar conexión. ✅
- [x] **T7.2** — Panel desplegable (al pulsar la franja, o automáticamente mientras algo está `syncing`) con el listado de cambios pendientes/fallidos: acción, datos principales (concepto/importe si están en el payload), estado, motivo de fallo, botones reintentar/descartar (usa T5.5, con confirmación explícita inline antes de descartar).
  *Verificación:* mismo fichero — estados pendiente/fallido, reintentar, descartar con confirmación/cancelación, varios bloqueados por sesión caducada mostrados a la vez. ✅
- [x] **T7.3** — Confirmación al cerrar sesión con cambios pendientes sin sincronizar (evita perderlos de vista en silencio al vaciar la caché, T2.2).
  *Verificación:* 2 tests nuevos en `AppLayout.test.tsx` — pide confirmación y no cierra sesión hasta confirmar; cancelar no cierra sesión — caso límite 8. ✅ 252/252 tests, lint y build limpios (un test preexistente y no relacionado, `RegisterMovementPage` "Cancelar edición", sigue siendo flaky bajo paralelismo — misma condición de carrera ya documentada en T3.2, confirmada de nuevo como preexistente).

  **Nota de implementación:** se extrajo `hooks/useSyncQueue.ts` (estado en vivo de la cola) para que `SyncStatusPanel` y `AppLayout` (necesita el recuento para T7.3) no dupliquen la misma suscripción. Se encontró y corrigió un problema real de aislamiento entre tests (no de producción): `offline/connectivity.ts` y `offline/queueProcessor.ts` guardan estado en variables de módulo (estado de conexión, ejecución en curso, listeners) que sobrevivía entre tests del mismo fichero si no se reseteaba explícitamente — un test que dejaba una ejecución de `processQueue()` a medias hacía que el siguiente test del mismo fichero recibiera esa misma ejecución en vez de una nueva. Añadido `resetForTests()` a `queueProcessor.ts` (mismo patrón que `connectivity.ts`/`RateLimitGuard` del backend) y ambos resets movidos a `setupTests.ts` global, junto al de IndexedDB.

## Grupo 8 — Service Worker / PWA (`plan.md` §1)

- [x] **T8.1** — Configurar `vite-plugin-pwa` en `vite.config.ts`: manifest mínimo (nombre "Mi Economía", icono existente `favicon.svg`, `background_color`/`theme_color` de los tokens de spec 010 — papel `#f3f2f2`/acento cian `#0088b0`), `registerType: 'autoUpdate'`, sin runtime caching de la API (solo shell de la app — el plugin no configura ningún `runtimeCaching`, esa parte la resuelve `offline/db.ts`, no el Service Worker).
  *Verificación:* `npm run build` genera `sw.js`, `workbox-*.js`, `manifest.webmanifest` y `registerSW.js` inyectado en `index.html` (precache de 6 entradas, ~735 KiB). Comprobación manual con la red desactivada (limitación ya documentada en T5.4: no automatizable con Vitest/jsdom) intentada sirviendo el build con `vite preview` y el navegador de la sesión — bloqueada por un permiso de navegación pendiente en este entorno, no verificada de forma interactiva; la generación correcta del Service Worker por parte de `vite-plugin-pwa` en el build (arriba) es la evidencia disponible en su lugar. Lint y suite completa del frontend en verde (252/252 sin paralelismo) tras el cambio de configuración.

  **Nota:** se añadió `.claude/launch.json` (nuevo) con una configuración `frontend-preview` (`vite preview`) para poder servir el build de producción y probarlo en el navegador — utilidad de desarrollo, no parte del código de producción de la spec.

## Grupo 9 — Cierre de la spec

- [x] **T9.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1-H6) y marcar cada criterio de aceptación como cubierto por al menos un test automático (o justificar "garantizado por construcción"), igual que en el cierre de specs anteriores. Repasar también los 10 casos límite de `plan.md §8` uno a uno.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero. Suite completa: backend 97/97 unitarios + 191/191 e2e (sin paralelismo — con paralelismo, ficheros e2e distintos comparten la misma base de test local y chocan entre sí, limitación preexistente del entorno documentada desde T1.1-T1.2, no de este cierre); frontend 261/261 (33 ficheros, sin paralelismo — con paralelismo, un test preexistente y no relacionado de `RegisterMovementPage` es flaky por una condición de carrera de temporización ya documentada desde T3.2). Lint y build limpios en ambos paquetes.

  **Hallazgos reales encontrados y corregidos durante este repaso** (commits separados, no colados en silencio en este commit de cierre): (1) `useCategoriesForType` nunca recibió lectura offline — sin conexión, el formulario "Registrar" no podía elegir categoría, rompiendo H2 criterio 4. (2) `getTransaction` nunca recibió lectura offline — sin conexión, "Editar" un movimiento ya existente fallaba, rompiendo H2 criterio 3. (3) `GoalsPage`/`ImportPage` nunca mostraban el aviso de H6 criterio 1. (4) `HomePage` tampoco, pese a que `spec.md` ya la mencionaba (como "Inicio/Dashboard", redactado de forma ambigua — aclarado de paso). Los 4 tenían un patrón común: se implementó el tratamiento offline en la página "principal" de cada área (Categorías, Movimientos, Dashboard) pero no en las páginas secundarias que dependen de la misma pieza (el hook compartido, o una página que reutiliza el mismo cálculo fuera de alcance).

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca `[x]` aquí y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo, se para y se ajusta `plan.md` antes de seguir (no se parchea "en silencio").

---

## Checklist de cierre — spec 011 (T9.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático (se cita el fichero), o garantizado por construcción/por un test de otra spec (se explica por qué).

### H1 — Saber si estoy offline y si tengo cambios pendientes

- [x] Criterio 1 (aviso persistente, no un toast): `SyncStatusPanel.test.tsx` — "offline, muestra 'Sin conexión'"; es un `<div role="status">` fijo dentro de `AppLayout`, no un componente con temporizador de auto-cierre (garantizado por construcción — no hay ningún `setTimeout` en `SyncStatusPanel.tsx`).
- [x] Criterio 2 (nº de pendientes, sin contador si es 0): `SyncStatusPanel.test.tsx` — "online y sin cambios pendientes, no muestra nada" (0 pendientes → sin franja en absoluto, a fortiori sin contador); "con cambios pendientes, muestra el recuento".
- [x] Criterio 3 (al volver la conexión, se refleja y arranca H4): `SyncStatusPanel.test.tsx` — "al recuperar conexión, dispara el procesador automáticamente".

### H2 — Registrar, editar y eliminar movimientos sin conexión

- [x] Criterio 1 (mismas validaciones locales offline): garantizado por construcción — `RegisterMovementPage.tsx` no cambió su formulario ni su validación HTML al implementar T4.1, solo las funciones de `api/transactions.ts` que llama pasaron a ser offline-aware; `RegisterMovementPage.test.tsx` (T4.2 y el test offline añadido en el cierre) confirma que el flujo de guardar sigue funcionando igual.
- [x] Criterio 2 (aparece marcado "pendiente" al guardar offline): `MovementsListPage.test.tsx` — "un movimiento con pending:true... se marca 'pendiente de sincronizar'".
- [x] Criterio 3 (editar/eliminar offline se refleja igual, ya sincronizado o creado offline): `api/transactions.test.ts` (`updateTransaction`/`deleteTransaction` offline), `RegisterMovementPage.test.tsx` (edición completa offline, añadida en el cierre tras encontrar el hueco de `getTransaction`).
- [x] Criterio 4 (categoría entre las cacheadas; categoría nueva requiere conexión): `useCategoriesForType.test.tsx` (offline, añadido en el cierre); el aviso de "requiere conexión" para crear categorías vive en `CategoriesPage.test.tsx` (T3.3, botones deshabilitados).

### H3 — Consultar movimientos, categorías y resumen sin conexión

- [x] Criterio 1 (caché explícita del histórico completo): `sync.test.ts` (`syncFullHistory`, paginación completa).
- [x] Criterio 2 (offline muestra la copia local, incluidos los pendientes de H2): `MovementsListPage.test.tsx`/`CategoriesPage.test.tsx`/`MovementsSummaryPage.test.tsx` (T3.3) — el mismo store de `transactions` que lee `buildOfflineListResult` es el que escribe `createTransactionOffline`/`updateTransactionOffline` (T4.1), así que los pendientes ya salen incluidos por construcción; el test de la etiqueta "pendiente" en `MovementsListPage.test.tsx` lo confirma en la práctica.
- [x] Criterio 3 ("de la última sincronización" visible offline): mismos tests de T3.3 — cada página comprueba el texto `/Sin conexión/`.
- [x] Criterio 4 (Objetivos/Presupuestos/Importar/Inicio/Dashboard fuera de esta historia): ver H6.

### H4 — Procesar los cambios pendientes con listado visible

- [x] Criterio 1 (listado automático al recuperar conexión, sin confirmación): `SyncStatusPanel.test.tsx` — dispara `processQueue()` solo, sin ningún botón de "confirmar sincronización" en el componente (garantizado por construcción).
- [x] Criterio 2 (estado en tiempo real pendiente→sincronizando→aplicado/fallido): `queueProcessor.test.ts` (`status: 'syncing'` antes de cada intento) + `SyncStatusPanel.test.tsx` (etiquetas "Pendiente"/"Sincronizando…"/"Fallido"). Matiz: "aplicado" no queda como un estado visible aparte — el ítem desaparece del listado en cuanto se confirma, en vez de mostrar un tic momentáneo; se considera un cumplimiento razonable del criterio (ya no está "pendiente" en ningún sentido) y se documenta aquí como simplificación deliberada, no como hueco.
- [x] Criterio 3 (orden de creación): `queueProcessor.test.ts` — "se procesa en el orden de creación (queueId), no otro".
- [x] Criterio 4 (no bloquea la interfaz): garantizado por construcción — `processQueue()` es enteramente asíncrono (`async`/`await`, sin ningún bloqueo síncrono de la UI ni `window.confirm`/`alert`).

### H5 — Resolver cambios fallidos

- [x] Criterio 1 (falla con motivo, no bloquea el resto): `queueProcessor.test.ts` — "UPDATE con 400/409... falla... sin bloquear el resto de la cola".
- [x] Criterio 2 (el fallo permanece visible hasta decidir algo): garantizado por construcción — una entrada `failed` solo se borra de `syncQueue` desde `retryQueueEntry`/`discardQueueEntry`, nunca sola; `SyncStatusPanel.test.tsx` lo ejercita mostrando el motivo tras recargar el panel.
- [x] Criterio 3 (reintentar individualmente): `queueProcessor.test.ts` + `SyncStatusPanel.test.tsx` ("permite reintentar").
- [x] Criterio 4 (descartar con confirmación explícita): `queueProcessor.test.ts` (`discardQueueEntry`) + `SyncStatusPanel.test.tsx` ("pide confirmación explícita antes de aplicarse", "cancelar... no borra el ítem").
- [x] Criterio 5 (sesión caducada: pide reiniciar sesión, reintento automático tras hacerlo): `queueProcessor.test.ts` (`retrySessionExpiredEntries`) + `LoginPage.test.tsx` (integración completa: login real → reprocesado automático).

### H6 — Aviso claro de qué requiere conexión

- [x] Criterio 1 (Categorías/Objetivos/Presupuestos/Importar/Inicio/Dashboard avisan): `CategoriesPage.test.tsx` (botones deshabilitados), `GoalsPage.test.tsx`, `ImportPage.test.tsx`, `HomePage.test.tsx`, `DashboardPage.test.tsx` — un test offline dedicado por página, todos añadidos entre T3.3 y el cierre.
- [x] Criterio 2 (sin sesión y sin conexión → "vuelve a conectarte"): `AppLayout.test.tsx` (T6.3) + `LoginPage.test.tsx` (aviso antes de intentar el envío).

### Casos límite de `plan.md §8`

1. [x] Crear+editar offline antes de sincronizar → un solo `POST`: `queueProcessor.test.ts` + `api/transactions.test.ts`.
2. [x] Crear+borrar offline sin sincronizar → ninguna petición: `queueProcessor.test.ts` (colapso).
3. [x] Reintento de `POST` que sí se aplicó → idempotente: `transactions.e2e-spec.ts` (backend, T1.2).
4. [x] `DELETE` de algo ya borrado desde otro dispositivo → éxito: `queueProcessor.test.ts`.
5. [x] `UPDATE`/`DELETE` con categoría borrada desde otro dispositivo → falla, no bloquea el resto: `queueProcessor.test.ts` (400 de validación).
6. [x] Refresh token agotado offline mucho tiempo → sesión caducada bloquea el resto, reintento tras login: `queueProcessor.test.ts` + `LoginPage.test.tsx`.
7. [x] Dos pestañas recuperan conexión a la vez → una sola ejecución: `queueProcessor.test.ts` (single-flight, límite de jsdom documentado en T5.4 para `navigator.locks` real).
8. [x] Cerrar sesión con pendientes → confirmación: `AppLayout.test.tsx` (T7.3).
9. [x] Recargar offline sin sesión → "vuelve a conectarte": `AppLayout.test.tsx` (T6.3).
10. [x] Build genera un Service Worker consistente: verificado en el build (T8.1) — la comprobación manual en navegador quedó bloqueada por un permiso de este entorno, documentada como limitación, no como pendiente silencioso.
