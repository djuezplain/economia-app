# Plan — Spec 050 (importación de copias: propiedad de las referencias y ventas de fondos)

**Fase:** 2 de 4 (aprobado)
**Parte de:** spec 050 aprobada. Construye sobre `backend/src/data-import/data-import.service.ts` tal como queda tras la spec 048 (`usableIds`, fusiones propias de tickets y listas) y sobre la exportación de la spec 032 (`UsersService.exportData`, `account-export.types.ts`).

## 0. Decisiones de diseño

1. **Sin migración.** Todo se resuelve en la importación; el modelo no cambia.
2. **Referencias declaradas por tabla, no una fusión a mano por tabla.** Cada tabla de `TABLES` declara a qué apunta (`refs`) y qué hacer si la referencia no es utilizable: `omit` (la fila se omite) o `nullify` (la fila se importa con esa columna a `null`). La regla genérica `mergeTable` aplica las comprobaciones. Así no se escriben 20 fusiones casi iguales, y una tabla nueva solo tiene que declarar sus referencias.
3. **"Utilizable" = de este usuario o importado en esta misma operación.** Un `id` es utilizable si ya existe en la base de datos y es del usuario (directamente, o a través de su padre en las tablas hijas sin `userId`), o si su fila viene en el fichero **y se va a importar de verdad** en esta misma operación. Esto último corrige una debilidad de `usableIds` (spec 048): ahora da por buena cualquier fila del fichero, aunque esa fila se acabe omitiendo. Una categoría hija omitida por tener un padre ajeno no debe servir de categoría a un movimiento.
4. **Vista previa y confirmación dan lo mismo.** El conjunto de `id` que se van a importar se va construyendo en memoria mientras se recorren las tablas en orden de dependencias. No depende de haber escrito nada, así que la vista previa cuenta exactamente lo que hará la confirmación.
5. **Red de seguridad contra los 500 (H1 criterio 5).** Si aun así un `INSERT` falla con un error de datos de Postgres (clase `22`, dato no válido, o `23`, restricción), la confirmación responde 400 con "El fichero contiene datos que no se pueden importar." y la transacción se deshace entera. No sustituye a las comprobaciones de arriba: cubre valores manipulados que no son referencias (un importe con letras, un tipo que no existe).
6. **Ventas de fondos** como clave opcional `fundSales` de `EconomicData`, justo después de `fundPurchases`, con `refs: fundId → funds (omit)`. Mismo patrón que las claves opcionales de las specs 047 y 048: una copia antigua sin la clave es válida.

## 1. Referencias por tabla

| Tabla | Referencia | Si no es utilizable |
|---|---|---|
| `categories` | `parentId` → `categories` | omit |
| `transactions` | `categoryId` → `categories` | omit |
| | `subcategoryId` → `categories` | nullify |
| `expenseBudgets` | `categoryId` → `categories` (puede ser `null`: presupuesto global) | omit |
| `recurringTransactions` | `categoryId` → `categories` | omit |
| | `subcategoryId` → `categories` | nullify |
| `bankAccountBalances` | `bankAccountId` → `bankAccounts` | omit |
| `stockPurchases`, `stockSales`, `stockValuations`, `stockDividends` | `stockId` → `stocks` | omit |
| `fundPurchases`, `fundSales` (nueva), `fundValuations`, `fundDividends` | `fundId` → `funds` | omit |
| `cryptoPurchases`, `cryptoValuations` | `cryptoId` → `cryptos` | omit |
| `vehicleValuations` | `vehicleId` → `vehicles` | omit |
| `pensionPlanContributions`, `pensionPlanValuations` | `pensionPlanId` → `pensionPlans` | omit |
| `cashBalances` | `cashHoldingId` → `cashHoldings` | omit |

Una referencia `null` en una columna que admite `null` siempre es válida (no se comprueba). Los nombres exactos de las columnas se confirman contra el esquema al implementar.

Las tablas de las specs 047, 048 y 049, que ya tienen fusión propia (resoluciones, descartes, tickets, líneas, documentos y elementos de lista), pasan a usar el mismo conjunto de `id` importados (decisión 3), sin cambiar sus reglas.

## 2. Backend

### 2.1 `DataImportService`

- **`ImportContext`** (nuevo, interno): `Map<clave de tabla, Set<id>>` con los `id` que se van a importar en esta operación. `mergeTable` añade los suyos al terminar cada tabla.
- **`TableEntry`** gana `refs?: { column: string; target: clave de tabla; onInvalid: 'omit' | 'nullify' }[]`.
- **`ownedIds(executor, target, ids, userId)`**: qué `id` de la lista ya existen y son del usuario. En las tablas raíz, con `userId` directamente; en `categories` igual. Las tablas hijas no son nunca destino de una referencia, así que no hace falta resolver propiedad a través del padre.
- **`mergeTable`** (ampliado):
  1. Separa las filas cuyo `id` ya existe (en cualquier cuenta): siguen contando como ya existentes y no se tocan (H1 criterio 4, igual que hoy).
  2. Para el resto, comprueba cada referencia declarada con `ownedIds` y el `ImportContext`: si es `omit` y no vale, la fila se omite; si es `nullify` y no vale, la columna se pone a `null`.
  3. Inserta las que quedan y las añade al `ImportContext`.
  4. Devuelve `omitted` en el resumen de toda tabla con `refs` (0 si no se omite nada). Las tablas sin referencias no cambian de forma.
