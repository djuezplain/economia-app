# Spec 050 — Importación de copias: propiedad de las referencias y ventas de fondos

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** hueco encontrado al implementar la spec 048 (T6.1), anterior a ella y a la 047. Diego pidió tratarlo aparte. Depende de la spec 048 (PR #93), que reescribió buena parte de `DataImportService`.

## 0. Qué falla hoy

La importación de una copia (spec 032 H2) fusiona casi todas las tablas con una regla genérica (`mergeTable`): inserta las filas cuyo `id` no existe y pone `userId` del usuario que importa en las tablas que lo tienen. **No mira a qué apuntan las referencias de cada fila.** Las tablas de las specs 047, 048 y 049 ya tienen su propia comprobación; las anteriores no:

| Tabla importada | Referencia sin comprobar |
|---|---|
| `categories` | `parentId` → categoría |
| `transactions`, `recurringTransactions` | `categoryId`, `subcategoryId` → categoría |
| `expenseBudgets` | `categoryId` → categoría |
| `bankAccountBalances` | → cuenta bancaria |
| `stockPurchases`, `stockSales`, `stockValuations`, `stockDividends` | → acción |
| `fundPurchases`, `fundValuations`, `fundDividends` | → fondo |
| `cryptoPurchases`, `cryptoValuations` | → cripto |
| `vehicleValuations` | → vehículo |
| `pensionPlanContributions`, `pensionPlanValuations` | → plan de pensiones |
| `cashBalances` | → efectivo |

Consecuencias:

1. **Escritura en datos de otro usuario.** Un fichero manipulado con el `id` de una acción (o fondo, cuenta, vehículo…) de otra cuenta añade compras, valoraciones o saldos **a la cuenta ajena**, porque esas tablas hijas no tienen `userId` propio. Con una categoría ajena, el movimiento importado queda colgando de ella. Hace falta conocer el `id` (un UUID aleatorio, que nunca se muestra a otros usuarios), así que el riesgo real es bajo, pero incumple la constitución §2: "un usuario nunca puede leer/escribir datos de otro".
2. **Errores 500.** Una referencia a algo que no existe en ningún sitio hace fallar la importación entera con un error de Postgres (clave ajena), en vez de un mensaje claro.
3. **Ventas de fondos sin exportar.** `fund_sales` no está en la exportación (spec 032 H1): una copia restaurada pierde las ventas de fondos, y el valor y la rentabilidad de esos fondos salen mal. También es un hueco del RGPD (constitución §2: la exportación debe incluir todos los datos del usuario).

## 1. Historias de usuario

**H1 — La importación solo enlaza con datos propios**

Como usuario quiero que importar una copia nunca toque datos de otra cuenta, aunque el fichero esté manipulado.

- Criterio 1: una fila hija (compra, valoración, saldo, aportación…) solo se importa si su padre es del usuario: ya existe en su cuenta o viene en el mismo fichero y se importa. Si no, se omite y se cuenta como omitida en el resumen (como los documentos de la spec 048).
- Criterio 2: un movimiento, una plantilla recurrente o un presupuesto con una categoría ajena o desconocida se omite y se cuenta. Si solo la subcategoría es ajena o desconocida, se importa sin subcategoría.
- Criterio 3: una categoría cuyo padre es ajeno o desconocido se omite y se cuenta (y con ella, por el criterio 2, lo que cuelgue de ella).
- Criterio 4: una fila cuyo `id` ya existe en otra cuenta no se importa ni modifica nada (ya es así hoy); se sigue contando como ya existente, sin revelar de quién es.
- Criterio 5: con un fichero manipulado nunca hay un 500: o se omite lo que no cuadra, o se responde 400 con un mensaje claro si el fichero en conjunto no es válido.
- Criterio 6: una copia exportada por la propia app y restaurada en la misma cuenta, o en otra cuenta vacía, se importa entera como hoy: nada legítimo se omite.

**H2 — Las ventas de fondos viajan en la copia**

- Criterio 1: la exportación (JSON y `.zip`) incluye las ventas de fondos, como clave opcional (las copias antiguas sin ella siguen siendo válidas).
- Criterio 2: la importación las restaura con la misma comprobación de propiedad que el resto de hijas de un fondo (H1 criterio 1).
- Criterio 3: la pantalla Copia de seguridad muestra "Ventas de fondos" en el resumen.

## 2. Fuera de alcance

- **Revisar el resto de endpoints de la app.** Esta spec cubre solo la importación de copias; el resto ya tiene tests de autorización por spec.
- **Cambiar la regla de "ya existente"** (fusión por `id`, sin sobrescribir): se mantiene tal cual (spec 032 H2).

## 3. Decisiones tomadas con Diego

1. **Se trata aparte de la spec 048**, en esta spec (respuesta "sí" al cierre de la 048).

---
**Siguiente paso:** `plan.md`.
