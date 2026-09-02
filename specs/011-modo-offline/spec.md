# Spec 011 — Modo offline (registrar movimientos sin conexión)

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia respecto a lo que ya existe

Esta spec **reabre explícitamente** una decisión de spec 009 §3: "una app o experiencia nativa/PWA" estaba fuera de alcance ("sigue siendo la misma aplicación web"). Para que la app pueda abrirse sin conexión (no solo seguir funcionando si ya estaba abierta) hace falta un Service Worker que sirva el shell de la app desde caché — eso convierte a la app en una PWA. `constitution.md` no necesita cambios porque esa decisión vivía en el spec de una feature, no en la tabla de stack técnico (`constitution.md §3`).

No cambia ninguna decisión de seguridad de spec 001: el access token sigue viviendo solo en memoria, nunca persistido (ver §4, decisión 5).

## 1. Historias de usuario

**H1 — Saber si estoy offline y si tengo cambios pendientes**

Como usuario, quiero ver un aviso claro de que estoy sin conexión y cuántos cambios tengo pendientes de sincronizar, para saber en qué estado está mi información.

- Criterio 1: mientras no hay conexión, aparece un aviso persistente y visible en toda la app autenticada (no un toast que desaparece solo) indicando "sin conexión".
- Criterio 2: el aviso muestra el número de cambios pendientes de sincronizar (no aparece contador si es 0).
- Criterio 3: en cuanto vuelve la conexión, el aviso lo refleja y arranca el procesamiento de pendientes (H4).

**H2 — Registrar, editar y eliminar movimientos sin conexión**

Como usuario, quiero poder añadir, modificar o borrar un movimiento aunque no tenga conexión en ese momento, para no perder el apunte por no tener red.

- Criterio 1: las páginas de registrar/editar movimiento (spec 006) funcionan igual estando offline: se puede rellenar y guardar el formulario, con las mismas validaciones locales que online (mismos campos obligatorios, mismos formatos).
- Criterio 2: al guardar offline, el movimiento aparece inmediatamente en el listado de Movimientos (spec 002/006) con los mismos datos que tendría si ya estuviera guardado en el servidor, marcado visualmente como "pendiente de sincronizar".
- Criterio 3: editar o eliminar un movimiento offline (esté ya sincronizado o sea uno creado offline) se refleja igual de inmediato en el listado, también marcado como pendiente.
- Criterio 4: crear un movimiento offline elige categoría/subcategoría entre las que ya están cacheadas (H3). Si el usuario necesita una categoría nueva que no existe, se le indica que crear categorías requiere conexión (H6, fuera de alcance de escritura offline — ver §3).

**H3 — Consultar movimientos, categorías y resumen sin conexión**

Como usuario, quiero poder abrir Movimientos, Categorías y Resumen sin conexión y ver los últimos datos sincronizados, para consultar mi situación económica aunque no tenga red.

- Criterio 1: mientras hay conexión, la app mantiene actualizada localmente una copia del histórico completo de movimientos y categorías del usuario autenticado (no solo lo que se ha visitado en la sesión actual).
- Criterio 2: sin conexión, esas páginas muestran los datos de esa copia local en vez de un error o una pantalla en blanco, incluyendo los cambios pendientes de H2 ya reflejados sobre esa copia.
- Criterio 3: cada pantalla indica de forma visible, cuando está offline, que los datos son "de la última sincronización" (para no dar una falsa sensación de estar al día).
- Criterio 4: Objetivos, Presupuestos, Importar Excel, Inicio y Dashboard no están cubiertos por esta historia — ver H6 y §3.
  > **Ajuste sobre la redacción original** (decidido durante la implementación de T3.3, `tasks.md` grupo 3): el borrador inicial de esta historia incluía Inicio/Dashboard. Al implementarlo se comprobó que tanto Dashboard como Inicio (dos páginas distintas — spec 005/008, no la misma cosa con dos nombres — que comparten el mismo resumen mensual) combinan cálculos (ahorro, medias diarias por mes, evolución mensual a lo largo de un año, progreso de objetivos de ahorro) que hoy solo existen en el backend (`dashboard.service.ts`/`dashboard.calculations.ts`, `goals-progress`) y que van más allá de las funciones de resumen ya necesarias para Movimientos/Resumen (`transactions.calculations.ts`, sí portadas a `frontend/src/offline/calculations.ts`). Replicar también esas habría duplicado bastante más lógica financiera de la que esta spec justifica mantener en dos sitios a la vez. Se decidió no hacerlo: sin conexión, tanto Inicio como Dashboard muestran "Esta página requiere conexión a internet" (mismo criterio que H6), en vez de una página a medias o con cálculos propios sin el mismo nivel de revisión que los del backend.

**H4 — Procesar los cambios pendientes al recuperar conexión, con listado visible**

Como usuario, quiero que en cuanto recupere conexión la app procese sola los cambios pendientes, mostrándome en todo momento un listado de qué se va a aplicar y qué ha pasado con cada uno.

