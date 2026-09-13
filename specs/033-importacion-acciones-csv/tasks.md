# Tasks — Spec 033 (Importación de posiciones de acciones desde CSV)

**Fase:** 3 de 4

## Grupo 0 — Dependencia

- **T0.1** — Instalar `csv-parse` (backend). Comprobar `npm audit` (plan.md §2) antes de seguir; si aparece algo equivalente al problema de SheetJS en spec 003, parar y reconsiderar la librería antes de escribir código contra ella.

## Grupo 1 — Parseo (funciones puras)

- **T1.1** — Extraer `normalizeText` de `import/import.parsing.ts` a `common/normalize-text.util.ts` (plan.md §6); `import/import.parsing.ts` pasa a importarla en vez de tener su propia copia. Sin cambio de comportamiento — tests ya existentes de `import.parsing.spec.ts` deben seguir en verde tal cual.
- **T1.2** — `stock-import/stock-import.parsing.ts`: localización de las 3 secciones por título (plan.md §4), parseo de `Cantidad` vs. columnas de precio (plan.md §5, la regla asimétrica), fechas `dd/mm/aaaa` → ISO. Funciones puras, sin acceso a base de datos. Tests unitarios con CSVs sintéticos (nunca el fichero real de Diego, plan.md §13): las 3 secciones se localizan bien aunque cambie el nº de filas de cada una; fichero con una sección/columna requerida ausente → error claro; `Cantidad` con más de 3 dígitos (1420, 3490) se parsea distinto de un precio con el mismo nº de dígitos (plan.md §9, caso explícito); `Precio entrada` = `0,000` se parsea como `0`, no como error.
- **T1.3** — `stock-import.parsing.ts`: función de emparejamiento (plan.md §6) — nombre normalizado del CSV contra la lista de acciones ya existentes del usuario, devuelve `new`/`existing`/`ambiguous` por nombre distinto del fichero. Tests unitarios: 0/1/≥2 coincidencias: nombre con tilde/mayúsculas distintas que sí coincide tras normalizar.

## Grupo 2 — Backend (endpoints)

- **T2.1** — `StockImportService.preview()`: usa T1.2/T1.3, calcula `StockImportSummary` (plan.md §3) incluyendo la detección de duplicados por contenido (plan.md §7, contra la base y contra el propio fichero) sin escribir nada. `StockImportController` (`POST /stock-import/preview`, `AuthGuard`+`RequireActiveUserGuard`, `FileInterceptor('file')`, límite 10 MB, solo `.csv`). `StockImportModule` (plan.md §11), añadido a `app.module.ts`.
  Tests e2e: CSV sintético con acción nueva + acción ya existente + acción ambigua (dos coincidencias) → resumen correcto; sección/cabecera ausente → 400, nada escrito; 401 sin autenticar; 403 `PENDING_VERIFICATION`.
- **T2.2** — `StockImportService.confirm()`: repite T2.1 dentro de `db.transaction()`, inserta `stocks` nuevas (`custodyBank: '-'`), y compras/ventas/valoraciones no duplicadas (plan.md §8) — inserción directa con Drizzle, sin pasar por `StocksService`/`StockPurchasesService`/etc. (plan.md §8.3). `POST /stock-import/confirm` en el controller.
  Tests e2e: importa correctamente compras+ventas+valoraciones de un CSV sintético con las 3 secciones; una acción `ambiguous` no inserta nada de esa fila (el resto del fichero sí se importa); reimportar el mismo fichero dos veces seguidas → segunda vez 0 nuevos en todo; acción que solo aparece en "Posiciones cerradas" se crea sin valoración; fallo a mitad (p. ej. constraint) revierte todo, nada queda a medias; aislamiento — el emparejamiento y la escritura solo tocan acciones del usuario autenticado.

## Grupo 3 — Frontend

- **T3.1** — `frontend/src/api/stock-import.ts` (`previewStockImport`/`confirmStockImport`, plan.md §10).
- **T3.2** — `StockImportPage.tsx`, ruta `/patrimonio/acciones/importar`: selector de fichero `.csv`, "Validar" → tabla de resumen por acción (nueva/existente con banco custodia/ambigua, recuento de compras/ventas/valoraciones nuevas), "Confirmar importación" (mismo fichero ya seleccionado) → resultado final.
- **T3.3** — Botón "Importar desde CSV" en la cabecera de la sección "Acciones" de `WealthPage.tsx`, enlazando a `/patrimonio/acciones/importar`.
  Tests: `StockImportPage.test.tsx` — sin fichero no llama a la API; preview muestra los 3 estados de fila; confirmar reutiliza el mismo fichero; error de fichero inválido se muestra tal cual; `WealthPage.test.tsx` ampliado con el enlace nuevo.

