# Plan — Spec 049 (recibos recurrentes: avisos, importes variables y conciliación)

**Fase:** 2 de 4 (pendiente de aprobación)
**Parte de:** spec 049 aprobada. Construye sobre el modelo de la spec 047 (`backend/src/db/schema/recurring.schema.ts`, `backend/src/recurring-transactions/`) sin cambiar su comportamiento salvo donde la spec lo pide.

## 0. Ideas clave del diseño

- **Las ocurrencias siguen sin guardarse** (spec 047 plan §1): se calculan. Solo se guarda lo que las resuelve (`recurring_occurrence_resolutions`), que pasa a admitir un tercer estado, `RECONCILED`.
- **Conciliar = resolver una ocurrencia enlazándola a un movimiento que ya existe**, en vez de crear uno. Reutiliza la misma fila de resolución y la misma PK (`recurring_id`, `occurrence_date`) que da la idempotencia en spec 047.
- **La conciliación automática solo mira los movimientos que acaba de insertar la importación.** La importación de Google Sheets relee la hoja entera cada 4 horas, pero las filas que ya existían se saltan como duplicado (spec 012) y no se insertan otra vez. Al restringir a los recién insertados, un movimiento solo pasa una vez por la conciliación automática: deshacer una conciliación (H3 criterio 7) no provoca que la siguiente importación la vuelva a hacer.
- **Todo lo demás (sugerencias, posibles duplicados) se calcula al consultar**, con las mismas funciones puras que usa la importación. No hay una cola de sugerencias guardada; solo se guardan los descartes ("no es este movimiento").

## 1. Modelo de datos (Drizzle, nueva migración `0032_recurring_reminders_reconciliation`)

### `recurring_transactions` (columnas nuevas)

| Columna | Tipo | Notas |
|---|---|---|
| `variable_amount` | `boolean not null default false` | H2. Con `true`, `amount` pasa a ser el importe inicial (se usa mientras no haya ocurrencias resueltas). |
| `reminder_enabled` | `boolean not null default false` | H1 criterio 1. |
| `reminder_days_before` | `smallint not null default 2` | H1 criterio 1. `CHECK (reminder_days_before BETWEEN 0 AND 7)`. |

### `recurring_occurrence_resolutions` (cambios)

- Enum `recurring_resolution_status`: añadir `RECONCILED` (`ALTER TYPE ... ADD VALUE`, fuera de transacción en la migración, como exige Postgres).
- Columna nueva `reconciled_automatically boolean not null default false`: distingue la conciliación automática (H3 criterio 2) de la manual, para el listado "Conciliados recientemente" (H3 criterio 5).
- Índice único parcial `recurring_resolutions_transaction_uidx` sobre `transaction_id` `WHERE transaction_id IS NOT NULL`: un movimiento solo puede resolver una ocurrencia, venga de confirmar o de conciliar. Es la red de seguridad de la base de datos frente a carreras entre la importación automática y una conciliación manual simultánea.
- Sin cambios en `transaction_id` (`ON DELETE SET NULL`): si se borra el movimiento conciliado, la ocurrencia sigue resuelta, mismo criterio que una confirmada en spec 047.

### Tablas nuevas

**`recurring_reconciliation_dismissals`** — "este movimiento no corresponde a esta ocurrencia" (H3 criterios 3 y 8). Sin ella, una sugerencia descartada volvería a salir en cada consulta.

| Columna | Tipo |
|---|---|
| `recurring_id` | `uuid` FK → `recurring_transactions.id` `ON DELETE CASCADE` |
| `occurrence_date` | `date` |
| `transaction_id` | `uuid` FK → `transactions.id` `ON DELETE CASCADE` |
| `created_at` | `timestamptz` |

PK (`recurring_id`, `occurrence_date`, `transaction_id`).

**`recurring_reminders_sent`** — registro de avisos enviados, para avisar una sola vez por ocurrencia (H1 criterio 4).

