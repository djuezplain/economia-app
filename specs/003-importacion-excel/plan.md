# Plan 003 — Importación del histórico desde el Excel "2026"

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec ✅ → Plan → Tasks → Implementación)
**Implementa:** `spec.md` (H1, H2)
**Stack de referencia:** `specs/constitution.md` §3

## 1. Modelo de datos

**No se añade ninguna tabla nueva.** La importación solo crea filas en `categories` y `transactions`, las mismas tablas de spec 002, con el mismo `userId` del usuario autenticado. No hay una tabla de "historial de importaciones" ni de "importación en curso" (ver decisión 3, sección 6): el flujo es sin estado en el servidor entre la vista previa y la confirmación.

## 2. Librerías nuevas

- **`exceljs`** para leer el fichero `.xlsx` en el backend.
- **`@types/multer`** (devDependency) para tipar `Express.Multer.File` en el controlador — `multer` en sí ya está disponible de forma transitiva vía `@nestjs/platform-express` (ya en `package.json`), pero sin tipos propios instalados todavía.

> **Desviación de este mismo plan, encontrada al instalar la dependencia (T1.1), antes de escribir ningún código:** `docs/requisitos_app_economia.md` §8.2 y la primera versión de este plan proponían `xlsx` (SheetJS). Al instalarlo, `npm audit` marca la versión publicada en el registro de npm con **2 vulnerabilidades HIGH** (`Prototype Pollution in sheetJS` y un ReDoS) sin ninguna versión corregida disponible ahí — SheetJS dejó de publicar sus builds parcheadas en npm y solo las distribuye desde su propio CDN. Como este endpoint parsea ficheros subidos directamente por el usuario (superficie de ataque real: un `.xlsx` es, en el fondo, un zip con XML), instalar una librería de parseo con un *prototype pollution* conocido y sin parche en npm no es aceptable aquí. Se sustituye por `exceljs`, que en la misma comprobación solo añade una vulnerabilidad *moderate* (no explotable del mismo modo vía contenido de celda) y está activamente mantenida. Cambia la librería, no el diseño de los endpoints ni el mapeo de columnas de este plan.

## 3. Endpoints (NestJS, mismo guard que categorías/movimientos)

| Método y ruta | Guard | Descripción |
|---|---|---|
| `POST /import/excel/preview` | `AuthGuard`, `RequireActiveUserGuard` | H1 criterio 1. `multipart/form-data`, campo `file` (`.xlsx`, máx. 10 MB). Parsea y valida sin escribir nada en la base de datos. Devuelve las filas válidas ya mapeadas, las inválidas con su motivo, y qué categorías nuevas haría falta crear. |
| `POST /import/excel/confirm` | ídem | H1 criterios 2-4. Mismo campo `file` — se vuelve a subir (ver decisión 3). Repite el mismo parseo y validación que `preview` (reutilizando exactamente las mismas funciones, no una copia) dentro de una `db.transaction()`: crea primero las categorías que falten y después inserta los movimientos válidos. Devuelve el resumen: cuántos se importaron y cuántos se descartaron, con el motivo de cada fila descartada. |

## 4. Estructura exacta del Excel (verificada contra el fichero real de Diego, no supuesta)

### Hoja "Ingresos"

Cabecera en la fila 1, datos desde la fila 2. Columnas usadas (el resto de columnas de la hoja se ignoran, incluidas `Total`/`Media por mes`, que son fórmulas del propio Excel):

| Columna | Nombre en el Excel | Campo del movimiento |
|---|---|---|
| G | Fecha | `date` |
| H | Tipo | `categoryId` (tras mapear, ver §5) |
| I | Concepto | `concept` |
| J | Valor | `amount` |
| K | Mes | *(no se usa — ver spec.md §4)* |

Una fila se considera "de datos" si la columna G (Fecha) no está vacía; una fila totalmente vacía (todas las columnas usadas vacías) se salta en silencio sin contar como inválida (es solo espacio en blanco del Excel, no un dato incompleto).

### Hoja "Gastos"

Cabecera en la fila 1, datos desde la fila 2. Columnas usadas:

