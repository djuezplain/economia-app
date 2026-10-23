# Spec 049 — Recibos recurrentes: avisos, importes variables y conciliación

**Estado:** Pendiente de aprobación
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** petición directa de Diego ("gestión de recibos"). Lo básico de los recibos recurrentes ya existe (spec 047: plantillas, ocurrencias previstas, confirmar u omitir); esta spec cubre los huecos que la 047 dejó fuera. Nació como el bloque B de la spec 048 y se separó a petición de Diego para implementarla **primero**, porque H3 corrige un problema que puede estar duplicando gastos ya hoy (§0). La parte de tickets sigue en la spec 048.

## 0. Qué cambia respecto a lo que ya existe

| Hoy (spec 047) | Con esta spec |
|---|---|
| Las ocurrencias no avisan de nada. | Aviso por email antes del vencimiento y sección "Próximos recibos" en Inicio. |
| Las plantillas solo admiten importe fijo (fuera de alcance de la 047). | Importe estimado para recibos variables (luz, agua, gas…). |
| Confirmar una ocurrencia siempre crea un movimiento nuevo (047 H3). | La ocurrencia se concilia con el movimiento que ya trae la importación, sin duplicar. |

### Problema real detectado al escribir esta spec (motiva H3)

La importación desde Google Sheets se ejecuta sola cada 4 horas (`google-sheets-import.scheduler.ts`). Cuando Diego confirma una ocurrencia de un recibo domiciliado, se crea un movimiento con la **fecha prevista y el concepto de la plantilla**. Cuando después llega el cargo real por la importación, normalmente con otra fecha (el banco carga uno o dos días antes o después) y otro concepto, la detección de duplicados de spec 012 (coincidencia exacta de fecha, categoría, concepto, comercio, forma de pago e importe) **no lo reconoce** y lo inserta como movimiento nuevo. El gasto queda contado dos veces. Esto puede estar pasando ya hoy con las plantillas que existan.

## 1. Historias de usuario

**H1 — Aviso antes del vencimiento de un recibo**

Como usuario quiero recibir un aviso unos días antes de que venza un recibo recurrente, para tener saldo en la cuenta y que no me pille por sorpresa.

- Criterio 1: en cada plantilla (spec 047 H1) se puede activar un aviso y elegir con cuántos días de antelación (de 0 a 7).
- Criterio 2: el aviso se envía por email.
- Criterio 3: el aviso solo se envía para ocurrencias **pendientes**. No se envía para plantillas pausadas ni para ocurrencias ya confirmadas, omitidas o conciliadas (H3).
- Criterio 4: cada ocurrencia avisa una sola vez. Si en un mismo día toca avisar de varios recibos, se agrupan en un único email.
- Criterio 5: en Inicio aparece una sección "Próximos recibos" con las ocurrencias que vencen en los próximos 7 días y las vencidas sin resolver, tengan o no el aviso por email activado.
- Criterio 6: el usuario puede desactivar todos los avisos por email desde su perfil de una vez, sin tocar plantilla por plantilla.

**H2 — Recibos de importe variable**

Como usuario quiero que los recibos que cambian cada mes (luz, agua, gas) aparezcan como previstos con un importe estimado, en vez de tener que poner un importe fijo que nunca acierta.

- Criterio 1: una plantilla puede marcarse como "importe variable".
- Criterio 2: el importe estimado de una plantilla variable es la **media de los importes de sus 3 últimas ocurrencias resueltas** (confirmadas o conciliadas). Con menos de 3, la media de las que haya; sin ninguna, el importe que Diego puso en la plantilla.
- Criterio 3: las ocurrencias variables previstas muestran el importe como estimado (p. ej. "≈ 64,20 €"), distinguible a simple vista de uno fijo, en Recurrentes, en el calendario, en "Próximos recibos" (H1) y en el email de aviso.
- Criterio 4: al confirmar una ocurrencia variable, el importe viene relleno con la estimación pero se pide revisarlo (spec 047 H3 ya permite ajustar el importe; aquí pasa a ser el paso esperado).
- Criterio 5: las ocurrencias previstas, estimadas o no, siguen sin contar en totales, dashboard, objetivos ni resumen (spec 047 H2, sin cambios).
- Criterio 6: el cálculo de la estimación es una función pura con test unitario (constitution §2).