| Columna | Tipo |
|---|---|
| `recurring_id` | `uuid` FK → `recurring_transactions.id` `ON DELETE CASCADE` |
| `occurrence_date` | `date` |
| `sent_at` | `timestamptz` |

PK (`recurring_id`, `occurrence_date`).

### `users` (columna nueva)

- `recurring_reminder_emails boolean not null default true` — interruptor global del perfil (H1 criterio 6). Con `false` no se envía ningún email de aviso, sin tocar la configuración de cada plantilla.

Las cuatro tablas afectadas cuelgan de `users` en cascada, así que el borrado de cuenta (spec 001 H8) no necesita cambios; se cubre con un test.

## 2. Funciones puras (`backend/src/recurring-transactions/`)

Todas con tests unitarios antes de usarse (constitution §2 y §4). Dinero con `decimal.js`, como el resto del backend.

### `recurring.estimate.ts` — H2

```ts
estimateAmount(initialAmount: string, resolvedAmounts: string[]): string
```

- `resolvedAmounts`: importes reales de las ocurrencias resueltas (`CONFIRMED` o `RECONCILED` con `transaction_id` no nulo), de más reciente a más antigua. Se toma el importe **actual** del movimiento enlazado, no el que tenía al resolver: si después se corrige (a mano o por la importación, spec 012 §4), la estimación lo recoge.
- Media de los 3 primeros; con menos de 3, de los que haya; con ninguno, `initialAmount`. Redondeo a 2 decimales, `ROUND_HALF_UP`.
- Tests: 0, 1, 2, 3 y más de 3 importes; redondeo de una media periódica (10 + 10 + 10,01); que solo cuenten los 3 más recientes.

### `recurring.reconciliation.ts` — H3

Constantes exportadas:

- `RECONCILIATION_WINDOW_DAYS = 5`: el movimiento puede caer hasta 5 días antes o después de la fecha prevista. Cubre el desfase habitual de un cargo domiciliado y queda muy por debajo de la separación entre dos ocurrencias mensuales (28 días o más), así que un cargo no puede encajar con dos meses distintos de la misma plantilla.
- `VARIABLE_AMOUNT_TOLERANCE = 0.4`: en plantillas variables, el importe real puede desviarse hasta un 40 % de la estimación. Una factura de luz puede duplicarse de un mes a otro; el margen es amplio a propósito porque la ventana de fechas y la categoría ya filtran mucho, y una conciliación automática dudosa se puede deshacer (H3 criterio 7).

```ts
isCandidate(occurrence: ExpectedOccurrence, movement: MovementLike): boolean
```

Mismo `type`, mismo `categoryId`, `|movement.date − occurrence.date| ≤ RECONCILIATION_WINDOW_DAYS` e importe: igual a `occurrence.expectedAmount` si la plantilla es fija, o dentro de ±`VARIABLE_AMOUNT_TOLERANCE` de él si es variable. La subcategoría, el concepto y el comercio **no** cuentan: son justo lo que difiere entre la plantilla y lo que trae la hoja (§0 de la spec).

```ts
matchOccurrences(occurrences: ExpectedOccurrence[], movements: MovementLike[], dismissed: Set<string>): {
  automatic: Array<{ occurrence: ExpectedOccurrence; movement: MovementLike }>;
  ambiguous: Array<{ occurrence: ExpectedOccurrence; candidates: MovementLike[] }>;
}
```

- Construye el grafo de candidatos ocurrencia ↔ movimiento con `isCandidate`, quitando los pares descartados.
- `automatic`: pares en los que la ocurrencia tiene **un solo** candidato y ese movimiento es candidato de **una sola** ocurrencia (H3 criterio 2).
- `ambiguous`: el resto de ocurrencias con al menos un candidato (H3 criterio 3), con candidatos ordenados por cercanía de importe y luego de fecha.
- Tests: emparejamiento único; dos movimientos para una ocurrencia; un movimiento para dos ocurrencias de plantillas distintas; bordes de la ventana (±5 incluido, ±6 fuera); bordes del margen variable; fija con un céntimo de diferencia (no casa); distinto tipo o categoría; par descartado.