| Columna | Nombre en el Excel | Campo del movimiento |
|---|---|---|
| H | Fecha | `date` |
| I | Tipo | `paymentMethod` (tras mapear, ver §5 — **ojo:** en esta hoja "Tipo" es el medio de pago, no la categoría, a diferencia de la hoja "Ingresos") |
| J | Subtipo | `categoryId` (tras mapear) |
| K | Concepto | `concept` |
| L | Tienda/Empresa | `merchant` (opcional — puede ir vacío) |
| M | Valor | `amount` |
| N | Mes | *(no se usa)* |

Igual que en "Ingresos": una fila "de datos" es la que tiene la columna H (Fecha) no vacía; una fila totalmente vacía se ignora sin contar como inválida. Ninguna fila importada de "Gastos" lleva `subcategoryId` (spec.md §4 — el Excel no distingue ese nivel).

## 5. Mapeo de categorías y tipo de pago (verificado valor a valor contra el fichero real)

### Categorías de ingreso (columna "Tipo" de la hoja "Ingresos")

Los 10 valores distintos que aparecen en el fichero real coinciden, uno a uno, con las 10 categorías semilla de ingreso de spec 002 tras normalizar (recortar espacios, pasar a minúsculas, quitar tildes) — **salvo uno**, que necesita un alias explícito porque la normalización por sí sola no lo resuelve:

| Valor en el Excel | Categoría de la aplicación | Necesita alias |
|---|---|---|
| Acciones | Acciones (venta) | **sí** — `ALIAS_MAP` |
| Cashback | Cashback | no |
| Descuentos | Descuentos | no |
| Dietas | Dietas | no |
| Dividendo | Dividendo | no |
| Intereses | Intereses | no |
| Loteria | Lotería | no (solo tilde) |
| Nomina | Nómina | no (solo tilde) |
| Otros | Otros | no |
| Regalo | Regalo | no |

Con esto, **ninguna fila de "Ingresos" del fichero real crea una categoría nueva** — las 10 ya existen desde el registro (semillas de spec 002, H3 criterio 1).

### Categorías de gasto (columna "Subtipo" de la hoja "Gastos")

De los 18 valores distintos que aparecen en el fichero real (contando `"Comida"` y `"Comida "` como el mismo tras recortar espacios), 12 coinciden con las categorías semilla de gasto y 6 no tienen ninguna coincidencia:

| Valor en el Excel | Categoría de la aplicación |
|---|---|
| Alquiler | Vivienda/Alquiler |
| Apuestas | Apuestas |
| Asociaciones | Asociaciones |
| Caprichos | Ocio/Caprichos |
| Coche | Coche |
| Comida | Comida |
| Ropa | Ropa |
| Salud | Salud |
| Suscripciones | Suscripciones |
| Transporte | Transporte |
| Utilities | Utilities |
| Varios | Varios |

Sin coincidencia (se crean automáticamente como categorías nuevas del usuario, `isDefault: false`, con el nombre **tal cual aparece en el Excel, solo recortado de espacios** — no se corrige ortografía ni tildes, para no inventar un nombre distinto al que Diego ya reconoce):

`Bancos`, `Emma`, `Impuestos`, `Peluqueria`, `Regalos`, `Viajes`.

### Tipo de pago (columna "Tipo" de la hoja "Gastos")

Catálogo cerrado (spec.md §6, decisión 2) — tabla fija, comparación normalizada igual que las categorías:

| Valor en el Excel | `paymentMethod` |
|---|---|
| Tarjeta | `CARD` |
| Recibo / Recibos | `DIRECT_DEBIT` |
| Efectivo | `CASH` |
| Transferencia | `TRANSFER` |

En el fichero real solo aparecen `Tarjeta` y `Recibos`; `Efectivo`/`Transferencia` se soportan igualmente por si aparecen en una fila futura. Cualquier otro valor (o vacío) invalida la fila.

## 6. Validación de cada fila (funciones puras, con test unitario — constitution §2)

Una fila es inválida, y se descarta con un motivo, si cualquiera de esto ocurre (spec.md §4):

- La fecha está vacía o no se puede interpretar como fecha.
- La categoría/tipo (Ingresos) o el tipo de pago o la categoría/subtipo (Gastos) están vacíos, o el tipo de pago no está en la tabla del §5.
- El concepto está vacío.
- El importe está vacío, no se puede convertir a número (aceptando tanto un número de celda como texto que representa un número — verificado contra el fichero real, ver spec.md §4), o el número resultante es ≤ 0.