## Grupo 4 — Tests y cierre

- **T4.1** — Repasar `spec.md` historia por historia (H1-H5) y confirmar que cada criterio de aceptación está cubierto por al menos un test automático — mismo checklist de cierre que specs anteriores (p. ej. spec 003 §"Checklist de cierre").
- **T4.2** — `npm run lint`, `npm run build`/`tsc -b` (recordar: `tsc -b`, no `tsc --noEmit`, en `frontend/` — errores se pierden en silencio con `--noEmit`) y `npm test` (backend y frontend) en verde. Revisión manual en el navegador con un CSV sintético (nunca el real de Diego): importar, comprobar que las acciones/compras/ventas/valoraciones aparecen bien en `WealthPage`/`StockDetailPage`, reimportar el mismo fichero y comprobar que no duplica nada.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden dentro de cada grupo. Al terminar una tarea, se marca y se hace commit; solo entonces se pasa a la siguiente. Si algo del plan no encaja al implementarlo, se para y se ajusta `plan.md` antes de seguir (no se parchea en silencio).

---

## Checklist de cierre — spec 033 (T4.1)

Repaso de `spec.md` historia por historia. `[x]` = cubierto por al menos un test automático.

### H1 — Subir el CSV y ver qué se va a importar antes de confirmar

- [x] Criterio 1 (vista previa por acción: nueva/existente/ambigua, compras/ventas/valoraciones nuevas vs. ya existentes): `test/stock-import.e2e-spec.ts` — "preview: nueva, ya existente y ambigua se calculan bien sin escribir nada"; `StockImportPage.test.tsx` — "muestra los 3 estados de fila".
- [x] Criterio 2 (nada se escribe hasta confirmar): mismo test e2e de preview, comprueba `db.select` vacío tras el preview.
- [x] Criterio 3 (estructura inesperada → error claro): `stock-import.parsing.spec.ts` — sección/columna ausente lanza `InvalidStockCsvError`; `test/stock-import.e2e-spec.ts` — "fichero sin la sección... → 400, nada escrito"; `StockImportPage.test.tsx` — "un fichero inválido (400) muestra el motivo del backend".

### H2 — Importar sin duplicar si se repite el CSV

- [x] Criterio 1 (coincidencia exacta por acción+fecha+cantidad+precio, no solo fecha): `test/stock-import.e2e-spec.ts` — "dos compras ya existentes con la misma fecha pero distinto precio o cantidad no se confunden con un duplicado" (añadido durante este cierre, T4.1 — hueco real encontrado: la única cobertura previa de deduplicación era el reimport íntegro, que no distinguía "mismo día" de "mismo día+cantidad+precio").
- [x] Criterio 2 (duplicados se omiten sin bloquear el resto): "confirm: importa compras, ventas y valoraciones; la fila ambigua no inserta nada" — el resto del fichero se importa igual.
- [x] Criterio 3 (reimportar el mismo fichero dos veces → 0 nuevos la segunda vez): "reimportar el mismo fichero dos veces seguidas no duplica nada".

### H3 — Emparejar cada acción del CSV con una posición ya existente

- [x] Criterio 1 (nombre normalizado, sin distinguir mayúsculas/tildes/espacios): `stock-import.parsing.spec.ts` — `matchStockNames`, casos "existing" y de normalización; e2e — Repsol emparejada reutilizando `custodyBank`.
- [x] Criterio 2 (≥2 coincidencias → ambigua, no se elige ninguna): `stock-import.parsing.spec.ts` — caso `ambiguous`; e2e — "Santander" con dos posiciones existentes no inserta nada.
- [x] Criterio 3 (sin coincidencia → nueva, `custodyBank: "-"`): `stock-import.parsing.spec.ts` — caso `new`; e2e — "BBVA"/"Repsol" nuevas con `custodyBank: '-'`.

### H4 — Traer también las posiciones ya cerradas

- [x] Criterio 1 (lote cerrado → compra + venta emparejadas): e2e — "Amadeus" (solo en cerradas) con 1 compra + 1 venta insertadas.
- [x] Criterio 2 (acción solo en cerradas se crea sin valoración): mismo test — 0 valoraciones para "Amadeus".

### H5 — Traer el precio actual de cada posición abierta

- [x] Criterio 1 (valoración con precio actual por posición abierta): e2e — "Repsol" recibe 1 valoración nueva desde "Resumen de posiciones".
- [x] Criterio 2 (misma fecha → no se duplica): e2e — "reimportar..." comprueba `valuations: { total: 1, toImport: 0, alreadyExisting: 1 }` en la segunda pasada.

### Aislamiento de datos (spec.md, constitution §2)