- Criterio 1: en cuanto se recupera la conexión, si hay cambios pendientes, se muestra automáticamente un listado con cada uno (tipo de movimiento, acción — crear/editar/eliminar —, datos principales) y arranca el procesamiento sin que el usuario tenga que confirmarlo.
- Criterio 2: cada elemento del listado refleja su estado en tiempo real: pendiente → sincronizando → aplicado / fallido.
- Criterio 3: los cambios se aplican en el orden en que se crearon (para que una edición o borrado posterior a una creación offline del mismo movimiento no se procese antes que su creación).
- Criterio 4: mientras se procesan cambios, el usuario puede seguir usando la app con normalidad (no bloquea la interfaz).

**H5 — Resolver cambios fallidos**

Como usuario, quiero saber si algún cambio pendiente no se ha podido aplicar y por qué, y decidir si reintentarlo o descartarlo.

- Criterio 1: un cambio que falla al sincronizar (ej. la categoría usada ya no existe, error de validación, sesión caducada) se marca como "fallido" en el listado con un motivo entendible, sin bloquear el procesamiento del resto de cambios pendientes.
- Criterio 2: el listado de fallidos permanece visible hasta que el usuario decide algo — no desaparece solo.
- Criterio 3: el usuario puede reintentar un cambio fallido individualmente.
- Criterio 4: el usuario puede descartar un cambio fallido individualmente (con una confirmación explícita, por ser irreversible), eliminándolo de la cola sin aplicarlo.
- Criterio 5: si el fallo es por sesión caducada, se pide volver a iniciar sesión; tras hacerlo, los fallidos por ese motivo se reintentan automáticamente.

**H6 — Aviso claro de qué requiere conexión**

Como usuario, quiero que las partes de la app que no funcionan offline me lo digan claramente en vez de fallar de forma confusa.

- Criterio 1: Categorías (crear/editar/eliminar), Objetivos, Presupuestos, Importar Excel, Inicio y Dashboard (ver nota de H3 criterio 4) muestran un aviso explícito de "requiere conexión" al intentar usarse sin red, en vez de un error genérico o un formulario que falla al enviarse.
- Criterio 2: si no hay sesión activa en memoria y no hay conexión (app recargada u abierta de nuevo estando offline), se muestra una pantalla de "sin conexión, vuelve a conectarte para entrar" en vez de intentar mostrar datos — ver decisión 5 (§4).

## 2. Fuera de alcance de esta spec

- Crear, editar o eliminar **categorías** sin conexión.
- **Objetivos y presupuestos** sin conexión — ni lectura cacheada ni escritura.
- **Importar Excel** sin conexión.
- Resolución automática de conflictos de servidor más allá de mostrar el fallo y dejar reintentar/descartar (ej. si el mismo movimiento cambia también desde otro dispositivo mientras uno está offline, no hay "merge" automático — se trata como un fallo más de H5).
- Sincronización en tiempo real entre pestañas o dispositivos (websockets).
- Persistir la sesión (access/refresh token) para poder autenticarse sin red — ver decisión 5.
- Notificaciones push.
- Cualquier UI de instalación guiada ("añade esta app a tu pantalla de inicio") más allá de que el navegador lo ofrezca de forma nativa por cumplir los requisitos de una PWA instalable.

## 3. Decisiones tomadas con Diego antes de escribir esta spec

1. **Alcance de escritura offline: solo movimientos** (crear, editar, eliminar transacciones). Categorías, objetivos y presupuestos siguen requiriendo conexión para crearse o editarse (H6).
2. **La app pasa a ser una PWA instalable con Service Worker** — reabre y sustituye la decisión de spec 009 §3 (ver §0). El Service Worker cachea el shell de la app (HTML/JS/CSS), no sustituye la autenticación.
3. **Lectura offline con caché explícita**: se guarda localmente (no solo lo visto en la sesión) el histórico completo de movimientos y categorías, para que Movimientos, Resumen y Categorías funcionen sin conexión con los últimos datos sincronizados (H3). Objetivos, presupuestos, Inicio y Dashboard no se cachean en esta spec (ver nota de H3 criterio 4).
4. **Los cambios pendientes se muestran en un listado en vivo mientras se procesan** al recuperar conexión (no hace falta confirmación manual para arrancar, criterio H4.1), y los que fallan se quedan visibles hasta que el usuario los reintenta o descarta manualmente — no hay reintento silencioso en segundo plano sin que el usuario lo vea (H5).
5. **No se toca la decisión de seguridad de spec 001** (access token solo en memoria, nunca persistido). Si el usuario recarga o reabre la app estando offline sin sesión ya cargada en memoria, no hay forma de autenticarse sin red — se muestra un aviso de "vuelve a conectarte para entrar" (H6 criterio 2) en vez de intentar mostrar datos cacheados sin verificar quién es el usuario. Esto acota el caso real cubierto por esta spec a "se cae la conexión mientras la app ya estaba abierta y con sesión", no a "abrir la app por primera vez sin haber tenido nunca red".