**H3 — Conciliar recibos con los movimientos importados**

Como usuario quiero que, cuando la importación trae el cargo real de un recibo, la app lo reconozca como la ocurrencia prevista en vez de dejarme dos movimientos para el mismo recibo.

- Criterio 1: al importar (Excel o Google Sheets, también la importación automática), un movimiento importado es **candidato** a una ocurrencia pendiente o vencida si coinciden el tipo y la categoría, la fecha está dentro de una ventana alrededor de la fecha prevista y el importe es igual (plantilla fija) o está dentro de un margen de la estimación (plantilla variable). La ventana y el margen se fijan en `plan.md`.
- Criterio 2: si hay **un único candidato** para la ocurrencia, y ese movimiento no es candidato de ninguna otra ocurrencia, se concilia automáticamente.
- Criterio 3: si para una ocurrencia hay más de un candidato, o un movimiento encaja con más de una ocurrencia, no se concilia automáticamente; queda como sugerencia en Recurrentes para que Diego elija.
- Criterio 4: conciliar marca la ocurrencia como **conciliada** con ese movimiento: no se crea ningún movimiento nuevo y la ocurrencia deja de estar pendiente. Si el importe real es distinto del previsto, manda el real.
- Criterio 5: las conciliaciones automáticas se pueden revisar: en Recurrentes se ven las últimas, con el movimiento al que se enlazó cada una.
- Criterio 6: desde una ocurrencia pendiente se puede elegir "Vincular a un movimiento existente" en vez de "Confirmar", buscando entre los movimientos cercanos.
- Criterio 7: deshacer una conciliación (automática o manual) devuelve la ocurrencia a pendiente sin borrar el movimiento.
- Criterio 8: si una ocurrencia ya estaba **confirmada** (movimiento creado por la app) y llega por importación el cargo real que le corresponde, la app avisa de un posible duplicado y ofrece quedarse con el movimiento importado y borrar el creado al confirmar. Nunca borra nada sin que Diego lo acepte.
- Criterio 9: para limpiar lo que ya pueda haber hoy (§0), hay una revisión única de posibles duplicados entre movimientos creados al confirmar ocurrencias y movimientos importados, con el mismo criterio que el 8.
- Criterio 10: todo sigue aislado por usuario (spec 047 H5), con tests de autorización.

## 2. Fuera de alcance

- **Notificaciones push en el móvil** — el aviso es por email y en Inicio.
- **Conexión directa con el banco** para detectar cargos — la conciliación trabaja sobre lo que ya entra por la importación de Excel/Google Sheets.
- **Crear movimientos solos a partir de recurrentes** — sigue siendo manual (spec 047), con la conciliación de H3 como alternativa a confirmar.
- **Estimación estacional** (mismo mes del año anterior) — se descartó en favor de la media de las 3 últimas (§3 decisión 3).
- **Nuevas frecuencias** (semanal, diaria, personalizada) — siguen fuera, igual que en spec 047.
- **Recurrentes sin conexión** — siguen requiriendo conexión, igual que en spec 047.

## 3. Decisiones tomadas con Diego

1. **Canal de los avisos:** email (ya existe `MailService`) más la sección "Próximos recibos" en Inicio.
2. **Conciliación:** automática cuando hay un único candidato claro, sugerida en el resto de casos.
3. **Estimación de importes variables:** media de las 3 últimas ocurrencias resueltas.
4. **Orden:** esta spec se implementa antes que la 048, por el problema de duplicados de §0.

---
**Siguiente paso:** aprobar la spec y escribir `plan.md` (modelo de datos de la conciliación, ventana y margen de H3 criterio 1, en qué punto de `import.service.ts` se engancha la conciliación, programación del envío de avisos).
