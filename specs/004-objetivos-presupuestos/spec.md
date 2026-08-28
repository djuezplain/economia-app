# Spec 004 — Objetivos de ahorro y presupuestos de gasto

**Estado:** Borrador
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** `docs/requisitos_app_economia.md` §6.4 (RF-4.1 a RF-4.4), fase 2 sugerida del propio documento (§10) — la siguiente tras cerrar el MVP (auth, ingresos/gastos, dashboard, importación: specs 001-003).

## 1. Por qué

En el Excel, Diego ya lleva un "Objetivo Gasto (30%)" fijo y un objetivo de ahorro que compara contra lo real cada mes. Ahora mismo el dashboard (spec 002) muestra el ahorro real y el desglose de gasto por categoría, pero no dice si eso está cumpliendo ningún objetivo — hay que mirar los números y juzgar a ojo. Esta spec cierra ese hueco: define objetivos de ahorro y presupuestos de gasto una vez, y la aplicación calcula el progreso real frente a ellos automáticamente, con aviso visual cuando conviene prestar atención.

## 2. Historias de usuario

**H1 — Definir un objetivo de ahorro**
Como usuario, quiero fijar cuánto quiero ahorrar al mes y/o al año, para tener una meta clara contra la que medir mi ahorro real.

- Criterio de aceptación 1: puedo definir un objetivo de ahorro mensual, uno anual, o ambos a la vez, cada uno como un importe fijo o como un % de mis ingresos del periodo.
- Criterio de aceptación 2: un objetivo de ahorro, una vez definido, se aplica automáticamente a todos los meses/años futuros (y al periodo en curso) hasta que lo cambie o lo borre — no tengo que volver a crearlo cada mes.
- Criterio de aceptación 3: puedo editar o borrar en cualquier momento el objetivo mensual y el anual, de forma independiente.
- Criterio de aceptación 4: solo puedo tener un objetivo mensual activo y un objetivo anual activo a la vez (editar sustituye al anterior, no se acumulan varios).

**H2 — Definir presupuestos de gasto**
Como usuario, quiero fijar cuánto quiero gastar como máximo, en total y en categorías concretas, para controlar mi gasto categoría a categoría además de en conjunto.

- Criterio de aceptación 1: puedo definir un presupuesto de gasto global (todas las categorías juntas) y, además, un presupuesto de gasto por cada categoría de gasto que quiera controlar por separado — ambos son mensuales.
- Criterio de aceptación 2: cada presupuesto se define como un importe fijo o como un % de mis ingresos del mes.
- Criterio de aceptación 3: un presupuesto, una vez definido, se aplica automáticamente a todos los meses futuros (y al mes en curso) hasta que lo cambie o lo borre.
- Criterio de aceptación 4: puedo editar o borrar cualquier presupuesto (el global o el de una categoría) de forma independiente, y solo puede existir un presupuesto por categoría y uno global a la vez.
- Criterio de aceptación 5: los presupuestos de categoría solo aplican a categorías de gasto de nivel superior (no a subcategorías) — el Excel origen tampoco baja a ese nivel de detalle para esto.

**H3 — Ver el progreso real frente a mis objetivos y presupuestos**
Como usuario, quiero ver, para el mes y el año en curso, cuánto llevo ahorrado/gastado frente a lo que me propuse, para saber si voy bien encaminado sin tener que calcularlo yo.

- Criterio de aceptación 1: para cada objetivo/presupuesto activo del periodo en curso, veo el importe objetivo, el importe real hasta hoy, la desviación (diferencia entre ambos) y el % ya alcanzado.
- Criterio de aceptación 2: para el periodo en curso (mes o año todavía no terminado), veo además una proyección de si se cumplirá al final del periodo, calculada al ritmo actual (mismo criterio que ya usa el dashboard para las medias diarias del mes en curso — spec 002, H4 criterio 3).
- Criterio de aceptación 3: para un periodo ya cerrado, veo el resultado real final frente al objetivo de ese periodo (sin proyección, porque ya se sabe lo que pasó).
- Criterio de aceptación 4: si no tengo ningún objetivo o presupuesto definido, la aplicación lo indica claramente en vez de mostrar una pantalla vacía sin explicación.

**H4 — Aviso visual al acercarme o superar un objetivo/presupuesto**
Como usuario, quiero que se me avise visualmente cuando me esté acercando al límite de un presupuesto, o cuando lo haya superado, para poder reaccionar a tiempo sin tener que estar revisando los números activamente.

