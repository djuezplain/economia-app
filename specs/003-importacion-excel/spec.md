# Spec 003 — Importación del histórico desde el Excel "2026"

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** `docs/requisitos_app_economia.md` sección 6.10 (RF-10.1, RF-10.2), y el fichero real `2026 2.xlsx` que Diego ha subido a esta conversación (hojas "Ingresos" y "Gastos" revisadas directamente, columna por columna y con sus datos reales, antes de escribir esta spec — no solo el mapeo de alto nivel del documento de requisitos).

## 1. Por qué

Diego lleva su economía personal en un Excel desde antes de que existiera esta aplicación. Spec 002 ya construyó el modelo de datos y las pantallas de ingresos, gastos, categorías y dashboard — pero mientras el histórico del Excel no esté en la base de datos, el dashboard y los filtros de spec 002 solo sirven para lo que Diego registre a partir de hoy. Esta spec traspasa ese histórico para que la aplicación sea útil de inmediato con todo el año ya cargado, cerrando el hueco que spec 002 §5 dejó deliberadamente pendiente ("la importación... se abordará como spec 003 una vez este módulo exista y tenga un modelo de datos estable al que importar").

## 2. Historias de usuario

**H1 — Importar el histórico de ingresos y gastos desde el Excel**
Como usuario, quiero subir mi Excel "2026" y que la aplicación traspase mis ingresos y gastos ya registrados, para no tener que introducirlos uno a uno a mano.

- Criterio de aceptación 1: al subir el fichero `.xlsx`, veo una vista previa de lo que se importaría (filas válidas y filas con problemas, con el motivo de cada una) **antes** de que se guarde nada — no se escribe ningún movimiento ni categoría en la base de datos hasta que confirmo explícitamente.
- Criterio de aceptación 2: cada fila válida de la hoja "Ingresos" pasa a ser un ingreso real (fecha, categoría, concepto, importe); el mes/año se deriva siempre de la fecha de la fila, nunca de la columna "Mes" del Excel (ver sección 4, regla encontrada en el fichero real).
- Criterio de aceptación 3: cada fila válida de la hoja "Gastos" pasa a ser un gasto real (fecha, tipo de pago, categoría, concepto, comercio, importe); ningún gasto importado lleva subcategoría, porque el Excel no distingue ese nivel de detalle.
- Criterio de aceptación 4: al confirmar la importación, veo un resumen con cuántas filas se importaron y cuántas se descartaron, con el motivo de cada fila descartada.

**H2 — Reconocer las categorías y tipos de pago del Excel aunque no coincidan literalmente**
Como usuario, quiero que los nombres de categoría y tipo de pago que usaba en el Excel se reconozcan al importar, aunque no coincidan carácter a carácter con los nombres ya usados en la aplicación, para no tener que revisar y corregir a mano cientos de filas después de importar.

- Criterio de aceptación 1: un valor de categoría del Excel que coincide (sin distinguir mayúsculas/minúsculas, tildes ni espacios sobrantes) con una categoría ya existente del usuario se asocia a ella, sin crear un duplicado.
- Criterio de aceptación 2: un valor de categoría del Excel sin ninguna coincidencia se crea automáticamente como una categoría nueva propia del usuario, para no perder el dato ni obligar a mapearlo a mano antes de poder importar nada.
- Criterio de aceptación 3: un valor de tipo de pago del Excel que no corresponde a ninguno de los 4 tipos fijos de la aplicación (Tarjeta, Recibo, Efectivo, Transferencia) hace que esa fila se trate como inválida (criterio H1.1) — el tipo de pago es un catálogo cerrado, a diferencia de las categorías, así que no se crea uno nuevo automáticamente.

## 3. Aislamiento de datos (crítico, ver constitution §2)

- Los movimientos y las categorías creados por una importación pertenecen exclusivamente al usuario que la ha hecho, exactamente igual que cualquier ingreso, gasto o categoría creados a mano.
- La importación no tiene ninguna vía de importar, ni de referenciar, datos de otro usuario — el fichero que se sube nunca contiene un identificador de usuario; todo lo que genera se asocia al usuario autenticado que hace la petición.
- La importación no es idempotente (ver sección 6, decisión 3): no hay detección de duplicados entre lo ya importado y una nueva importación. La vista previa de H1 criterio 1 es la salvaguarda pensada para esto — revisar antes de confirmar, no una detección automática.

## 4. Reglas de negocio concretas

Encontradas y verificadas contra el fichero real de Diego (`2026 2.xlsx`), no solo supuestas a partir del documento de requisitos:

