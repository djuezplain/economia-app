# Spec 026 — Importación automática desde Google Sheets

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** spec 003 (importación de Excel) y spec 012 (detección de duplicados), decisiones tomadas directamente con Diego en conversación (sección 6).

## 1. Por qué

Spec 003 dejó explícitamente fuera de alcance "otros formatos de entrada (CSV, integración en vivo con Google Sheets, etc.)": solo se admitía subir a mano un fichero `.xlsx`. Eso obliga a Diego a exportar y subir el fichero cada vez que quiere que la aplicación refleje lo último que ha anotado — un paso manual que además tiene que acordarse de repetir. Esta spec permite indicar una Google Sheet como origen de esos mismos datos y automatiza su importación, para que la aplicación esté al día sin intervención.

## 2. Historias de usuario

**H1 — Configurar la Google Sheet de origen**

Como usuario quiero indicar qué Google Sheet contiene mis ingresos y gastos, para que la aplicación pueda leerla en vez de tener que subir un fichero a mano.

- Criterio 1: indico la URL o el ID de mi Google Sheet, junto con instrucciones claras de compartirla (permiso de "Lector") con un email fijo que la aplicación proporciona.
- Criterio 2: al guardar, la aplicación comprueba que puede leer la hoja y avisa con un error claro y accionable si no puede (no compartida todavía, ID inválido, hoja no existe) — no se acepta una configuración que no funciona.
- Criterio 3: puedo cambiar o quitar la hoja configurada cuando quiera; quitarla desactiva también la importación automática (H3), sin borrar ningún movimiento ya importado anteriormente.
- Criterio 4: mi configuración (ID de la hoja) es privada — ningún otro usuario puede verla ni usarla, mismo aislamiento por usuario que el resto de la aplicación.

**H2 — Importar manualmente desde la hoja configurada, sin subir ningún fichero**

Como usuario quiero pulsar un botón para importar ya mismo desde mi Google Sheet configurada, para traer lo último que he anotado sin esperar al ciclo automático.

- Criterio 1: con una hoja configurada (H1), la pantalla de Importación ofrece una opción de "Importar ahora" que no requiere seleccionar ni subir ningún fichero.
- Criterio 2: se leen las hojas "Ingresos" y "Gastos" de la Google Sheet configurada, aplicando exactamente las mismas reglas de validación de filas, mapeo de categorías/tipos de pago y detección de duplicados que ya usa la importación de un fichero `.xlsx` (specs 003 y 012) — mismo motor, solo cambia de dónde vienen las filas.
- Criterio 3: a diferencia de la importación de fichero (que exige previsualizar y confirmar en dos pasos), esta inserta directamente lo válido y no duplicado — sin pantalla intermedia de confirmación.
- Criterio 4: al terminar veo un resumen igual de completo que el de hoy: cuántas filas se importaron, cuántas se saltaron por ya existir y cuántas eran inválidas, con el motivo de cada una.
- Criterio 5: si la hoja no está configurada, o no es accesible en ese momento (permiso retirado, hoja borrada, error de red...), veo un error claro explicando qué ha pasado, sin que afecte al resto de la aplicación.

**H3 — Mantener mis movimientos al día automáticamente**

Como usuario quiero que, una vez configurada mi Google Sheet, la aplicación la importe sola de forma periódica, para no tener que acordarme de hacerlo manualmente.

- Criterio 1: con una hoja configurada (H1), puedo activar la importación automática desde la misma pantalla de configuración.
- Criterio 2: mientras está activada, la aplicación repite el mismo proceso de H2 cada 4 horas, sin que yo tenga que hacer nada.
- Criterio 3: puedo ver el resultado de la última ejecución automática (fecha/hora, filas importadas/saltadas/inválidas, o el motivo si falló) desde la pantalla de Importación — no tengo que confiar a ciegas en que "algo ha pasado" en segundo plano.
- Criterio 4: puedo desactivar la importación automática cuando quiera sin perder la hoja configurada — puedo volver a activarla más tarde, o seguir usando solo la importación manual (H2) mientras tanto.
- Criterio 5: un fallo en una ejecución automática (hoja inaccesible, error de red, etc.) no bloquea las siguientes ejecuciones ni afecta a la importación automática de otros usuarios.

