# Tasks — Spec 049 (recibos recurrentes: avisos, importes variables y conciliación)

**Fase:** 3 de 4 (pendiente de aprobación)

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

*(se rellena al terminar cada tarea)*
