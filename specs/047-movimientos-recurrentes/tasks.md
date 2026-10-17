# Tasks — Spec 047

**Fase:** 3 de 4 (pendiente de aprobación)

## Grupo 1 — Backend
- **T1.1** — Esquema + migración `0031` (dos tablas).
- **T1.2** — `occurrencesBetween` + tests unitarios (bordes de plan.md §2).
- **T1.3** — CRUD de plantillas con validaciones y aislamiento por usuario + tests.
- **T1.4** — `GET occurrences` con estados + tests.
- **T1.5** — Confirmar/omitir idempotentes en transacción de BD + tests (doble confirmación, fecha inválida, otro usuario).
- **T1.6** — Incluir en exportación de cuenta y verificar borrado en cascada.

## Grupo 2 — Frontend
- **T2.1** — `api/recurring-transactions.ts` + `RecurringPage` + ruta y menú + tests.
- **T2.2** — Integración en `CalendarPage` (previstos, Confirmar/Omitir, fallo parcial) + tests.

## Grupo 3 — Cierre
- **T3.1** — `npm test` y typecheck (`tsc -b` en frontend) en verde; revisión visual a escritorio y 375px.

---

## Checklist de cierre — spec 047

- [x] **T1.1** — Migración `0031` (`recurring_transactions`, `recurring_occurrence_resolutions`).
- [x] **T1.2** — `occurrencesBetween` con 9 tests unitarios (fin de mes, 29-feb, `startDate`/`endDate`, cambio de año).
- [x] **T1.3–T1.5** — CRUD, `GET occurrences`, confirmar/omitir. 14 tests e2e (aislamiento por usuario, idempotencia también en paralelo, 409 al contradecir una resolución, la plantilla no toca lo ya confirmado, borrar el movimiento confirmado no reabre la ocurrencia).
- [x] **T1.6** — Exportación de cuenta con las dos tablas nuevas (26 en total). **Desviación del plan:** el import exigía las claves exactas, así que se tolera su ausencia (copias anteriores, `OPTIONAL_ECONOMIC_DATA_KEYS`) y las resoluciones — sin `id` propio — tienen su propia fusión (`mergeResolutions`), que ignora las que cuelgan de una plantilla de otra cuenta. 3 tests e2e nuevos en `data-import`. El borrado de cuenta ya cubría las tablas por `ON DELETE CASCADE`.
- [x] **T2.1** — `api/recurring-transactions.ts`, `RecurringPage` (`/recurring`, menú "Recurrentes"), `OccurrenceRow`.
- [x] **T2.2** — `CalendarPage`: previstos con borde discontinuo, Confirmar/Omitir con importe ajustable, aviso si falla la carga de previstos; sin conexión no se piden.
- [x] **T3.1** — Backend: 268 unitarios + e2e en verde (secuencial). Frontend: `tsc -b` limpio, 660 de 661 tests (falla el intermitente de `RegisterMovementPage` ya anotado en la spec 045). Revisión visual en navegador con un usuario de prueba local: calendario y Recurrentes en escritorio, calendario a 375px (sin scroll horizontal).
