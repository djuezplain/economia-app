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
