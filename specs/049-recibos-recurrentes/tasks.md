# Tasks — Spec 049 (recibos recurrentes: avisos, importes variables y conciliación)

**Fase:** 3 de 4 (aprobado)

Orden de plan.md §7: modelo → funciones puras → H2 (variable) → H3 (conciliación) → H1 (avisos) → exportación y cierre. Cada tarea es como mucho un commit (constitution §4) y no se da por hecha si rompe un test existente.

## Grupo 1 — Modelo de datos

- **T1.1** — Esquema y migración `0032_recurring_reminders_reconciliation` (plan.md §1):
  - `recurring_transactions`: `variable_amount`, `reminder_enabled`, `reminder_days_before` con su `CHECK (0..7)`.
  - Enum `recurring_resolution_status` + `RECONCILED` (el `ALTER TYPE ... ADD VALUE` fuera de transacción); `recurring_occurrence_resolutions.reconciled_automatically`; índice único parcial `recurring_resolutions_transaction_uidx`.
  - Tablas `recurring_reconciliation_dismissals` y `recurring_reminders_sent`, exportadas desde `schema/index.ts`.
  - `users.recurring_reminder_emails`.
  - Generar con `drizzle-kit generate`, revisar el SQL a mano y aplicar contra `economia_dev` y `economia_test`.
  - **Antes de aplicar:** comprobar en `economia_dev` que ninguna `transaction_id` se repite hoy en `recurring_occurrence_resolutions`; si hubiera, el índice único fallaría y hay que parar y decidir con Diego.
  - Aceptación: la migración se aplica en limpio sobre una base con datos de la spec 047; los tests existentes siguen en verde.

## Grupo 2 — Funciones puras (tests primero)

- **T2.1** — `recurring.estimate.ts`: `estimateAmount` con `decimal.js` (plan.md §2). Tests: 0, 1, 2, 3 y más de 3 importes; solo cuentan los 3 más recientes; media periódica redondeada `ROUND_HALF_UP` (10 + 10 + 10,01 → 10,00).
- **T2.2** — `recurring.reconciliation.ts`: constantes `RECONCILIATION_WINDOW_DAYS = 5` y `VARIABLE_AMOUNT_TOLERANCE = 0.4`, `isCandidate` y `matchOccurrences` (plan.md §2). Tests: emparejamiento único → `automatic`; dos movimientos para una ocurrencia y un movimiento para dos ocurrencias → `ambiguous`; ±5 días casa y ±6 no (también cruzando fin de mes y de año); margen variable en el borde exacto del 40 % y justo fuera; plantilla fija con un céntimo de diferencia no casa; distinto tipo o categoría no casa; par descartado excluido; orden de candidatos (importe y luego fecha).
- **T2.3** — `recurring.reminders.ts`: `remindersDue` (plan.md §2). Tests: `reminderDaysBefore` 0 y 7 en ambos bordes del intervalo; ya enviada; fecha pasada no avisa.

## Grupo 3 — H2: importe variable

- **T3.1** — Backend: DTOs de plantilla con `variableAmount`; `occurrences()` devuelve la estimación como `amount` y `estimated: true` en previstas variables, con una sola consulta de los 3 últimos importes por plantilla (plan.md §3.1, `ROW_NUMBER()`); `confirm` exige `amount` en plantillas variables (400 si falta). Tests e2e: estimación con 0, 2 y 4 ocurrencias resueltas; tras corregir el importe de un movimiento confirmado, la estimación cambia; confirmar variable sin importe → 400; fija sin importe sigue funcionando como en la 047; aislamiento (usuario B no ve ni confirma).
- **T3.2** — Frontend: casilla "Importe variable" en el formulario de `RecurringPage`; `OccurrenceRow` muestra "≈" con estilo atenuado y, al confirmar una variable, abre el importe relleno con la estimación y con el foco puesto. Tests de componente para ambos casos y para que una fija no cambie.