Cada motivo se expresa en un mensaje concreto (p. ej. `"Fila 464: faltan tipo de pago, categoría y concepto."`, `"Fila 102: el importe (0) no es positivo."`), no un genérico "fila inválida" — para que Diego pueda ir directo a esa fila del Excel si quiere corregirla.

## 7. Casos límite a cubrir con tests (ya verificados contra el fichero real, no hipotéticos)

- Fichero sin una hoja llamada exactamente "Ingresos" o "Gastos" → 400 claro, no un error genérico de parseo.
- Celda de importe guardada como texto (`"0.89"`) → se importa igual, convertida a número.
- Importe 0 → fila inválida (encontrado: una fila de Ingresos).
- Fila con tipo de pago, categoría y concepto vacíos a la vez, pero con importe → fila inválida (encontrado en Gastos).
- Fila con concepto vacío pero el resto de campos presentes → fila inválida (encontrado en Gastos).
- Categoría con espacios sobrantes (`"Comida "`) → se asocia a la misma categoría que `"Comida"`, no crea un duplicado.
- Valor de categoría sin coincidencia (`"Bancos"`, `"Emma"`, ...) → se crea una única vez aunque aparezca en varias filas del mismo `confirm` (no una categoría nueva por cada fila que la usa).
- `Acciones` (Ingresos) → se asocia a `Acciones (venta)`, no crea una categoría nueva "Acciones" en paralelo.
- Fila totalmente vacía (sin fecha ni ningún otro dato) → se ignora, no cuenta ni como válida ni como inválida.
- Confirmar con un fichero cuyas categorías nuevas ya se crearon en una importación anterior (p. ej. Diego repite `confirm` tras corregir el Excel y volver a subirlo) → no duplica esas categorías, las reutiliza (mismo criterio de normalización que en la creación).
- Aislamiento: todo lo creado (categorías y movimientos) pertenece al usuario autenticado que sube el fichero; ninguna consulta ni inserción ocurre sin su `userId`.
- Cuenta `PENDING_VERIFICATION` → 403 (mismo guard que el resto de rutas económicas).

## 8. Frontend

Una página `/import`, enlazada desde `HomePage`:

1. Selector de fichero (`<input type="file" accept=".xlsx">`) y botón "Validar".
2. Al validar, llama a `POST /import/excel/preview` y muestra: cuántas filas de ingresos/gastos son válidas, la lista de categorías nuevas que se crearían, y la lista de filas inválidas con su motivo (tabla en HTML plano, mismo criterio del resto de la app).
3. Un botón "Confirmar importación" (solo visible tras una vista previa sin errores de fichero — puede haber filas inválidas y aun así confirmar, ver spec.md decisión 4) que llama a `POST /import/excel/confirm` reutilizando el mismo fichero ya seleccionado (no hace falta volver a elegirlo) y muestra el resultado final (cuántos se importaron).
4. Tras confirmar, enlaces directos a `/movements` y `/dashboard` para que Diego vea el resultado.

## 9. Datos de prueba — regla importante

**El fichero real de Diego (`2026 2.xlsx`) contiene datos financieros personales reales (nómina, importes de compraventa de acciones, etc.) y no se incorpora al repositorio bajo ningún concepto** — ni como fixture de test, ni de ninguna otra forma. Los tests (unitarios y e2e) construyen ficheros `.xlsx` sintéticos con la librería `exceljs` (ver §2) dentro del propio test (mismo layout de columnas que el real, con filas inventadas que reproducen los casos límite ya identificados en §7), nunca a partir del fichero subido por Diego a esta conversación.

## 10. Fuera de este plan

Todo lo ya listado como fuera de alcance en `spec.md` §5 (fondos, bolsa, cashback, objetivos, comparativa interanual, detección de duplicados, edición de filas inválidas en el propio flujo, otros formatos de fichero, adaptación automática a una estructura de columnas distinta) queda igualmente fuera del diseño técnico.

---
**Siguiente paso:** revisar este plan (mapeo de columnas y categorías, diseño de los dos endpoints, decisión de no cachear la vista previa) y aprobarlo. Al aprobarlo, se genera `tasks.md` con el desglose en tareas implementables una a una.