- **Solo se procesan las hojas "Ingresos" y "Gastos"** del Excel. El resto de hojas del fichero real (`Resumen 2026`, `Descuentos`, `Groupama`, `2025vs2026`) se ignoran por completo — corresponden a módulos (patrimonio, inversiones, cashback, comparativa interanual, objetivos) que todavía no existen en la aplicación (ver spec 002 §5 y la decisión ya tomada con Diego al empezar esta spec).
- **El mes/año de cada movimiento se deriva siempre de la columna "Fecha"**, nunca de la columna "Mes" del propio Excel. Motivo encontrado en el fichero real: existen filas donde ambas columnas no coinciden (p. ej. una fila de "Ingresos" con fecha `31/08/2026` pero columna "Mes" = "Septiembre") — la columna "Mes" del Excel no es una fuente fiable, así que ni se lee ni se usa para nada; es exactamente el mismo criterio que ya aplica spec 002 a cualquier movimiento (H1/H2 criterio 1: "el mes/año se calculan a partir de la fecha, no los introduzco yo").
- **El importe se acepta si la celda es un número o un texto que representa un número**, e intenta convertirse antes de validar. Motivo encontrado en el fichero real: varias celdas de "Valor" en la hoja "Gastos" están guardadas como texto (p. ej. la cadena `"0.89"` en vez del número `0.89`) — un Excel usado a mano durante meses acumula este tipo de inconsistencias de formato de celda.
- **Un importe igual a 0 o negativo invalida la fila** (misma regla que spec 002 §4: "el importe es siempre positivo"). Encontrado en el fichero real: al menos una fila de "Ingresos" tiene importe `0`.
- **Una fila sin fecha, sin categoría/tipo de pago, sin concepto o sin importe (tras intentar convertirlo) es inválida** y se descarta, listada en el resumen de H1 criterio 4 con el motivo concreto. Encontrado en el fichero real: filas de "Gastos" con tipo de pago, categoría y concepto vacíos a la vez (pero con un importe), y una fila con el concepto vacío.
- **Los espacios en blanco al principio o final de un nombre de categoría o tipo de pago se recortan antes de comparar** (H2 criterio 1). Encontrado en el fichero real: la categoría "Comida" aparece tanto sin espacio como con un espacio final (`"Comida "`) en distintas filas, refiriéndose a la misma categoría.
- **Ningún gasto importado lleva subcategoría.** La hoja "Gastos" del Excel solo tiene un nivel de categoría (columna "Subtipo"); el concepto de subcategoría de dos niveles es propio del modelo de datos de la aplicación (spec 002, H3) y no existía en el Excel, así que no hay de dónde derivarlo.
- **El tipo de pago de la hoja "Gastos" es la columna "Tipo"** (no confundir con la columna "Tipo" de la hoja "Ingresos", que en esa hoja es la categoría) — mismo nombre de columna, significado distinto según la hoja, tal como ya está en el Excel real.

## 5. Fuera de alcance de esta spec

- **Fondos, operaciones de bolsa y cashback**, aunque RF-10.1 los menciona como parte de "la importación" — no tienen modelo de datos todavía en la aplicación (patrimonio, inversiones y cashback son módulos futuros, ya aparcados en spec 002 §5); se importarán en su propia spec cuando esos módulos existan. Decisión tomada explícitamente con Diego al arrancar esta spec.
- **Objetivos/presupuestos y comparativa interanual** — mismo motivo, specs futuras.
- **Detección de duplicados / reimportación idempotente** — no se construye ninguna lógica para detectar que una fila ya se importó antes; ver sección 3 y decisión 3.
- **Edición o corrección de filas inválidas desde la propia pantalla de importación** — si Diego quiere recuperar una fila descartada, corrige el Excel origen y vuelve a subirlo; no se construye un editor de filas dentro del flujo de importación.
- **Otros formatos de entrada** (CSV, integración en vivo con Google Sheets, etc.) — solo se admite subir un fichero `.xlsx` con la misma estructura de columnas que el fichero real revisado para esta spec.
- **Adaptarse automáticamente a una estructura de columnas distinta** — si Diego reorganiza su Excel en el futuro (cambia el orden o el nombre de las columnas), esta spec no lo sigue; el mapeo de columnas se basa en la estructura ya verificada del fichero real (`plan.md` la detallará celda a celda).
- **Mapear manualmente, fila a fila, categorías del Excel a categorías de la aplicación** — H2 ya resuelve esto de forma automática (coincidencia normalizada, o categoría nueva si no hay coincidencia); no hay un paso de "revisa y ajusta el mapeo" en el flujo.

## 6. Decisiones

1. **Mapeo de categorías Excel → aplicación**: comparación insensible a mayúsculas/minúsculas, tildes y espacios sobrantes contra las categorías ya existentes del usuario (semillas de spec 002 + las que haya creado); sin coincidencia, se crea una categoría nueva automáticamente, no marcada como semilla (`isDefault: false`). Verificado contra el fichero real: los 10 valores distintos de la columna "Tipo" de "Ingresos" coinciden, uno a uno, con las 10 categorías de ingreso semilla; de los 19 valores distintos de "Subtipo" en "Gastos" (18 si se cuenta "Comida"/"Comida " como el mismo), 12 coinciden con las categorías semilla de gasto y 6 no tienen ninguna coincidencia (se crearán como categorías nuevas). El mapeo completo, valor a valor, se detalla en `plan.md`.
2. **El tipo de pago es un catálogo cerrado**: a diferencia de las categorías, un valor de tipo de pago sin coincidencia no crea nada nuevo — invalida la fila (H2 criterio 3). En el fichero real solo aparecen 2 de los 4 tipos de pago existentes ("Tarjeta", "Recibos"); el mapeo cubre igualmente "Efectivo" y "Transferencia" por si aparecieran en una fila futura.
3. **Flujo en dos pasos, nunca uno solo**: "validar y previsualizar" (no escribe nada en la base de datos, solo devuelve qué se importaría y qué se descartaría) y, aparte, "confirmar" (inserta lo válido). Es la mitigación elegida para no tener detección de duplicados (decisión de alcance, sección 5): revisar antes de confirmar es responsabilidad del usuario, no de la aplicación.
4. **Las filas inválidas no bloquean el resto de la importación**: se importa lo válido y se informa de lo descartado con su motivo, en vez de todo-o-nada — con casi 650 filas reales entre ambas hojas y solo 5 con problemas, invalidar la importación completa por un puñado de filas sería peor experiencia que importar el resto y dejar esas 5 para corregir a mano.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación, se genera `plan.md` con el diseño técnico (formato de la API de importación, mapeo completo de columnas y de categorías, validaciones).
