# Plan — Spec 047

**Fase:** 2 de 4 (pendiente de aprobación de la spec)

## 1. Modelo de datos (Drizzle, nueva migración `0031`)
- `recurring_transactions`: `id`, `user_id` (FK cascade), `type`, `category_id`/`subcategory_id` (FK restrict, igual que `transactions`), `concept`, `merchant`, `amount` (misma precisión), `payment_method`, `frequency` (`MONTHLY|YEARLY`), `start_date` (date), `end_date` (date, null), `active` (bool), `created_at`, `updated_at`. El día de repetición sale de `start_date`.
- `recurring_occurrence_resolutions`: `recurring_id` (FK cascade), `occurrence_date`, `status` (`CONFIRMED|SKIPPED`), `transaction_id` (FK set null), `created_at`; PK (`recurring_id`, `occurrence_date`) → garantiza idempotencia.
- Las ocurrencias **no se almacenan**: se calculan.

## 2. Backend (`backend/src/recurring-transactions/`)
- `recurring.calculations.ts` — función pura `occurrencesBetween(template, from, to)` con `Date.UTC` (sin zona horaria), fin de mes y 29-feb. Tests unitarios (mes de 30/28/29 días, año bisiesto, `end_date`, `start_date` posterior al rango).
- Endpoints (`AuthGuard` + `RequireActiveUserGuard`, todo filtrado por `user_id`):
  - `GET/POST /recurring-transactions`, `PATCH/DELETE /recurring-transactions/:id`.
  - `GET /recurring-transactions/occurrences?from&to` → ocurrencias calculadas con su estado (`PENDING|OVERDUE|CONFIRMED|SKIPPED`), rango máx. 366 días, solo plantillas activas.
  - `POST /recurring-transactions/:id/occurrences/:date/confirm` (body opcional `{ amount }`) y `.../skip`. Confirmar inserta el movimiento y la resolución en **una transacción de BD**, reutilizando validación de categorías de `TransactionsService`; la PK evita duplicados y el 2º intento devuelve el mismo movimiento. Una fecha que no sea ocurrencia de la plantilla → 400.
- Tests e2e de aislamiento (usuario B → 404) y de idempotencia.
- Exportación/borrado RGPD: incluir las dos tablas en `account-export` y confirmar que cascade borra todo.

## 3. Frontend
- `api/recurring-transactions.ts` (sin caché offline).
- `pages/RecurringPage.tsx` en `/recurring` + entrada en el menú: listado, formulario, pausar/borrar.
- `CalendarPage`: pide `occurrences` del mes (solo online; si falla, el calendario sigue con los reales y un aviso), chips discontinuos, Confirmar/Omitir en el detalle del día, y recarga de ambos tras confirmar.
- Estilos `.cal-chip-planned` con los tokens existentes.
