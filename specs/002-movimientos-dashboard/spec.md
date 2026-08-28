# Spec 002 — Ingresos, gastos y dashboard mensual

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** `docs/requisitos_app_economia.md`, secciones 6.1 (Ingresos), 6.2 (Gastos) y 6.3 (Dashboard y resumen mensual/anual)

## 1. Por qué

Es el segundo feature del proyecto porque es el núcleo funcional que sustituye al Excel "2026": registrar los movimientos económicos del día a día y ver un resumen de cómo va el mes. Todo lo demás (objetivos, patrimonio, inversiones, cashback) se construye encima de estos datos, así que va primero.

Sigue la "Fase 1 — MVP" que ya sugiere el propio `docs/requisitos_app_economia.md` (sección 10): autenticación (spec 001, ya cerrada) + ingresos y gastos + dashboard mensual básico. La importación del histórico del Excel (sección 6.10 del documento) queda deliberadamente fuera de esta spec — es un feature bastante autónomo y con su propia complejidad (parseo, validación de filas incompletas) como para mezclarlo aquí; se abordará como spec 003 una vez este módulo exista y tenga un modelo de datos estable al que importar.

## 2. Historias de usuario

**H1 — Registrar ingresos**
Como usuario, quiero registrar mis ingresos con fecha, categoría, concepto e importe, para llevar el control de todo el dinero que entra.

- Criterio de aceptación 1: dado un ingreso válido (fecha, categoría, concepto, importe positivo), cuando lo registro, entonces queda guardado y el mes/año se calculan automáticamente a partir de la fecha (no los introduzco yo).
- Criterio de aceptación 2: puedo editar y eliminar un ingreso ya registrado.
- Criterio de aceptación 3: puedo listar mis ingresos filtrando por rango de fechas, categoría y texto libre sobre el concepto.
- Criterio de aceptación 4: la aplicación calcula automáticamente (sin que yo lo introduzca a mano) el total y la media mensual de ingresos, tanto por categoría como global.

**H2 — Registrar gastos**
Como usuario, quiero registrar mis gastos con fecha, tipo de pago, categoría/subcategoría, concepto, comercio e importe, para llevar el control de todo el dinero que sale.

- Criterio de aceptación 1: dado un gasto válido (fecha, tipo de pago, categoría, concepto, importe positivo), cuando lo registro, entonces queda guardado y el mes/año se calculan automáticamente.
- Criterio de aceptación 2: puedo editar y eliminar un gasto ya registrado.
- Criterio de aceptación 3: puedo listar mis gastos filtrando por rango de fechas, categoría, subcategoría y comercio.
- Criterio de aceptación 4: la aplicación calcula automáticamente el total y la media mensual de gastos, por categoría, por subcategoría y global.

**H3 — Gestionar categorías**
Como usuario, quiero tener categorías (y subcategorías, para gastos) predefinidas al empezar y poder crear las mías propias, para clasificar mis movimientos como me haga falta.

- Criterio de aceptación 1: al registrarme, ya tengo disponibles las categorías iniciales de ingresos y las categorías/subcategorías iniciales de gastos (ver sección 4) sin tener que crearlas yo.
- Criterio de aceptación 2: puedo crear categorías (y subcategorías de gasto) propias además de las iniciales.
- Criterio de aceptación 3: no puedo ver ni usar las categorías creadas por otro usuario, ni él las mías.

**H4 — Dashboard del mes**
Como usuario, quiero ver un resumen del mes en curso al entrar en la aplicación, para saber de un vistazo cómo va mi economía sin tener que sumar nada a mano.

- Criterio de aceptación 1: veo el total de ingresos, total de gastos, ahorro (ingresos − gastos) y % de ahorro del mes en curso.
- Criterio de aceptación 2: veo un desglose de mis gastos del mes por categoría (p. ej. para un gráfico circular).
- Criterio de aceptación 3: veo indicadores calculados automáticamente: gasto medio por día, ingreso medio por día y ahorro medio por día del mes en curso.
- Criterio de aceptación 4: puedo consultar el mismo resumen (ingresos, gastos, ahorro, % ahorro) de cualquier mes anterior, no solo el actual.

**H5 — Vista anual**
Como usuario, quiero ver la evolución de mis ingresos, gastos y ahorro a lo largo del año, para entender tendencias que un resumen mes a mes no muestra.

- Criterio de aceptación 1: veo la evolución mensual de ingresos, gastos y ahorro de un año seleccionable (gráfico de líneas o barras).
- Criterio de aceptación 2: veo los acumulados del año: ingresos totales, gastos totales, ahorro total y % de ahorro global del año.

## 3. Aislamiento de datos (crítico, ver constitution §2)