- [x] El emparejamiento y la escritura solo tocan acciones del usuario autenticado: `test/stock-import.e2e-spec.ts` — "el emparejamiento y la escritura solo tocan acciones del usuario autenticado (aislamiento)".
- [x] 401 sin autenticar / 403 `PENDING_VERIFICATION`: tests dedicados en el mismo fichero.
- [x] Todo o nada ante un fallo real de la base de datos: "un nombre de acción que excede el límite de columna hace fallar toda la transacción".

### Fuera de alcance (spec.md §4)

Cotización en vivo, conversión de divisa, dividendos, fusión difusa de nombres, otros formatos de CSV, edición de filas desde la propia pantalla: ninguno tiene código en esta spec — ausencia deliberada, nada que verificar (mismo criterio que el cierre de spec 003 con sus propios "fuera de alcance").

### Resultado del cierre

Todos los criterios de aceptación de H1-H5 quedan cubiertos por al menos un test automático. El repaso encontró un hueco real de cobertura (H2 criterio 1: la deduplicación exacta por cantidad/precio, no solo por fecha, no tenía un test que la distinguiera del caso "reimport íntegro") — corregido con un test e2e nuevo durante este mismo cierre, sin cambios de comportamiento (el código de `amountKey`/`dedupeAgainstExisting` ya era correcto).

### T4.2 — Verificación final

`npm run lint`/`build` en verde en ambos paquetes; backend 207 tests unitarios + 543 e2e en verde (`--no-file-parallelism`: en paralelo hay contención real de conexiones contra el Postgres local compartido de esta máquina, no relacionada con esta spec); frontend build (`tsc -b`) y 524/527 tests en verde (3 fallos pre-existentes y no relacionados, confirmados reproduciéndolos también en el árbol limpio sin este cambio — dos timing/fecha-dependientes en `SyncStatusPanel`/`RegisterMovementPage`, uno de agrupación semanal en `WealthPage` ligado a la fecha de hoy).

Verificación manual contra el servidor de desarrollo real (`backend-dev`/`frontend-dev`, base de datos `economia_dev`, usuario de prueba creado y eliminado al terminar): CSV sintético con Repsol/BBVA (abiertas) y Amadeus (solo cerrada) → `preview` no escribe nada, `confirm` inserta las 3 acciones con `custodyBank: '-'`, sus compras/venta y las 2 valoraciones; verificado en `psql` fila a fila (fechas, cantidades — `1420.00000000` correctamente distinto de un precio con el mismo nº de dígitos — y precios) y en la UI (`WealthPage` renderiza el Total, la composición y cada acción con el coste/valor correctos; el redondeo a 2 decimales de `pricePerShare`, `25,045` → `25.05`, se refleja fielmente en el total mostrado). Sin errores de consola relacionados con la importación.

Con esto, **spec 033 queda cerrada**.

## Grupo 5 — Revisión: selección de historiales a importar (H6)

- **T5.1** — `StockImportOptionsDto` (plan.md §15.1) + `assertAtLeastOneSelected` (§15.2). `StockImportController`/`Service` (`preview`/`confirm`) aceptan el DTO junto al fichero.
  Tests: unit del DTO/transform (ausente → `true`, `'false'` → `false`); e2e — 400 con las tres desmarcadas, sin tocar el fichero.
- **T5.2** — `computeSummary` aplica la selección (§15.3): no consulta el historial ya existente de un tipo desmarcado, `toImport: []` para ese tipo, `total` sigue siendo el real. No crear una acción nueva vacía si los 3 `toImport` quedan a 0 (§15.4).
  Tests e2e: desmarcar cada historial por separado dentro de un fichero con los 3 tipos → ese `toImport` a 0, `total` real, nada escrito de ese tipo en la base de datos; acción nueva que solo tendría filas de un historial desmarcado no se crea (`db.select().from(stocks)` no la encuentra); acción existente no se ve afectada por lo desmarcado (sigue estando, solo no recibe ese historial).
- **T5.3** — Frontend: 3 checkboxes (Compras/Ventas/Valoraciones, marcadas por defecto) en `StockImportPage.tsx`, antes de "Validar"; "Validar" deshabilitado con las tres desmarcadas; cambiar cualquiera descarta la vista previa/resultado actuales (mismo criterio que cambiar de fichero). `api/stock-import.ts` manda las 3 opciones en el mismo `FormData`.
  Tests: checkboxes marcados por defecto; desmarcar una y validar llama a la API con esa opción en `false`; las tres desmarcadas deshabilitan "Validar"; cambiar un checkbox tras una vista previa la descarta.
- **T5.4** — Cierre: repasar H6 criterio a criterio (checklist igual que T4.1), `npm run lint`/`build`/`test` en verde en ambos paquetes, verificación manual con un CSV sintético desmarcando cada historial por separado.