## Grupo 4 — H3: conciliación

- **T4.1** — `RecurringReconciliationService.reconcileImported` y su enganche en `ImportService.importWorkbook` (plan.md §3.2 y §3.3): `INSERT ... RETURNING`, conciliación dentro de la misma transacción, `reconciledCount` en `ImportConfirmResult` y (opcional) en `GoogleSheetsImportRunResult`. `ImportModule` importa `RecurringTransactionsModule`. Tests e2e importando un `.xlsx`: caso único → ocurrencia `RECONCILED` con `reconciled_automatically = true` y sin movimiento nuevo creado por la app; caso ambiguo → nada conciliado; sin plantillas → la importación funciona igual que antes; reimportar el mismo fichero → no concilia de nuevo; un fallo forzado tras los inserts deshace también las conciliaciones.
- **T4.2** — Endpoints manuales (plan.md §3.4): `reconcile`, `DELETE .../reconciliation`, `dismiss`, `candidates`. Tests e2e: conciliar a mano; 409 si la ocurrencia ya está resuelta o el movimiento ya resuelve otra; 400 si la fecha no es una ocurrencia; deshacer devuelve a pendiente sin borrar el movimiento y no se puede deshacer una `CONFIRMED`; deshacer + reimportar no vuelve a conciliar (plan.md §5); `candidates` ordena primero los que cumplen `isCandidate`; 404 con plantilla o movimiento de otro usuario en cada endpoint.
- **T4.3** — `GET /reconciliation` (`suggestions`, `possibleDuplicates`, `recentlyReconciled`) y `resolve-duplicate` (plan.md §3.2). Tests e2e: un movimiento registrado a mano que encaja sale como sugerencia y no se concilia solo; un confirmado con su importado gemelo sale en `possibleDuplicates`, también con fecha anterior a 90 días; `resolve-duplicate` borra el creado y enlaza el importado en una transacción; un descarte hace desaparecer la sugerencia o el duplicado; plantilla pausada no genera sugerencias pero sus duplicados siguen saliendo; aislamiento.
- **T4.4** — Frontend: secciones "Por conciliar" y "Conciliados recientemente" en `RecurringPage`, acción "Vincular a un movimiento existente" en `OccurrenceRow`, confirmación explícita antes de "Quedarme con el importado". Tests de componente: elegir sugerencia, "Ninguno de estos", resolver duplicado (pide confirmación; cancelar no llama a la API), deshacer, sección oculta sin datos.
- **T4.5** — Resultado de la importación en pantalla: `ImportPage`, tanto en el resultado de importar un Excel como en la última ejecución de Google Sheets, muestra "N recibos conciliados" cuando `reconciledCount > 0`. Test de componente con y sin el campo (resultados guardados antes del cambio).

## Grupo 5 — H1: avisos

- **T5.1** — Backend de configuración: `reminderEnabled`/`reminderDaysBefore` en los DTOs de plantilla (400 fuera de 0..7); `recurringReminderEmails` en `PATCH`/`GET /users/me`. Tests e2e de validación y de que el campo del perfil se guarda.
- **T5.2** — `RecurringRemindersScheduler` y plantilla `recurringRemindersEmail` (plan.md §3.5), con "hoy" calculado en `Europe/Madrid`. Test de la plantilla (líneas, "≈" en estimados, enlaces a `/recurring` y `/profile`). Tests e2e con un `MailService` falso y la fecha controlada: varias ocurrencias → un solo email; segunda ejecución el mismo día → nada; interruptor global apagado → nada; plantilla pausada, ocurrencia confirmada, omitida o conciliada → nada; usuario no `ACTIVE` → nada; fallo de envío → se borran las filas de `recurring_reminders_sent` y la ejecución siguiente reenvía; fallo de un usuario no impide los demás.
- **T5.3** — Frontend: casilla "Avisarme por email" y selector de días en el formulario de plantilla; sección "Próximos recibos" en `HomePage` (vencidas primero; oculta sin datos y sin conexión); interruptor en `ProfilePage`. Tests de componente para cada uno.