- Todo ingreso, gasto y categoría pertenece exclusivamente a un usuario (`user_id`); ningún endpoint puede leer, listar, editar ni eliminar movimientos o categorías de otro usuario, igual que ya se exige y se prueba para sesiones y perfil en la spec 001.
- Los totales, medias y el dashboard se calculan siempre sobre los movimientos del usuario autenticado — nunca sobre datos agregados de otros usuarios ni globales de la aplicación.
- El rol Administrador sigue sin acceso a los datos económicos concretos de un usuario (ver spec 001 §3) — esta spec no cambia eso; simplemente ahora sí existen datos económicos reales a los que esa restricción aplica.

## 4. Reglas de negocio concretas

- **Categorías iniciales de ingreso** (semilla editable, no fija): Nómina, Dividendo, Intereses, Acciones (venta), Cashback, Descuentos, Lotería, Regalo, Dietas, Otros. (RF-1.2)
- **Categorías/subcategorías iniciales de gasto** (semilla editable): Comida, Transporte, Salud, Vivienda/Alquiler, Coche, Ropa, Suscripciones, Utilities, Ocio/Caprichos, Apuestas, Asociaciones, Varios. (RF-2.3)
- **Tipos de pago iniciales de gasto**: Tarjeta, Recibo (domiciliación), Efectivo, Transferencia. (RF-2.2)
- Un gasto puede tener subcategoría (opcional); un ingreso no tiene subcategoría.
- El mes/año de un movimiento se deriva siempre de su fecha — no es un campo que el usuario rellene.
- El importe de un ingreso o gasto es siempre positivo; el signo (entra/sale) lo da el tipo de movimiento, no el importe.
- % de ahorro = (ingresos − gastos) / ingresos, del periodo correspondiente (mes o año). Si los ingresos del periodo son 0, el % de ahorro no se calcula (se muestra como "sin datos", no como división por cero ni como 0%).
- Todos los cálculos (totales, medias, % de ahorro) son funciones puras con test unitario propio (constitution §2 — "los cálculos financieros no llevan lógica a ojo"), no columnas guardadas que haya que mantener sincronizadas.
- Todos los importes se asumen en la moneda por defecto del usuario (`users.currency`, ya existente desde la spec 001) — no hay conversión de divisas ni importes en otra moneda en esta spec (fuera de alcance también en `docs/requisitos_app_economia.md` §9).

## 5. Fuera de alcance de esta spec

- **Ingresos y gastos recurrentes** (RF-1.6, RF-2.7) — el propio documento de requisitos los sitúa en la "Fase 4" (sección 10), junto a cashback y notificaciones; no entran en esta spec.
- **Categorías/subcategorías personalizadas más allá de crear-editar-eliminar básico** — no hay reordenación, iconos ni colores; eso es una decisión de UI para el plan si hiciera falta, no un requisito funcional de esta spec.
- **Objetivos y presupuestos** (sección 6.4 del documento) — spec posterior; el dashboard de esta spec muestra realidad, no progreso frente a un objetivo.
- **Patrimonio y proyección** (6.5), **inversiones** — acciones y fondos (6.6, 6.7), **cashback** (6.8) y **comparativa interanual** (6.9) — specs posteriores, cada uno un feature propio.
- **Importación desde el Excel "2026"** (6.10) — spec 003, según lo hablado.
- **Exportación a CSV/Excel/PDF** (6.11) — fuera de esta spec. La exportación JSON de RGPD ya existente desde la spec 001 (H8) empezará a incluir datos reales de ingresos y gastos de forma natural en cuanto las tablas existan (hoy `economicData` es un placeholder explicativo) — se trata como una actualización menor a documentar en `plan.md`, no como una tarea funcional nueva de esta spec.
- **Multidivisa / conversión de tipos de cambio** — descartado para todo el proyecto (ver `docs/requisitos_app_economia.md` §9).

## 6. Decisiones (antes "preguntas abiertas")

1. **Modelo de subcategorías**: dos niveles como mucho (categoría → subcategoría), tal como propone `docs/requisitos_app_economia.md` §8.3 (`subcategoria_padre_id` nullable) — no hay jerarquías más profundas.
2. **Búsqueda por texto libre en el concepto** (RF-1.4/RF-2.5): coincidencia simple tipo "contiene" (case-insensitive), no un motor de búsqueda full-text — se puede ampliar en el futuro si hace falta.
3. **Borrado de ingresos/gastos**: borrado físico inmediato, sin papelera ni soft-delete — consistente con la misma decisión ya tomada para la cuenta de usuario en la spec 001 (H8).
4. **Categorías iniciales**: se crean automáticamente para cada usuario nuevo en el momento del registro (no son compartidas/globales), para que desde el primer ingreso o gasto ya estén disponibles y el usuario pueda editarlas o borrarlas libremente sin afectar a nadie más.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación, se genera `plan.md` con el diseño técnico (modelo de datos, endpoints, decisiones de implementación).
