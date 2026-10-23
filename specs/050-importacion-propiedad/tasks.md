# Tasks — Spec 050 (importación de copias: propiedad de las referencias y ventas de fondos)

**Fase:** 3 de 4 (aprobado)

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

*(se rellena al terminar cada tarea)*