## Grupo 6 — Exportación, importación de datos y cierre

- **T6.1** — Exportación e importación de datos (plan.md §3.6): `recurringReconciliationDismissals` en ambas (clave opcional, como hizo la 047 con `OPTIONAL_ECONOMIC_DATA_KEYS`); `isValidResolutionRow` acepta `RECONCILED` y `reconciled_automatically`; `recurring_reminders_sent` no se exporta. Tests e2e: exportar e importar una cuenta con resoluciones conciliadas y descartes; importar una copia anterior a esta spec sigue funcionando.
- **T6.2** — Borrado de cuenta con datos en todas las tablas nuevas: no queda ninguna fila (test e2e).
- **T6.3** — Cierre: `npm test` de backend (unitarios + e2e) y frontend, `tsc -b` y oxlint en verde; revisión visual en navegador de Recurrentes, Inicio, calendario y perfil en escritorio y a 375 px; contrastar la spec historia por historia contra lo implementado (como pidió la spec 001 T9.2); actualizar el README (estado de la spec) y rellenar el checklist de cierre de este fichero.

---

## Checklist de cierre — spec 049

- [x] **T1.1** — Migración `0032_recurring_reminders_reconciliation`. Comprobada también aplicándola, dentro de una transacción como hace drizzle, sobre una base con datos de la spec 047: conserva las resoluciones (con `reconciled_automatically = false`), las plantillas reciben los valores por defecto, el `CHECK` rechaza 8 días y el índice único impide enlazar un movimiento a dos ocurrencias. **Pendiente para Diego antes de desplegar:** comprobar en producción que ningún `transaction_id` se repite en `recurring_occurrence_resolutions` (consulta en el mensaje de cierre); si se repitiera, la migración fallaría.
- [x] **T2.1–T2.3** — `estimateAmount`, `isCandidate`/`matchOccurrences` y `remindersDue`, con 28 tests unitarios escritos antes que el código que los usa.
- [x] **T3.1** — Importe variable en backend: estimación en una sola consulta (`recurring-estimates.query.ts`, `ROW_NUMBER()`), importe obligatorio al confirmar una variable. 9 tests e2e. Las ocurrencias ya resueltas devuelven `estimated: false` y el importe de la plantilla (el real está en su movimiento).
- [x] **T3.2** — Casilla "Importe variable" con texto de ayuda; "≈" atenuado y confirmación en dos pasos en `OccurrenceRow`. 7 tests de componente.
- [x] **T4.1** — `RecurringReconciliationService.reconcileImported` dentro de la transacción de `importWorkbook`; `reconciledCount` en el resultado. 11 tests e2e. **Desviación del plan, más estricta:** el plan decía que la conciliación automática "solo mira los movimientos recién insertados". Se buscan candidatos entre **todos** los movimientos sin enlazar de la ventana y solo se concilian parejas inequívocas cuyo movimiento acaba de insertarse. Así, si Diego ya había registrado a mano ese cargo, la ocurrencia no se concilia sola con el importado: queda como sugerencia con los dos candidatos. Se mantiene lo importante del plan: un movimiento que ya existía nunca se concilia en una importación posterior.
- [x] **T4.2** — Endpoints `reconcile`, `DELETE …/reconciliation`, `dismiss` y `candidates`. 8 tests e2e. Añadido no previsto: omitir una ocurrencia ya conciliada devuelve 409 (antes de esta spec solo se protegía la confirmada), y deshacer y resolver duplicados validan la fecha (sin eso, una fecha mal formada daba un 500 de Postgres).
- [x] **T4.3** — `GET /reconciliation` y `resolve-duplicate`. 10 tests e2e.
- [x] **T4.4** — `ReconciliationPanel` (por conciliar, posibles duplicados, conciliados recientemente) y "Vincular a un movimiento existente" en `OccurrenceRow`. Si falla la carga del resumen de conciliación, el resto de Recurrentes se ve igual. 17 tests de componente y de página.
- [x] **T4.5** — "N recibos recurrentes conciliados" en el resultado de la importación (Excel, ejecución manual y última ejecución automática de Google Sheets, que comparten `ImportResultSummary`). Tolera resultados guardados antes de esta spec. 3 tests.
- [x] **T5.1** — `reminderEnabled`/`reminderDaysBefore` en plantillas y `recurringReminderEmails` en el perfil. 4 tests e2e.
- [x] **T5.2** — `RecurringRemindersService` + `RecurringRemindersScheduler` (8:00 `Europe/Madrid`) + plantilla `recurringRemindersEmail`, que escapa el HTML de los conceptos. 4 tests de plantilla, 3 unitarios de la fecha en Madrid y 9 e2e con un `MailService` falso. La lógica (`sendDueReminders(today)`) está separada del cron para poder probarla con una fecha fija.
- [x] **T5.3** — Aviso en el formulario de plantillas, `UpcomingBills` ("Próximos recibos") en Inicio, que se ve también en un mes sin movimientos, e interruptor en el perfil. `UserProfile.recurringReminderEmails` es obligatorio en el tipo del frontend, así que se añadió a los perfiles de prueba de 25 ficheros de test. 10 tests.
- [x] **T6.1** — `recurringReconciliationDismissals` en exportación e importación (clave opcional), con su propia fusión (`mergeDismissals`) que descarta plantillas y movimientos ajenos o desconocidos. La validación de resoluciones ahora exige un estado válido, para responder 400 en vez de un error de Postgres. `recurring_reminders_sent` no se exporta. 5 tests e2e.
- [x] **T6.2** — El borrado de cuenta arrastra las cuatro tablas afectadas. 1 test e2e.
- [x] **T6.3** — Cierre:
  - Backend: 303 unitarios en verde; e2e: 729 de 729 en 54 ficheros, en serie (`--no-file-parallelism`), frente a los 672 de partida. Un primer pase completo dio 37 fallos en suites ajenas (`goals-progress` y otra): mis tests nuevos de `data-import` dejaban plantillas al terminar y las suites siguientes no podían borrar `categories` (FK restrict), el mismo problema que la spec 047 ya resolvía en sus suites. Corregido limpiando las plantillas en el `afterAll` de `data-import`.
  - Frontend: `tsc -b` y oxlint limpios; 700 de 701 tests. Falla de forma intermitente `RegisterMovementPage` › "Cancelar edición", el mismo que ya anotaba la spec 047; se comprobó que la versión de `master` de ese fichero falla igual (3 de 4 ejecuciones).
  - Revisión visual con Chromium sin interfaz (Playwright), con un usuario de prueba en `economia_dev` que cubre todos los casos (recibo fijo con aviso, variable con historial, sugerencia, posible duplicado e importación con 2 conciliaciones automáticas): Recurrentes, Inicio, perfil y calendario, a 1280 px y a 375 px, sin scroll horizontal. Encontró que las tarjetas de conciliación apilaban cada dato en su línea (`.card` es flex en columna); corregido con la misma cabecera `.card-row` que las ocurrencias.
  - Spec contrastada historia por historia: todos los criterios de H1–H3 están cubiertos. Precisión sobre H1 criterio 5: las vencidas sin resolver de "Próximos recibos" se buscan en los últimos 90 días (plan §4).
  - **Desviación:** el README no se ha actualizado. Dejó de llevar el estado de las specs en la 010 (de la 011 a la 047 no aparece ninguna), y añadir solo la 049 quedaría incoherente.
  - Errores de tipos preexistentes, sin relación con esta spec: `tsc -p tsconfig.json` en `backend/` da 52 errores en `test/` por `supertest/types` (también en `master`); `tsconfig.build.json` (`src/`) compila limpio.
