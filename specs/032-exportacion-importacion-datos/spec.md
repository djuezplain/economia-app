# Spec 032 — Exportación e importación de todos los datos (copia de seguridad)

**Estado:** H1-H5 implementadas (H4/Google Drive pendiente solo de que Diego configure credenciales reales de Google, ver tasks.md Grupo 9, para la verificación end-to-end final — H5 usa esa misma conexión cuando destino = Drive).
**Fase:** H1-H5: 4 de 4 (Spec → Plan → Tasks → Implementación).

## 0. Qué cambia

Diego pide un menú desde el que exportar e importar **todos** los datos de su cuenta, en JSON. Ya existe un export parcial (spec 001, H8 "Exportar y eliminar cuenta", RGPD): `GET /users/me/export` descarga un JSON con perfil + categorías + movimientos. Ese export no se ha tocado desde spec 002 (T2.2) y ha quedado desactualizado: ninguno de los datos de patrimonio añadidos después (specs 019-025: cuentas bancarias, acciones, fondos, cripto, vehículos, plan de pensiones, efectivo — con sus historiales de compras/ventas/valoraciones/dividendos) ni objetivos/presupuestos (spec 004) están en él hoy.

Esta spec:
1. Amplía ese mismo export para que incluya **todo** el dato económico del usuario (H1) — un único export, siempre completo, en vez de mantener dos.
2. Añade la importación de un fichero exportado previamente, en modo **aditivo/fusión** (H2) — capacidad que no existe hoy (el "import" actual, specs 003/012/026, es solo para movimientos vía Excel/Google Sheets, no para restaurar una copia completa).
3. Da acceso a ambas desde un punto único (H3), en vez de solo dentro de "Mi perfil" como hoy el export RGPD.
4. Añade Google Drive como destino adicional de la exportación (H4), sin quitar la descarga local.
5. Añade poder programar que la exportación (H1) se repita sola, con periodicidad, hora y destino elegidos por Diego (H5) — hasta ahora H4 solo cubría un envío manual bajo demanda.

## 1. Historias de usuario

**H1 — Exportar todos mis datos en un único fichero**

Como usuario quiero descargar un fichero con absolutamente todo mi dato económico, para tener mi propia copia de seguridad o sacar mis datos de la aplicación.

- Criterio 1: el fichero (JSON) incluye, para el usuario autenticado: categorías, movimientos, cuentas bancarias (con su historial de saldos), acciones (con compras, ventas, valoraciones y dividendos), fondos de inversión (compras, valoraciones, dividendos), cripto (compras y valoraciones), vehículos (con valoraciones), plan de pensiones (aportaciones y valoraciones), efectivo (con historial de importes), objetivos de ahorro y presupuestos de gasto.
- Criterio 2: además de los datos económicos, incluye metadata: fecha/hora de exportación y una versión de formato (para poder evolucionarlo en el futuro sin romper ficheros antiguos). Incluye el perfil (nombre, moneda, idioma) como referencia informativa — nunca contraseña, hash de contraseña, tokens de sesión ni nada de autenticación.
- Criterio 3: sustituye al export RGPD existente (spec 001 H8) — mismo endpoint (`GET /users/me/export`), mismo botón en "Mi perfil", ahora con todo el contenido de criterio 1. Sigue sirviendo igual para la obligación RGPD de "exportar todos mis datos".
- Criterio 4: mismo aislamiento por usuario que el resto de la app — el fichero solo puede contener datos del usuario autenticado que lo pide.

**H2 — Importar datos desde un fichero exportado previamente**

Como usuario quiero poder subir un fichero exportado (de mi propia cuenta, en otro momento) para recuperar datos en mi cuenta actual, sin miedo a que me borre o pise nada de lo que ya tengo.