### `recurring.reminders.ts` — H1

```ts
remindersDue(occurrences: PendingOccurrence[], today: string, alreadySent: Set<string>): PendingOccurrence[]
```

Devuelve las ocurrencias pendientes de plantillas con aviso activado tales que `occurrence.date − reminderDaysBefore ≤ today ≤ occurrence.date` y que no están en `alreadySent`. Una ocurrencia cuya fecha ya pasó no avisa: si el aviso no salió a tiempo (servidor parado, aviso activado tarde), lo cubre "Próximos recibos" en Inicio, no un email atrasado. Tests: los bordes del intervalo con `reminderDaysBefore` 0 y 7, ya enviada, fecha pasada.

## 3. Backend

### 3.1 `RecurringTransactionsService` (cambios)

- `create`/`update`: aceptan `variableAmount`, `reminderEnabled`, `reminderDaysBefore` (DTOs con `@IsBoolean`, `@IsInt @Min(0) @Max(7)`).
- `occurrences(userId, from, to)`: cada ocurrencia añade `estimated: boolean` (plantilla variable y aún no resuelta) y, en las previstas, `amount` pasa a ser la estimación (§2). Para calcularla se piden los importes de las 3 últimas resoluciones de cada plantilla variable en una sola consulta (`ROW_NUMBER() OVER (PARTITION BY recurring_id ORDER BY occurrence_date DESC)` con join a `transactions`), no una consulta por plantilla. `OccurrenceStatus` gana `'RECONCILED'`.
- `confirm`: en una plantilla variable, `amount` pasa a ser **obligatorio** (400 si falta). Es el "se pide revisarlo" de H2 criterio 4 aplicado también en la API, para que ningún cliente confirme por error una estimación sin mirarla. Las plantillas fijas siguen como en spec 047.

### 3.2 `RecurringReconciliationService` (nuevo, en el mismo módulo)

Separado de `RecurringTransactionsService` porque lo usa también `ImportModule` (§3.3) y así el import no depende del CRUD de plantillas.

- `reconcileImported(tx, userId, insertedMovements)`: se llama **dentro de la transacción** de `ImportService.importWorkbook`, tras los `INSERT`.
  1. Calcula las ocurrencias de las plantillas activas del usuario en `[min(fecha insertada) − 5, max(fecha insertada) + 5]` con `occurrencesBetween`, quita las ya resueltas y les añade su importe esperado (estimación si es variable).
  2. `matchOccurrences(ocurrencias, insertados, descartes)`.
  3. Por cada par `automatic`: `INSERT` en `recurring_occurrence_resolutions` (`status = 'RECONCILED'`, `transaction_id`, `reconciled_automatically = true`) con `ON CONFLICT DO NOTHING`. Si otra operación resolvió esa ocurrencia o ese movimiento en paralelo, la PK o el índice único lo evitan y simplemente no se concilia (la importación no falla por ello).
  4. Devuelve cuántas conciliaciones hizo.
  - El movimiento importado **no se modifica**: si su importe difiere de la previsión, "manda el real" (H3 criterio 4) sale solo, porque la ocurrencia enlaza al movimiento con su importe real.
- `reconciliationOverview(userId)`: lo que muestra la sección "Por conciliar" de Recurrentes.
  - `suggestions`: `matchOccurrences` sobre las ocurrencias pendientes o vencidas de los últimos 90 días hasta hoy + 5, contra los movimientos del usuario de ese rango que no resuelven ninguna ocurrencia. Aquí se devuelven **todos** los grupos con candidatos, incluidos los que serían `automatic`: si un movimiento encaja pero no llegó por una importación (p. ej. registrado a mano), se sugiere, nunca se concilia solo.
  - `possibleDuplicates` (H3 criterios 8 y 9): para cada ocurrencia `CONFIRMED` (todo el histórico, sin límite de fechas), los movimientos que no resuelven ninguna ocurrencia, no están descartados y cumplen `isCandidate` contra el importe real del movimiento creado al confirmar. **Esta misma lista es la "revisión única" del criterio 9**: la primera vez que Diego abra Recurrentes tras desplegar, aparecerán los duplicados que ya existan; al resolverlos o descartarlos, desaparecen.
  - `recentlyReconciled` (H3 criterio 5): resoluciones `RECONCILED` creadas en los últimos 30 días, con su movimiento.