- **`mergeCategories`**: las raíz primero y después las hijas, como hoy. Las hijas ven a las raíz en el `ImportContext`.
- **`usableIds`** (spec 048) se sustituye por la comprobación común: `ownedIds` más el `ImportContext` en vez de "está en el fichero".
- **Red de seguridad:** en `confirm`, un `try/catch` alrededor de la transacción traduce los errores de Postgres con `code` de clase `22` o `23` a `BadRequestException` (decisión 5). Cualquier otro error sigue siendo un 500.

### 2.2 Exportación

- `account-export.types.ts`: `FundSaleRow`, `fundSales` en `EconomicData`, en `ECONOMIC_DATA_TABLE_ORDER` (tras `fundPurchases`) y en `OPTIONAL_ECONOMIC_DATA_KEYS`.
- `UsersService.exportData`: carga las ventas de los fondos del usuario (`inArray(fundSales.fundId, fundIds)`, como las compras). Entra solo en la exportación `.zip` (va dentro de `datos.json`).
- Borrado de cuenta: `fund_sales` ya cuelga de `funds` en cascada. Se añade al test de borrado.

## 3. Frontend

- `DATA_TABLE_LABELS`: `fundSales: 'Ventas de fondos'`.
- `BackupPage`: la columna "Omitidos" ya existe (spec 048). El texto explicativo deja de hablar solo de documentos: "Se omiten las filas que no vienen completas en el fichero o que apuntan a datos que no son de tu cuenta (por ejemplo, una compra de un fondo que no existe); los documentos omitidos no vienen en el fichero o su contenido no coincide con el exportado."

## 4. Casos límite

- **Padre en el fichero pero con un `id` que ya existe en otra cuenta:** no se importa (cuenta como ya existente) y tampoco entra en el `ImportContext`, así que sus hijas se omiten.
- **Padre ya existente en la propia cuenta y no en el fichero** (importar una copia parcial): la hija se importa.
- **Categoría hija cuyo padre se omite:** se omite también, y con ella lo que dependa (movimientos, presupuestos, plantillas).
- **Subcategoría utilizable de otra categoría**: no se comprueba que la subcategoría sea hija de la categoría del movimiento. Hoy tampoco se comprueba al importar y no afecta a la propiedad. Queda anotado como fuera de alcance.
- **Copia antigua sin `fundSales`:** válida, 0 ventas.
- **Muchas filas:** cada comprobación es una sola consulta `inArray` por tabla y columna (como `usableIds`), no una por fila.

## 5. Tests

- **e2e de `data-import`** (con dos usuarios, Ana y Bea):
  - por cada familia (categorías, cuentas bancarias, acciones, fondos, cripto, vehículos, planes de pensiones y efectivo), una hija que apunta al padre de Bea se omite y **no aparece en la cuenta de Bea**; también una hija que apunta a un padre desconocido;
  - subcategoría ajena → se importa sin subcategoría;
  - categoría hija con padre ajeno → se omite, y el movimiento que cuelga de ella también;
  - padre del fichero cuyo `id` ya es de otra cuenta → las hijas se omiten;
  - copia parcial con el padre ya en la cuenta → se importa;
  - vista previa y confirmación dan el mismo resumen;
  - un importe no numérico, en un fichero que pasa la validación de forma → 400 sin escribir nada;
  - una copia completa exportada por la app se restaura entera en una cuenta vacía, sin ningún omitido (regresión de H1 criterio 6), incluidas las ventas de fondos.
- **e2e de exportación:** `fundSales` en el `.json` y en el `.zip`.
- **e2e de borrado de cuenta:** sin ventas de fondos al terminar.
- Se revisan los tests existentes que comparan el resumen de tablas con referencias con `toEqual`: ahora traen `omitted`.
- **Frontend:** etiqueta "Ventas de fondos" y el texto de omitidos.

## 6. Fuera de este plan (anotado, no se toca)

- Comprobar que la subcategoría de un movimiento o plantilla es hija de su categoría (§4).
- Validar el formato de cada columna antes de insertar (importes, enumerados): la red de seguridad de la decisión 5 lo convierte en un 400, pero el mensaje es genérico.

## 7. Orden de implementación propuesto (para `tasks.md`)

1. Ventas de fondos en la exportación (tipos, `exportData`, tests).
2. `ImportContext`, `refs` y `mergeTable` ampliado, con tests e2e de cada familia.
3. Las fusiones de las specs 047, 048 y 049 pasan a usar el `ImportContext`.
4. Red de seguridad de errores de Postgres → 400.
5. Ventas de fondos en la importación y en el borrado de cuenta.
6. Frontend (etiqueta y texto).
7. Cierre: tests completos, contrastar la spec y checklist.