- Criterio 1: puedo subir un fichero `.json` generado por H1. Se valida que tiene el formato esperado (misma versión de formato o una compatible); si no, se rechaza con un error claro y no se importa nada.
- Criterio 2: la importación es **aditiva**: nunca borra ni modifica ningún dato que ya exista en mi cuenta.
- Criterio 3: cada registro del fichero se identifica por su id original. Si ya existe un registro con ese id en mi cuenta, se omite (no se duplica, no se sobrescribe). Si no existe, se añade tal cual, con todo su historial asociado (p. ej. una acción nueva trae consigo sus compras/ventas/valoraciones/dividendos). Importar el mismo fichero dos veces seguidas dos veces no cambia nada la segunda vez.
- Criterio 4: antes de confirmar, veo un resumen de qué se va a importar — cuántos registros nuevos hay por tipo de dato y cuántos ya existían y se van a omitir — sin que se haya tocado todavía ningún dato real. Confirmo explícitamente para ejecutar la importación.
- Criterio 5: la importación es todo-o-nada: si algo falla a mitad de camino (fichero corrupto a mitad, error inesperado), no queda ningún dato importado a medias.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — solo puedo importar contra mi propia cuenta autenticada; el fichero nunca puede hacer que se toquen datos de otro usuario.

**H3 — Un punto de acceso único para exportar e importar**

Como usuario quiero encontrar "exportar mis datos" e "importar datos" juntos, en un único sitio dedicado, en vez de solo dentro de mi perfil.

- Criterio 1: existe una pantalla/menú dedicado con las dos acciones (exportar / importar), enlazado desde la navegación principal. El detalle exacto de dónde vive y cómo se llama se decide en `plan.md` (fuera de esta spec, ver constitution §5).
- Criterio 2: "Mi perfil" deja de ser el único sitio con el botón de exportar (puede seguir teniendo un enlace al nuevo menú, a decidir en el plan).

**H4 — Guardar la exportación directamente en mi Google Drive**

Como usuario quiero poder enviar el fichero de exportación (H1) directamente a mi Google Drive, sin tener que descargarlo primero a mi dispositivo y subirlo yo a mano.

- Criterio 1: en la pantalla de copia de seguridad (H3), junto al botón "Exportar mis datos" (descarga local, sin cambios), hay un botón adicional "Guardar en Google Drive". Ninguno de los dos sustituye al otro.
- Criterio 2: la primera vez que se usa, la app pide autorización explícita para acceder a Google Drive ("Conectar Google Drive"), separada del login con Google — un usuario puede tener sesión iniciada con Google (o con email/contraseña) y no haber conectado Drive, y viceversa no aplica (conectar Drive exige tener cuenta en la app, pero no necesariamente haber iniciado sesión con Google). Una vez conectado, los siguientes envíos no vuelven a pedir autorización.
- Criterio 3: el acceso solicitado se limita a los ficheros que la propia app crea en Drive (alcance "solo mis ficheros"): la app nunca puede ver, listar ni tocar el resto del Drive del usuario.
- Criterio 4: el fichero se guarda en una carpeta propia de la app dentro del Drive del usuario (p. ej. "Económía App"), creada automáticamente la primera vez si no existe. El nombre del fichero sigue el mismo criterio que la descarga local (fecha incluida).
- Criterio 5: tras un envío correcto, se confirma en pantalla (p. ej. enlace al fichero en Drive). Si falla (p. ej. token de Drive caducado o revocado desde fuera de la app, cuota excedida), se muestra un error claro y no se pierde la posibilidad de seguir usando la descarga local con normalidad.
- Criterio 6: existe una forma de desconectar Google Drive desde la misma pantalla (revocar el acceso guardado en la app). Desconectar no borra los ficheros ya subidos a Drive.
- Criterio 7: mismo aislamiento por usuario que el resto de la app — el token de Drive de un usuario nunca se usa para otro, y se guarda cifrado en la base de datos (igual criterio que cualquier secreto de terceros, constitution §2 "seguridad por defecto").

**H5 — Programar exportaciones automáticas**