## 3. Aislamiento de datos (crítico, ver constitution §2)

- La configuración de cada usuario (ID/URL de su hoja, si la importación automática está activa) es exclusivamente suya — no existe ninguna pantalla ni endpoint que permita ver o disparar la importación de otro usuario.
- Los movimientos y categorías creados por esta vía pertenecen exclusivamente al usuario cuya hoja se ha leído, exactamente igual que los creados a mano o por la importación de fichero (spec 003 §3).
- La credencial de la cuenta de servicio usada para leer las hojas es un secreto de la aplicación (no del usuario) y no se expone nunca al frontend ni a otros usuarios; solo concede acceso de lectura a las hojas que cada usuario decide compartir con ella explícitamente.

## 4. Fuera de alcance

- **Acceso vía OAuth de Google o hojas con enlace público** — se descarta a favor de compartir con una cuenta de servicio fija (ver decisión 1). No se piden permisos adicionales sobre el login con Google ya existente.
- **Importar patrimonio** (cuentas, acciones, fondos, etc.) desde la hoja — sigue fuera de alcance, mismo criterio que spec 003 §5.
- **Escribir en la Google Sheet del usuario** — la integración es solo de lectura; la aplicación nunca modifica la hoja de origen.
- **Notificaciones por email o push** cuando una importación automática termina o falla — no existe hoy un sistema de notificaciones en la aplicación; el aviso vive dentro de la propia app (H3 criterio 3), se ve la próxima vez que el usuario la abre.
- **Frecuencia configurable** — las 4 horas son fijas para todos los usuarios en esta spec, no hay pantalla para elegir otra periodicidad.
- **Deshacer una importación** ya insertada (manual o automática) — no existe tampoco para la importación de fichero (spec 003), no se añade aquí.
- **Actualizar o fusionar un movimiento ya importado** si la fila correspondiente cambia después en la hoja de origen — el criterio de duplicado sigue siendo coincidencia exacta (spec 012 §3.1); una fila editada en la Sheet se importa como fila nueva, no sustituye a la anterior. Si Diego corrige un dato ya importado, lo edita a mano en la aplicación.
- **Multidivisa y modo offline** — no aplican, mismo criterio que el resto de importación y de Resumen Patrimonio.

## 5. Decisiones tomadas directamente con Diego

1. **Acceso a la hoja: cuenta de servicio de Google**, no OAuth ni enlace público. El usuario comparte su hoja (permiso "Lector") con un email fijo que la aplicación expone — evita pedir permisos adicionales sobre el login con Google ya existente y evita exponer la hoja públicamente. El detalle técnico (credenciales, API usada) se define en `plan.md`.
2. **Contenido a importar: igual que el Excel actual** — mismas hojas "Ingresos"/"Gastos", mismas columnas y mismas reglas de validación/mapeo ya definidas en spec 003. Solo cambia el origen del dato, no lo que se importa.
3. **Frecuencia de la importación automática: fija, cada 4 horas**, igual para todos los usuarios — no configurable en esta spec.
4. **Sin previsualización en esta vía**: a diferencia de subir un fichero, tanto la importación manual (H2) como la automática (H3) insertan directamente, apoyándose en la detección de duplicados ya existente (spec 012) como salvaguarda en vez de un paso de confirmación humana — imprescindible para que la ejecución automática tenga sentido sin supervisión.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación, se genera `plan.md` con el diseño técnico (modelo de datos para la configuración por usuario, cómo se agenda la ejecución cada 4 horas, credenciales de la cuenta de servicio, adaptación de `import.service.ts` para leer filas desde Google Sheets en vez de un buffer `.xlsx`).
