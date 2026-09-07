# Spec 032 — Exportación e importación de todos los datos (copia de seguridad)

**Estado:** Implementada
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Diego pide un menú desde el que exportar e importar **todos** los datos de su cuenta, en JSON. Ya existe un export parcial (spec 001, H8 "Exportar y eliminar cuenta", RGPD): `GET /users/me/export` descarga un JSON con perfil + categorías + movimientos. Ese export no se ha tocado desde spec 002 (T2.2) y ha quedado desactualizado: ninguno de los datos de patrimonio añadidos después (specs 019-025: cuentas bancarias, acciones, fondos, cripto, vehículos, plan de pensiones, efectivo — con sus historiales de compras/ventas/valoraciones/dividendos) ni objetivos/presupuestos (spec 004) están en él hoy.

Esta spec:
1. Amplía ese mismo export para que incluya **todo** el dato económico del usuario (H1) — un único export, siempre completo, en vez de mantener dos.
2. Añade la importación de un fichero exportado previamente, en modo **aditivo/fusión** (H2) — capacidad que no existe hoy (el "import" actual, specs 003/012/026, es solo para movimientos vía Excel/Google Sheets, no para restaurar una copia completa).
3. Da acceso a ambas desde un punto único (H3), en vez de solo dentro de "Mi perfil" como hoy el export RGPD.

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

## 2. Fuera de alcance

- Otros formatos de fichero (CSV, Excel...) — se mantiene JSON, mismo criterio ya usado por el export RGPD existente (spec 001, decisión 2) y el único capaz de representar sin pérdida toda la estructura relacional (CSV aplanaría categorías/historiales). Diego lo propuso abierto a alternativas; se confirma JSON como parte de esta spec (§3).
- Modo de importación "reemplazar todo"/restauración destructiva que borre lo ya existente — decisión explícita con Diego (§3): solo modo fusión/aditivo (H2).
- Detectar y fusionar duplicados "semánticos" cuando el id no coincide — por ejemplo, la misma acción borrada y vuelta a crear a mano entre dos exportaciones, con un id distinto la segunda vez. El emparejamiento de H2 criterio 3 es siempre por id; si eso produce una entidad duplicada (misma acción/fondo/cuenta dos veces con ids distintos), se resuelve borrando una a mano — mismo criterio pragmático que ya usa la app para "no crear un duplicado" en la pantalla normal (validación 409 en el servicio, no una regla de fusión inteligente). Se documenta como limitación conocida, no como bug.
- Importar o modificar datos de perfil/cuenta (nombre, email, contraseña, moneda, idioma) — el import de H2 solo afecta a datos económicos; el perfil que lleva el export (H1 criterio 2) es puramente informativo, nunca se usa para escribir nada al importar.
- Migrar datos de la cuenta de un usuario a la de otro — pensado como copia de seguridad/restauración de la propia cuenta (aislamiento por usuario, constitution §2), no como traspaso entre cuentas.
- Tocar la configuración de importación de Google Sheets (spec 026) — tiene su propia pantalla de gestión; no forma parte de este export/import.
- Exportar/importar sesiones activas, auditoría, o cualquier dato de autenticación — nunca formó parte del export RGPD y sigue sin formar parte de este.

## 3. Decisiones tomadas directamente con Diego

1. **Formato: JSON.** Diego lo propuso, abierto a otras opciones; se confirma JSON — mismo formato que el export RGPD ya existente (spec 001) y el único que representa la estructura relacional completa sin aplanarla.
2. **Importación en modo fusión/aditivo, nunca "reemplazar todo".** Decisión explícita: la importación nunca borra ni sobrescribe datos existentes, solo añade lo que falta (identificado por id) — prioriza seguridad frente a simplicidad de implementación.
3. **El export ampliado sustituye al export RGPD existente**, en vez de mantener dos exports distintos (uno "legal" y otro "completo") — un único botón, siempre completo y al día, sirviendo a la vez para RGPD y para copia de seguridad.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación (o los ajustes que pida), se genera `plan.md` con el diseño técnico (modelo del fichero, endpoints, orden de inserción por dependencias entre tablas, UI del nuevo menú).