Como usuario quiero poder programar que mi copia de seguridad se guarde sola, con la periodicidad, hora y destino que yo elija, para no tener que acordarme de exportar a mano.

- Criterio 1: en la pantalla de copia de seguridad puedo activar "Exportación programada" y configurar: periodicidad (diaria, semanal — eligiendo el día de la semana, o mensual — eligiendo el día del mes, del 1 al 28), hora del día, y destino (una carpeta en el servidor, o Google Drive si ya lo tengo conectado — H4).
- Criterio 2: la exportación programada lleva siempre el mismo contenido que H1 (todos los datos económicos), nunca un subconjunto.
- Criterio 3: si elijo Google Drive como destino y no lo tengo conectado, no puedo activar la programación hasta conectar Drive primero (mismo criterio que H4).
- Criterio 4: puedo desactivar la exportación programada en cualquier momento sin perder la configuración — periodicidad, hora y destino quedan guardados por si la vuelvo a activar más adelante.
- Criterio 5: veo cuándo se ejecutó la última exportación programada y si fue bien o mal (con el motivo, si falló) — mismo criterio que ya existe para la importación automática de Google Sheets (spec 026 H3).
- Criterio 6: si una ejecución programada falla, no se reintenta hasta el siguiente ciclo programado, y no bloquea las de otros usuarios — decisión explícita (§3), sin aviso por email en esta versión.
- Criterio 7: "ruta local" como destino nunca es una ruta arbitraria del servidor que yo escriba a mano — siempre una carpeta propia de mi cuenta dentro de un directorio base que configura quien despliega la app (constitution §2, seguridad por defecto). Ver decisión 7 (§3).
- Criterio 8: mismo aislamiento por usuario que el resto de la app.

## 2. Fuera de alcance

- Otros formatos de fichero (CSV, Excel...) — se mantiene JSON, mismo criterio ya usado por el export RGPD existente (spec 001, decisión 2) y el único capaz de representar sin pérdida toda la estructura relacional (CSV aplanaría categorías/historiales). Diego lo propuso abierto a alternativas; se confirma JSON como parte de esta spec (§3).
- Modo de importación "reemplazar todo"/restauración destructiva que borre lo ya existente — decisión explícita con Diego (§3): solo modo fusión/aditivo (H2).
- Detectar y fusionar duplicados "semánticos" cuando el id no coincide — por ejemplo, la misma acción borrada y vuelta a crear a mano entre dos exportaciones, con un id distinto la segunda vez. El emparejamiento de H2 criterio 3 es siempre por id; si eso produce una entidad duplicada (misma acción/fondo/cuenta dos veces con ids distintos), se resuelve borrando una a mano — mismo criterio pragmático que ya usa la app para "no crear un duplicado" en la pantalla normal (validación 409 en el servicio, no una regla de fusión inteligente). Se documenta como limitación conocida, no como bug.
- Importar o modificar datos de perfil/cuenta (nombre, email, contraseña, moneda, idioma) — el import de H2 solo afecta a datos económicos; el perfil que lleva el export (H1 criterio 2) es puramente informativo, nunca se usa para escribir nada al importar.
- Migrar datos de la cuenta de un usuario a la de otro — pensado como copia de seguridad/restauración de la propia cuenta (aislamiento por usuario, constitution §2), no como traspaso entre cuentas.
- Tocar la configuración de importación de Google Sheets (spec 026) — tiene su propia pantalla de gestión; no forma parte de este export/import.
- Exportar/importar sesiones activas, auditoría, o cualquier dato de autenticación — nunca formó parte del export RGPD y sigue sin formar parte de este.
- **Importar desde Google Drive** (leer un fichero ya guardado allí) — H4 es solo de exportación/subida; H2 (importar) sigue funcionando exclusivamente subiendo un fichero `.json` desde el dispositivo, como hoy.
- **Elegir carpeta de destino en Drive** — H4 usa siempre la misma carpeta propia de la app (criterio 4), sin selector de carpetas (Google Picker); si en el futuro se pide poder elegir, es una spec/decisión aparte.
- **Copias de seguridad automáticas/periódicas a Drive** — H4 (envío manual bajo demanda) no cubre esto; a partir de esta revisión de la spec pasa a cubrirlo H5.
- **Elegir una ruta arbitraria del sistema de ficheros del servidor** (H5) — el destino "ruta local" siempre escribe dentro de la carpeta propia del usuario bajo el directorio base configurado por quien despliega la app; nunca una ruta que el usuario introduzca a mano (H5 criterio 7).
- **Aviso por email si falla una exportación programada** (H5) — decisión explícita (§3); queda para una spec futura si se prioriza.
- **Varias programaciones simultáneas** (H5) — p. ej. una diaria a Drive y otra semanal al servidor: una única configuración activa por usuario, mismo criterio que la importación automática de Google Sheets (spec 026).
- **Elegir zona horaria** (H5) — la hora programada se interpreta en la zona horaria del servidor; sin selector, ver decisión 9 (§3).
- **Que la exportación programada dispare automáticamente un import** (H2) — H5 es solo de escritura/exportación, no cruza con H2 de ninguna forma.

