# Tasks — Spec 050 (importación de copias: propiedad de las referencias y ventas de fondos)

**Fase:** 4 de 4 (implementada)

Orden de plan.md §7. Cada tarea es como mucho un commit (constitution §4) y no se da por hecha si rompe un test existente.

## Grupo 1 — Ventas de fondos en la exportación

- **T1.1** — `FundSaleRow` y `fundSales` en `EconomicData`, en `ECONOMIC_DATA_TABLE_ORDER` (tras `fundPurchases`) y en `OPTIONAL_ECONOMIC_DATA_KEYS`; `UsersService.exportData` carga las ventas de los fondos del usuario. Mientras no exista T5.1, la importación de `fundSales` usa la regla genérica de hoy, para no dejar la rama a medias. Tests e2e: `fundSales` en `GET /users/me/export` y en el `datos.json` del `.zip`; aislamiento (no salen las ventas de otro usuario).

## Grupo 2 — Comprobación de referencias

- **T2.1** — `ImportContext`, `refs` en `TableEntry`, `ownedIds` y `mergeTable` ampliado (plan.md §2.1), con las referencias de la tabla de plan.md §1 declaradas en todas las tablas de `TABLES`. `omitted` en el resumen de las tablas con referencias. Tests e2e con dos usuarios: por cada familia (categorías, cuentas bancarias, acciones, fondos, cripto, vehículos, planes de pensiones y efectivo), una hija que apunta a un padre de otra cuenta o desconocido se omite y no aparece en la otra cuenta; subcategoría ajena → se importa sin subcategoría; categoría hija con padre ajeno → se omite junto con el movimiento que cuelga de ella; padre del fichero cuyo `id` ya es de otra cuenta → sus hijas se omiten; copia parcial con el padre ya en la cuenta → se importa; vista previa y confirmación dan el mismo resumen. Se adaptan los tests existentes que comparan resúmenes con `toEqual`.
- **T2.2** — Las fusiones propias de las specs 047, 048 y 049 (`mergeResolutions`, `mergeDismissals`, tickets, líneas, documentos y elementos de lista) pasan a usar el `ImportContext` en vez de "está en el fichero"; desaparece `usableIds`. Test e2e nuevo: un ticket cuyo comercio viene en el fichero pero con un `id` de otra cuenta se omite (ya pasaba), y un elemento de lista cuyo producto se omite se omite también. Los tests existentes de esas fusiones pasan sin tocar sus expectativas.

## Grupo 3 — Errores de datos

- **T3.1** — Red de seguridad en `confirm`: errores de Postgres de clase `22` o `23` → 400 "El fichero contiene datos que no se pueden importar." Tests e2e: un importe no numérico y un enumerado inexistente en filas nuevas → 400 y no se escribe nada (tampoco las filas válidas del mismo fichero).

## Grupo 4 — Ventas de fondos en la importación y el borrado

- **T4.1** — `fundSales` con `refs: fundId → funds (omit)`. Tests e2e: ida y vuelta de una cuenta con compras y ventas de fondos en otra cuenta vacía (sin omitidos, H1 criterio 6); copia antigua sin `fundSales`; venta de un fondo ajeno → omitida. El test de borrado de cuenta incluye ventas de fondos.

## Grupo 5 — Frontend y cierre

- **T5.1** — `fundSales: 'Ventas de fondos'` en `DATA_TABLE_LABELS` y el texto de omitidos de `BackupPage` (plan.md §3). Tests de componente actualizados.
- **T5.2** — Cierre: tests de backend (unitarios y e2e, en serie) y frontend, `tsc` y oxlint en verde; contrastar la spec historia por historia; rellenar el checklist.

---

## Checklist de cierre — spec 050

- [x] **T1.1** — `fundSales` en la exportación (JSON y `datos.json` del `.zip`), clave opcional tras `fundPurchases`. Tests e2e: solo las ventas propias, y la clave en `datos.json`.
- [x] **T2.1** — `ImportContext`, `refs` declaradas en todas las tablas de `TABLES` (plan.md §1) y `mergeTable` ampliado, con `omitted` en las tablas con referencias. Una referencia que no es un UUID se trata como desconocida (antes podía llegar a Postgres). 23 tests e2e nuevos; los 23 fallan con el código anterior. Se adaptaron 5 expectativas de tests existentes que comparaban resúmenes con `toEqual` (ahora traen `omitted: 0`).
- [x] **T2.2** — Resoluciones, descartes, tickets, líneas, documentos y elementos de lista usan `usableIds` sobre el `ImportContext`; desaparecen `fileIds` e `importableReceiptIds`. Los tests existentes de esas fusiones pasan sin tocar sus expectativas. Test nuevo: una plantilla y un movimiento omitidos por su categoría ajena, con una resolución, un descarte y un ticket que apuntan a ellos; con el código de T2.1 la importación fallaba entera, ahora se omiten o pierden el enlace.
- [x] **T3.1** — Errores de Postgres de clase `22` o `23` → 400 "El fichero contiene datos que no se pueden importar.". Una fecha de creación imposible (falla en Drizzle antes de llegar a Postgres) da el mismo 400. 4 tests e2e: en ninguno se escribe nada. **Desviación de lo que decía la spec (§0, punto 2):** hoy no salía un 500, sino un 400 con el mensaje en bruto de Postgres (nombres de tablas, restricciones y valores), para cualquier error, incluso uno de la base de datos que no fuera culpa del fichero. Ahora el mensaje es claro y un error que no es de datos vuelve a ser un 500.
- [x] **T4.1** — La importación de `fundSales` (con `fundId → funds`) ya entró en T2.1. Tests e2e: ida y vuelta completa de una cuenta con una fila de cada familia, categorías padre e hija, subcategoría, presupuesto, plantilla y compras y ventas de fondos, sin ningún omitido (H1 criterio 6); copia antigua sin `fundSales`; el borrado de cuenta se lleva las ventas de fondos.
- [x] **T5.1** — "Ventas de fondos" en el resumen y el texto de "Omitidos" ampliado. 1 test de componente.
- [x] **T5.2** — Cierre:
  - Backend: 343 unitarios y 815 e2e en 58 ficheros, en serie, todos en verde (782 antes de esta spec); `tsconfig.build.json` y oxlint limpios.
  - Frontend: 737 de 737, `tsc -b` limpio, oxlint sin avisos nuevos.
  - Spec contrastada: H1 criterios 1–6 y H2 criterios 1–3 cubiertos. Sin revisión visual en navegador: el único cambio de interfaz es una etiqueta y un texto en una tabla que ya se revisó en la spec 048.
  - Pendiente: fusionar antes la spec 048 (#93), de la que parte esta rama.
