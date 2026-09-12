# Spec 035 — Editar y borrar tickets ya guardados

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego tras usar spec 034 en producción — los tickets guardados hoy son de solo lectura (spec 034 §3 "fuera de alcance" no lo mencionaba porque no se había planteado; H5 solo cubría ver el historial y el detalle).

## 0. Qué cambia

Hoy, una vez confirmado un ticket (spec 034 H2), no hay forma de corregirlo ni de borrarlo — ni el propio ticket (fecha, supermercado, total) ni sus líneas (producto, cantidad, precio). Un error que se cuele en la revisión inicial, o un ticket importado por error, se queda así para siempre.

Diego quiere poder, sobre un ticket ya guardado:
- Borrarlo entero.
- Editar sus datos generales (fecha, supermercado, total impreso).
- Editar, borrar y añadir líneas.

## 1. Historias de usuario

**H1 — Borrar un ticket ya guardado**

Como usuario quiero poder borrar un ticket completo que importé por error o que ya no quiero conservar.

- Criterio 1: borrar un ticket borra también todas sus líneas (no puede quedar una línea huérfana).
- Criterio 2: se pide confirmación explícita antes de borrar — es irreversible, mismo criterio que el resto de borrados destructivos de la app (p. ej. borrar una acción en spec 020, cerrar sesión en spec 001 H6).
- Criterio 3: borrar un ticket no borra los productos ni el supermercado a los que estaba vinculado — pueden seguir usándose en otros tickets (H4 de spec 034 sigue funcionando con el resto de tickets del mismo producto).

**H2 — Editar los datos generales de un ticket**

Como usuario quiero poder corregir la fecha, el supermercado o el total impreso de un ticket ya guardado, por si me equivoqué al revisarlo la primera vez o el reconocimiento automático se equivocó y no me di cuenta hasta después.

- Criterio 1: se puede cambiar la fecha.
- Criterio 2: se puede cambiar el supermercado — a uno ya existente, o crear uno nuevo escribiendo su nombre, igual criterio que al importar (spec 034 H3).
- Criterio 3: se puede corregir (o borrar) el total impreso.

**H3 — Editar las líneas de un ticket ya guardado**

Como usuario quiero poder corregir una línea mal guardada, borrar una que no debería estar, o añadir una que faltaba — igual de bien que puedo hacerlo en la vista previa antes de confirmar (spec 034 H2), pero después de haber guardado el ticket.

- Criterio 1: cada campo de una línea (descripción, cantidad, unidad, precio/unidad, importe, producto emparejado) es editable.
- Criterio 2: se puede borrar una línea existente y añadir una línea nueva.
- Criterio 3: al emparejar una línea (nueva o editada) con un producto, aplica el mismo criterio que al importar: elegir uno ya existente o crear uno nuevo escribiendo su nombre (spec 034 H4 criterio 1) — sin fusión automática de nombres parecidos (spec 034 H4 criterio 2).
- Criterio 4: los cambios de una línea (o de borrarla/añadirla) afectan de inmediato a la comparativa de precios de spec 034 H4 — no hace falta ninguna acción aparte para que se refleje.

## 2. Fuera de alcance

- **Historial de cambios / auditoría de ediciones** — no se guarda quién editó qué ni cuándo, igual que el resto de datos económicos de la app no llevan auditoría de edición (spec 002 Movimientos tampoco la lleva).
- **Deshacer un borrado** — irreversible, igual que borrar una acción (spec 020) o una categoría (spec 002); la confirmación de H1 criterio 2 es la única red de seguridad.
- **Fusionar dos tickets, o mover una línea de un ticket a otro** — no pedido, se resuelve borrando y volviendo a añadir a mano si hiciera falta.
- **Editar/borrar productos o supermercados directamente** (fuera de lo que ya implica editar un ticket) — sigue fuera de alcance, igual que spec 034 §3.

---
**Siguiente paso:** escribir `plan.md` con el diseño técnico (endpoints, forma del formulario de edición, si reutiliza el mismo componente de líneas editables de `ReceiptImportPage`).
