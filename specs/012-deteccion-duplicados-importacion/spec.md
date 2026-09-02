# Spec 012 — Detección de duplicados al importar Excel

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia respecto a lo que ya existe

Spec 003 (importación de Excel) decidió explícitamente **no** detectar duplicados: *"la importación no es idempotente... la vista previa es la salvaguarda pensada para esto, no una detección automática"* (spec 003 §3), y lo dejó fuera de alcance (§5) con un test que fija ese comportamiento como esperado. Esta spec **revierte esa decisión**, motivada por un caso real: Diego reimportó por accidente el mismo fichero completo y duplicó 1487 movimientos (limpiados a mano, ver spec 011 — no relacionado con el modo offline, coincidió en la misma sesión).

No se toca nada de la importación en sí (parseo, validación de filas, creación de categorías nuevas) — se añade un paso más de clasificación, en el mismo sitio donde ya se separan filas válidas/inválidas y categorías nuevas/existentes (`backend/src/import/import.service.ts`, método `classify`).

## 1. Historias de usuario

**H1 — No duplicar movimientos que ya existen al reimportar**

Como usuario, quiero que si importo un fichero que contiene movimientos que ya tengo registrados, esos movimientos no se dupliquen — sin tener que hacer nada especial ni acordarme de revisar fila a fila.

- Criterio 1: una fila del Excel se considera "ya existente" si coincide **exactamente** con un movimiento ya guardado del mismo usuario en: fecha, categoría, concepto, importe y — en gastos — comercio y forma de pago. Cambiar cualquiera de esos campos hace que la fila ya no se detecte como duplicada (se importa como nueva, igual que hoy).
- Criterio 2: la comparación es contra **todo el histórico** del usuario, no solo contra movimientos de fechas cercanas a las del fichero — una reimportación de un fichero antiguo debe detectarse igual.
- Criterio 3: al confirmar la importación, las filas detectadas como ya existentes **no se insertan** — se saltan automáticamente, sin que el usuario tenga que marcar nada (mismo criterio que ya usan las categorías nuevas, que se resuelven solas).
- Criterio 4: el resultado de la confirmación indica cuántas filas se saltaron por ya existir, además de cuántas se importaron y cuántas eran inválidas (spec 003 H1).

**H2 — Ver antes de confirmar cuántas filas ya existen**

Como usuario, quiero saber en la vista previa cuántas filas de mi fichero ya están registradas, antes de confirmar la importación — para poder decidir si sigo adelante o reviso el fichero primero.

- Criterio 1: la vista previa (spec 003 H1) añade el recuento de filas detectadas como ya existentes, por separado de válidas/inválidas, para ingresos y para gastos.
- Criterio 2: el recuento de "válidas" que ya mostraba la vista previa no cambia de significado — una fila detectada como duplicada sigue siendo una fila válida (pasó todas las validaciones de formato), solo que no se va a insertar. La vista previa deja claro cuántas de las válidas son nuevas y cuántas ya existen.

## 2. Fuera de alcance de esta spec

- Detectar duplicados entre movimientos creados a mano (fuera de la importación) — esta spec solo mira la comparación entre lo que trae el fichero de Excel y lo que ya existe en la base, no entre dos movimientos manuales parecidos.
- Cualquier forma de "fusionar" o actualizar un movimiento existente con datos ligeramente distintos de una fila del fichero (ej. mismo día/importe pero concepto reescrito) — eso no se detecta como duplicado (criterio 1 de H1 es coincidencia exacta) y se importa como fila nueva, tal cual hoy.
- Opción de "importar de todos modos" un duplicado detectado — se excluye siempre, no hay forma de forzar su inserción desde la UI (si de verdad se quiere, se podría registrar a mano desde "Registrar movimiento", que no pasa por esta comprobación).
- Deshacer una importación ya confirmada (no relacionado con esta spec, sigue sin existir).

## 3. Decisiones tomadas con Diego antes de escribir esta spec

1. **Criterio de duplicado: coincidencia exacta** en fecha, categoría, concepto, importe y (en gastos) comercio/forma de pago — no una coincidencia parcial (ej. solo fecha+importe), para minimizar falsos positivos sobre movimientos legítimos que coincidan por casualidad.
2. **Los duplicados se excluyen solos al confirmar, sin pedir confirmación fila a fila** — mismo criterio de "resolución automática silenciosa" que ya usan las categorías nuevas en spec 003, la vista previa es donde se informa, no donde se decide caso a caso.
