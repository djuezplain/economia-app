# Tasks 011 — Modo offline (registrar movimientos sin conexión)

**Estado:** Listo para implementar
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
- [ ] **T3.3** — `MovementsListPage`, `MovementsSummaryPage`, `CategoriesPage`, `DashboardPage`: cuando `connectivity` (grupo 6, adelantado — ver nota de coordinación) indica offline, leen de IndexedDB en vez de llamar a la API, y muestran un aviso "datos de la última sincronización" (`meta.lastFullSyncAt`).
  *Verificación:* un test por página, forzando `connectivity` a offline y confirmando que se muestran los datos cacheados (poblados de antemano en el test) en vez de un estado de error.

## Grupo 4 — Frontend: escritura offline de movimientos (`plan.md` §5)

- [ ] **T4.1** — `createTransaction`/`updateTransaction`/`deleteTransaction` (`frontend/src/api/transactions.ts`) pasan a ser offline-aware: online, sin cambios de comportamiento (además de actualizar la caché, T3.2). Offline: `createTransaction` genera `id = crypto.randomUUID()`, guarda un registro optimista (`pending: true`, `pendingAction: 'CREATE'`) y encola la entrada; `update`/`delete` actualizan el registro local y encolan igual.
  *Verificación:* tests unitarios de las 3 funciones en ambos estados (online/offline, mockeando `connectivity`), confirmando el registro optimista y la entrada de cola resultante.
- [ ] **T4.2** — Marcador visual "pendiente de sincronizar" en `MovementsListPage` para los registros con `pending: true` (reutiliza `.tag` de spec 010, sin componente nuevo). `RegisterMovementPage` no cambia su lógica (sigue llamando a las mismas funciones de `api/transactions.ts`).
  *Verificación:* los tests existentes de estas páginas siguen en verde sin modificarse; test nuevo que crea/edita/borra en estado offline simulado y comprueba la etiqueta en el listado.

## Grupo 5 — Frontend: procesador de la cola (`plan.md` §5)

- [ ] **T5.1** — Orden de procesamiento por `queueId` y colapso de `CREATE`+`DELETE` del mismo `transactionId` cuando ninguno de los dos se ha sincronizado (sin llamar al servidor).
  *Verificación:* tests unitarios del procesador con una cola simulada — casos límite 1 y 2 de `plan.md §8`.
- [ ] **T5.2** — Ejecución secuencial contra la API (mockeada): `CREATE`→`POST`, `UPDATE`→`PATCH`, `DELETE`→`DELETE` (un 404 en `DELETE` se trata como éxito). Actualización de estado por ítem (`pending`→`syncing`→aplicado/`failed`) y borrado de la cola al aplicar con éxito.
  *Verificación:* test con varios ítems y distintas respuestas simuladas (200, 404 en `DELETE`, 400 en `UPDATE`), confirmando el estado final de cada uno — casos límite 3, 4 y 5.
- [ ] **T5.3** — Fallo por sesión caducada: un 401 que persiste tras el reintento automático ya existente (`api/client.ts`) detiene el resto de la cola (marcada como bloqueada, no fallida ítem a ítem). Tras un `login()` con éxito, `AuthContext` dispara el reprocesado automático de esas entradas.
  *Verificación:* test del procesador simulando 401 persistente, confirmando que el resto de la cola queda bloqueada sin marcarse `failed` una a una; test de `AuthContext` confirmando el reprocesado tras login — caso límite 6.
- [ ] **T5.4** — Coordinación entre pestañas con `navigator.locks` (`navigator.locks.request('sync-queue', ...)`), para que solo una ejecute el procesador a la vez.
  *Verificación:* test que simula dos invocaciones solapadas del procesador (misma pestaña — no es posible levantar dos pestañas reales en Vitest, se documenta como limitación del test) y confirma que la segunda espera a que la primera termine — caso límite 7.