- `candidatesFor(userId, recurringId, date)` (H3 criterio 6): movimientos del mismo tipo en ±15 días de la fecha prevista que no resuelven ninguna ocurrencia, ordenados con los que cumplen `isCandidate` primero. Ventana más amplia que la automática porque aquí elige Diego.
- `reconcile(userId, recurringId, date, transactionId)`: concilia a mano (`reconciled_automatically = false`). 404 si la plantilla o el movimiento no son del usuario; 400 si la fecha no es una ocurrencia de la plantilla (mismo `assertIsOccurrence` de spec 047); 409 si la ocurrencia ya está resuelta o el movimiento ya resuelve otra.
- `undoReconciliation(userId, recurringId, date)` (H3 criterio 7): borra la resolución solo si es `RECONCILED` (409 en otro caso). No toca el movimiento.
- `dismiss(userId, recurringId, date, transactionId)`: inserta en `recurring_reconciliation_dismissals`.
- `resolveDuplicate(userId, recurringId, date, keepTransactionId)` (H3 criterio 8): en una transacción de BD, comprueba que la ocurrencia está `CONFIRMED` y que `keepTransactionId` es del usuario y no resuelve otra ocurrencia; borra el movimiento creado al confirmar y pasa la resolución a `RECONCILED` (`reconciled_automatically = false`) enlazada al importado. Solo se ejecuta con una petición explícita desde la UI, con confirmación previa en pantalla.

### 3.3 Enganche con la importación (`backend/src/import/import.service.ts`)

- Los dos `INSERT` de `importWorkbook` pasan a `.returning({ id, type, date, categoryId, amount })` y, a continuación, dentro de la misma transacción, se llama a `reconcileImported`. Así una importación y sus conciliaciones se confirman o se deshacen juntas.
- `ImportConfirmResult` y `GoogleSheetsImportRunResult` (`import.schema.ts`) ganan `reconciledCount: number` a nivel raíz. En el tipo persistido es opcional (`reconciledCount?: number`), porque los `last_run_result` guardados antes de este cambio no lo tienen.
- `preview` no cambia: la vista previa no anticipa conciliaciones (fuera de alcance de la spec).
- `ImportModule` importa `RecurringTransactionsModule`, que exporta `RecurringReconciliationService`. No hay ciclo: `RecurringTransactionsModule` no depende de `ImportModule`.
- El resto de altas de movimientos (alta manual, confirmar, importación de datos de spec 032) **no** concilian solas; si encajan, aparecen como sugerencia (§3.2).

### 3.4 Endpoints (todos con `AuthGuard` + `RequireActiveUserGuard`, filtrados por `user_id`)

Nuevos, en `RecurringTransactionsController`. Las rutas fijas se declaran antes de `:id`, como ya hace `occurrences`.

| Método y ruta | Uso |
|---|---|
| `GET /recurring-transactions/reconciliation` | `{ suggestions, possibleDuplicates, recentlyReconciled }` (§3.2). |
| `GET /recurring-transactions/:id/occurrences/:date/candidates` | Buscador de "Vincular a un movimiento existente". |
| `POST /recurring-transactions/:id/occurrences/:date/reconcile` | Body `{ transactionId }`. |
| `DELETE /recurring-transactions/:id/occurrences/:date/reconciliation` | Deshacer conciliación. 204. |
| `POST /recurring-transactions/:id/occurrences/:date/dismiss` | Body `{ transactionId }`. 204. |
| `POST /recurring-transactions/:id/occurrences/:date/resolve-duplicate` | Body `{ keepTransactionId }`. |