- Criterio de aceptación 1: cada objetivo/presupuesto tiene su propio umbral de aviso (% configurable por mí, no fijo para todos), independiente de los demás.
- Criterio de aceptación 2: al alcanzar o superar ese umbral (sin llegar al 100%), se muestra un aviso de "cerca del límite"; al alcanzar o superar el 100%, un aviso de "superado" (para un presupuesto de gasto) o "cumplido" (para un objetivo de ahorro).
- Criterio de aceptación 3: el aviso es solo visual, dentro de la propia aplicación (ver decisión 3) — esta spec no envía ningún email ni notificación externa.

## 3. Aislamiento de datos (crítico, ver constitution §2)

- Cada objetivo y cada presupuesto pertenece exclusivamente al usuario que lo ha creado, igual que las categorías y los movimientos.
- Ningún cálculo de progreso mezcla movimientos de un usuario con el objetivo/presupuesto de otro — el progreso de cada objetivo se calcula únicamente contra los ingresos/gastos del mismo usuario dueño de ese objetivo.

## 4. Reglas de negocio concretas

- Un objetivo de ahorro no lleva categoría — es sobre el conjunto de ingresos/gastos del periodo, igual que el ahorro que ya calcula el dashboard (spec 002, H4/H5).
- Un presupuesto "global" de gasto tampoco lleva categoría — es sobre el total de gasto del mes, independiente de en qué categorías se reparta.
- Un presupuesto "por categoría" solo puede apuntar a una categoría de gasto de nivel superior (no una subcategoría) del propio usuario.
- El % de ingresos (para un objetivo o presupuesto de tipo "%") se calcula siempre sobre los ingresos reales del mismo periodo (mes o año) que se está evaluando — si un mes no tiene ingresos todavía, el objetivo en % de ese mes no tiene un importe objetivo calculable (se trata igual que "ahorro % con ingresos = 0" ya se trata en el dashboard: sin dato, no un 0% engañoso).
- La proyección de cumplimiento a fin de periodo solo se calcula para el periodo en curso (mes actual / año actual); un periodo ya cerrado muestra el resultado real, sin proyección.
- El umbral de aviso ("cerca del límite") es un % editable por objetivo/presupuesto, no un valor fijo en el código.

## 5. Fuera de alcance de esta spec

- **Notificaciones por email o push** al superar un presupuesto — decisión tomada explícitamente con Diego al arrancar esta spec (ver decisión 3); solo aviso visual dentro de la aplicación.
- **Presupuestos de gasto anuales** — el Excel origen y el caso de uso real de Diego son mensuales para el gasto; el objetivo de *ahorro* sí admite mensual y/o anual (H1), pero los presupuestos de *gasto* (H2) son solo mensuales en esta versión.
- **Presupuestos o desviaciones por subcategoría** — ver H2 criterio 5; si en el futuro hace falta ese nivel de detalle, será una spec/ampliación aparte.
- **Historial de objetivos/presupuestos pasados** (qué objetivo tenía definido Diego hace 3 meses, si ya lo cambió desde entonces) — un objetivo/presupuesto editado sustituye al valor anterior sin dejar rastro; ver decisión 2.
- **Ajuste automático de objetivos** (p. ej. subir el objetivo de ahorro automáticamente si un mes se supera con holgura) — los objetivos y presupuestos son siempre una decisión manual de Diego.

## 6. Decisiones

1. **Alcance de esta versión**: objetivo de ahorro (mensual y/o anual) + presupuestos de gasto por categoría **y** un presupuesto de gasto global, ambos mensuales. Decisión tomada explícitamente con Diego al arrancar esta spec, entre varias alternativas de alcance posibles.
2. **Objetivos y presupuestos son fijos, no periodo a periodo**: se definen una vez y se aplican automáticamente a todos los periodos futuros hasta que se editen o borren — igual que el "Objetivo Gasto 30%" del Excel, que no cambiaba mes a mes. Editar un objetivo/presupuesto cambia su valor hacia delante; no se guarda un histórico de valores anteriores (ver "Fuera de alcance").
3. **Solo aviso visual, sin email**: no se añade infraestructura de notificaciones nueva en esta spec — la única vía de correo que existe hoy es para autenticación (verificación, reset de contraseña), no para avisos recurrentes de uso. Decisión tomada explícitamente con Diego.
4. **Umbral de aviso configurable por el usuario**, no un valor fijo (p. ej. 80%) igual para todos los objetivos/presupuestos — cada uno lleva su propio %, editable. Decisión tomada explícitamente con Diego.
5. **La proyección de fin de periodo reutiliza el mismo criterio ya validado en el dashboard** (spec 002, H4 criterio 3: para el mes en curso, ritmo real hasta hoy extrapolado a los días totales del periodo) — no se inventa un método de proyección nuevo y distinto.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación, se genera `plan.md` con el diseño técnico (modelo de datos, endpoints, fórmulas exactas de progreso/desviación/proyección).