## 3. Decisiones tomadas directamente con Diego

1. **Formato: JSON.** Diego lo propuso, abierto a otras opciones; se confirma JSON — mismo formato que el export RGPD ya existente (spec 001) y el único que representa la estructura relacional completa sin aplanarla.
2. **Importación en modo fusión/aditivo, nunca "reemplazar todo".** Decisión explícita: la importación nunca borra ni sobrescribe datos existentes, solo añade lo que falta (identificado por id) — prioriza seguridad frente a simplicidad de implementación.
3. **El export ampliado sustituye al export RGPD existente**, en vez de mantener dos exports distintos (uno "legal" y otro "completo") — un único botón, siempre completo y al día, sirviendo a la vez para RGPD y para copia de seguridad.
4. **H4 (Google Drive) se añade como opción extra, no sustituye la descarga local** — se mantienen ambos botones.
5. **H4 pide autorización de Drive por separado del login con Google**, no se amplía el scope del login existente — así solo los usuarios que vayan a usar esta función conceden ese permiso adicional, y no se cambia el comportamiento del login para el resto.
6. **H4 usa el scope más restrictivo de Drive (`drive.file`)** — la app solo puede ver y gestionar los ficheros que ella misma crea, nunca el resto del Drive del usuario — y siempre la misma carpeta propia de la app, sin selector de carpetas.
7. **"Ruta local" (H5) = una carpeta en el servidor donde corre la app, no en el dispositivo de Diego.** Un proceso programado en el backend no tiene ninguna forma de escribir en el ordenador/móvil de Diego — solo puede escribir en el disco del servidor, exactamente igual que ya hace `deploy/backup.sh` con los volcados de Postgres. Se documenta explícitamente para que quede claro desde la spec, no como un descubrimiento a mitad de implementación.
8. **Fallo de una ejecución programada: solo queda registrado, se reintenta en el siguiente ciclo — sin aviso por email en esta versión.** Mismo criterio ya aceptado para la importación automática de Google Sheets (spec 026); prioriza simplicidad, revisable si en el futuro se echa en falta.
9. **Sin selector de zona horaria — la hora programada usa la zona horaria del servidor.** App autoalojada de un único usuario (Diego); si el servidor cambia de zona horaria, es una decisión de despliegue, no de esta feature.

---
**Siguiente paso:** revisar esta spec (incluyendo H4 y H5) con Diego; con su aprobación (o los ajustes que pida), se amplía `plan.md` con el diseño técnico de H5 (tabla de configuración de programación, barrido periódico/scheduler, endpoints, directorio local namespaced por usuario, UI en `BackupPage.tsx`). H4 ya tiene su diseño técnico completo en `plan.md` §9.