Cambios en los existentes: `GET/POST/PATCH /recurring-transactions` incluyen los campos nuevos de la plantilla; `GET .../occurrences` añade `estimated` y el estado `RECONCILED`; `POST .../confirm` exige `amount` en variables. `PATCH /users/me` acepta `recurringReminderEmails` y `GET /users/me` lo devuelve.

### 3.5 Avisos por email (`RecurringRemindersScheduler`, nuevo)

- `@Cron('0 8 * * *', { timeZone: 'Europe/Madrid' })`: una vez al día a las 8:00 de Madrid. Es el horario de Diego; la app no guarda zona horaria por usuario y esta spec no la introduce. "Hoy" se calcula en esa misma zona, no en UTC como `todayIso()` de spec 047, para que un aviso de "vence hoy" no salga con la fecha del día anterior.
- Por cada usuario `ACTIVE` con `recurring_reminder_emails = true` y al menos una plantilla activa con `reminder_enabled`:
  1. Ocurrencias de hoy a hoy + 7 de esas plantillas, sin resolver, y `remindersDue` contra `recurring_reminders_sent`.
  2. Si hay alguna: `INSERT ... ON CONFLICT DO NOTHING RETURNING` en `recurring_reminders_sent` y se envía **un solo email** con las que se hayan insertado (H1 criterio 4). Si `MailService.send` falla, se borran esas filas para que el día siguiente se reintente, y se registra en el log. Un fallo de un usuario no interrumpe a los demás, mismo patrón que `GoogleSheetsImportScheduler`.
- Plantilla `recurringRemindersEmail` en `mail/templates.ts`: asunto "Próximos recibos", una línea por ocurrencia (fecha, concepto, importe con "≈" si es estimado, H2 criterio 3), enlace a `${FRONTEND_URL}/recurring` y, al pie, enlace a `${FRONTEND_URL}/profile` para desactivar los avisos.

### 3.6 Exportación e importación de datos (spec 032)

- Las columnas nuevas viajan solas en la exportación (se exportan filas completas).
- `recurringReconciliationDismissals` se añade a la exportación y a la importación de datos, con el mismo tratamiento que ya reciben las resoluciones en `data-import.service.ts` (validación propia, se conservan solo las filas cuya plantilla y movimiento existen en la cuenta de destino).
- `recurring_reminders_sent` **no** se exporta: es un registro de operación, no un dato económico del usuario. Tras importar datos en una cuenta nueva, como mucho se repetiría el aviso de alguna ocurrencia ya avisada.
- La importación de datos debe aceptar `RECONCILED` y `reconciled_automatically` en las resoluciones: hoy pasan por su propia validación (`isValidResolutionRow`), fuera de `TABLES`, y hay que ampliarla.

## 4. Frontend

- `api/recurring-transactions.ts`: tipos y llamadas nuevas (§3.4). Sin caché offline (spec 047, decisión que se mantiene).
- `RecurringPage`:
  - Formulario de plantilla: casilla "Importe variable" (con texto de ayuda: el importe indicado se usa hasta que haya recibos reales), casilla "Avisarme por email" y selector "días antes" (0 a 7) que solo aparece con la casilla marcada.
  - Sección nueva "Por conciliar", encima de "Pendientes de confirmar", visible solo si hay algo: sugerencias (elegir uno de los candidatos o "Ninguno de estos", que descarta todos los mostrados) y posibles duplicados (mostrando los dos movimientos lado a lado; "Quedarme con el importado" pide confirmación y avisa de que el otro se borra; "No es un duplicado" descarta).
  - Sección "Conciliados recientemente" (plegada por defecto), con "Deshacer" en cada una.
- `OccurrenceRow` (lo usan Recurrentes y el calendario):
  - Importes estimados con "≈" y estilo atenuado (H2 criterio 3).
  - Confirmar en una variable abre el campo de importe con la estimación rellena y el foco puesto en él; no se puede enviar sin pasar por ese paso.
  - Acción nueva "Vincular a un movimiento existente", que abre la lista de `candidates`.