- [ ] **T5.5** — Reintentar/descartar un ítem individual (H5 criterios 3-4 de `spec.md`), con confirmación explícita antes de descartar.
  *Verificación:* tests de las funciones de reintento/descarte (borran o vuelven a poner en `pending` la entrada correspondiente, sin tocar el resto de la cola).

## Grupo 6 — Frontend: conectividad y arranque sin conexión (`plan.md` §6)

- [ ] **T6.1** — `frontend/src/offline/connectivity.ts`: combina `navigator.onLine`/eventos `online`/`offline` con una comprobación activa contra `GET /health`.
  *Verificación:* tests unitarios mockeando `fetch` y los eventos del navegador.
- [ ] **T6.2** — `AuthContext`: distingue en el arranque un fallo de red (offline) de un fallo de sesión real (401/refresh inválido), exponiendo `isOffline` en el contexto.
  *Verificación:* tests de `AuthContext` (ampliando los ya existentes) simulando `apiRefresh()` rechazado por error de red vs por 401.
- [ ] **T6.3** — Guard de rutas protegidas: pantalla "Sin conexión, vuelve a conectarte para continuar" cuando `isOffline && !isAuthenticated` (en vez de redirigir a `/login`). `LoginPage`/`RegisterPage`/`ForgotPasswordPage`/etc. muestran el mismo aviso antes de intentar el envío si `connectivity` indica offline.
  *Verificación:* test de las rutas protegidas y de cada página de acceso con `connectivity` mockeada a offline — caso límite 9.

## Grupo 7 — Frontend: UI del aviso y del listado de pendientes (`plan.md` §7)

- [ ] **T7.1** — Franja de estado en `AppLayout` (H1 de `spec.md`): visible cuando hay algo que mostrar (offline, o hay pendientes/fallidos), con el número de cambios pendientes; colapsada si no hay nada que decir.
  *Verificación:* `AppLayout.test.tsx` ampliado — franja ausente sin pendientes y online; presente offline; presente con N pendientes.
- [ ] **T7.2** — Panel desplegable (al pulsar la franja, o automáticamente mientras se procesa) con el listado de cambios pendientes/fallidos: tipo de movimiento, acción, datos principales, estado, motivo de fallo, botones reintentar/descartar (usa T5.5).
  *Verificación:* test de componente dedicado cubriendo cada estado visual (pendiente, sincronizando, fallido con motivo) y las acciones de reintentar/descartar.
- [ ] **T7.3** — Confirmación al cerrar sesión con cambios pendientes sin sincronizar (evita perderlos en silencio al vaciar la caché, T2.2).
  *Verificación:* test de logout con cola no vacía — caso límite 8.

## Grupo 8 — Service Worker / PWA (`plan.md` §1)

- [ ] **T8.1** — Configurar `vite-plugin-pwa` en `vite.config.ts`: manifest mínimo (nombre, iconos existentes, colores del tema de spec 010), `registerType: 'autoUpdate'`, sin runtime caching de la API (solo shell de la app).
  *Verificación:* `npm run build` genera `sw.js` y el manifest; comprobación manual (no automatizable con Vitest/jsdom) de que la app carga con la red desactivada tras servir un build de producción — documentada aquí igual que la limitación de T5.4, no como test automático.

## Grupo 9 — Cierre de la spec

- [ ] **T9.1** — Checklist de cierre: repasar `spec.md` historia por historia (H1-H6) y marcar cada criterio de aceptación como cubierto por al menos un test automático (o justificar "garantizado por construcción"), igual que en el cierre de specs anteriores. Repasar también los 10 casos límite de `plan.md §8` uno a uno.
  *Verificación:* el propio checklist relleno, añadido al final de este fichero, con la suite completa (frontend + backend) en verde y build/lint limpios en ambos paquetes.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca `[x]` aquí y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo, se para y se ajusta `plan.md` antes de seguir (no se parchea "en silencio").