- `CalendarPage`: sin cambios propios más allá de lo que hereda de `OccurrenceRow`.
- `HomePage`: sección "Próximos recibos" (H1 criterio 5), entre las tarjetas de resumen y "Últimos movimientos". Usa `listOccurrences(hoy − 90, hoy + 7)` filtrando `PENDING` y `OVERDUE`; vencidas primero y marcadas como tal; cada fila enlaza a `/recurring`. Si no hay ninguna, la sección no se muestra. Sin conexión, la sección no se muestra (mismo criterio que el calendario para las previstas en spec 047).
- `ProfilePage`: interruptor "Avisos de recibos por email" (H1 criterio 6).

## 5. Casos límite

| Caso | Comportamiento |
|---|---|
| Dos importaciones simultáneas (manual y automática) del mismo usuario | Cada `importWorkbook` va en su transacción; la PK y el índice único de resoluciones impiden conciliar dos veces la misma ocurrencia o el mismo movimiento. |
| Conciliación manual a la vez que la automática | La que llegue segunda choca con la PK o el índice único: la manual devuelve 409 y la automática se salta ese par. |
| Se deshace una conciliación automática y la hoja se vuelve a importar | El movimiento ya existe y se salta como duplicado (spec 012), así que no vuelve a pasar por `reconcileImported`. La ocurrencia queda pendiente y el par aparece como sugerencia hasta que Diego decida. |
| Se borra el movimiento de una ocurrencia conciliada | `transaction_id` pasa a `null` y la ocurrencia sigue resuelta, igual que una confirmada (spec 047). No cuenta para la estimación (§2). |
| La importación actualiza el importe de un movimiento conciliado (spec 012 §4) | Nada que hacer: la ocurrencia apunta al movimiento y la estimación usa su importe actual. |
| Se cambia una plantilla de fija a variable, o al revés | Afecta solo a ocurrencias sin resolver, igual que cualquier edición de plantilla en spec 047. |
| Plantilla pausada | Sus ocurrencias no se calculan: ni avisos, ni conciliación automática, ni sugerencias. Los posibles duplicados de ocurrencias ya confirmadas sí se siguen mostrando. |
| Aviso activado para una ocurrencia que vence hoy | Sale en la ejecución de las 8:00 si todavía no ha pasado; si ya pasó, al día siguiente la ocurrencia está vencida y no se avisa (§2): aparece en Inicio. |
| Plantillas de ingresos (nómina) | Se concilian y pueden avisar igual que los gastos; la spec habla de recibos, pero el modelo no distingue y no hay motivo para excluirlas. |
| Un usuario intenta conciliar con un movimiento de otro | 404, sin revelar si el movimiento existe (tests de autorización, H3 criterio 10). |

## 6. Tests

- Unitarios de las tres funciones puras (§2), escritos antes que el código que las usa.
- e2e de `RecurringReconciliationService` contra `economia_test`: conciliación al importar un `.xlsx` (caso único, caso ambiguo, sin candidatos); idempotencia con dos importaciones; deshacer y reimportar (no se reconcilia); `resolveDuplicate` borra el creado y enlaza el importado; aislamiento entre dos usuarios en cada endpoint nuevo.
- e2e del scheduler de avisos con un `MailService` falso: agrupación en un solo email, una sola vez por ocurrencia, interruptor global, reintento tras fallo de envío.
- Frontend (Vitest + Testing Library): `OccurrenceRow` con estimado y confirmación variable, secciones "Por conciliar" y "Conciliados recientemente", "Próximos recibos" en Inicio (con y sin datos, sin conexión), interruptor del perfil.
- Borrado de cuenta con datos en las tablas nuevas: no queda nada (spec 001 H8).

## 7. Orden de implementación propuesto (para `tasks.md`)

1. Migración y esquema.
2. Funciones puras con sus tests.
3. H2: importe variable (backend y frontend). Es la base de la estimación que usan H1 y H3.
4. H3: conciliación (servicio, enganche con la importación, endpoints, UI). Va antes que los avisos porque corrige los duplicados de §0 de la spec.
5. H1: avisos (scheduler, email, Inicio, perfil).
6. Exportación e importación de datos, y cierre de la spec.
