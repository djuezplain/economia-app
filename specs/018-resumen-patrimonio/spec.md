# Spec 018 — Resumen Patrimonio

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué añade

Una nueva sección de la aplicación, **"Resumen Patrimonio"**, con su propio hueco en el menú principal — distinta de "Ingresos y gastos"/Dashboard (que llevan el día a día) y pensada para registrar el patrimonio del usuario a lo largo del tiempo: cuentas bancarias, inversiones, vehículos, etc.

Tiene 7 categorías: **Cuentas Bancarias, Acciones, Fondos Inversión, Cripto, Vehículos, Fondo Pensiones, Efectivo**. Esta spec implementa por completo las dos primeras (Cuentas Bancarias y Acciones); el resto quedan como categorías visibles pero sin funcionalidad todavía (§2).

## 1. Historias de usuario

**H1 — Ver las 7 categorías del patrimonio**

Como usuario quiero ver, al entrar en "Resumen Patrimonio", las 7 categorías en las que puedo registrar mi patrimonio, para saber qué tipos de activo puedo llevar aquí aunque hoy no estén todos implementados.

- Criterio 1: se muestran siempre las 7 categorías, en el mismo orden: Cuentas Bancarias, Acciones, Fondos Inversión, Cripto, Vehículos, Fondo Pensiones, Efectivo.
- Criterio 2: cada categoría es una sección plegable, minimizada al entrar (mismo patrón que el Dashboard, spec 016) — maximizable de forma independiente, sin recordar el estado entre visitas.
- Criterio 3: las 5 categorías sin implementar (todo salvo Cuentas Bancarias y Acciones) muestran un aviso de "próximamente" en vez de un formulario — nunca un error ni una sección vacía sin explicación.

**H2 — Registrar entradas de Cuentas Bancarias**

Como usuario quiero anotar, en distintos momentos, cuánto dinero tengo en cada cuenta bancaria, para ver cómo evoluciona mi saldo a lo largo del tiempo.

- Criterio 1: cada entrada tiene Banco, Número de Cuenta, Euros y Fecha (con el día de hoy como valor por defecto al crear una entrada nueva).
- Criterio 2: cada entrada es independiente — se pueden registrar varias entradas del mismo banco/cuenta en fechas distintas, para llevar un historial (no se sustituyen entre sí ni hay un límite de una por cuenta).
- Criterio 3: Euros admite importes negativos (un descubierto es una cuenta real).
- Criterio 4: las entradas se listan ordenadas de la más reciente a la más antigua por Fecha.
- Criterio 5: cada entrada se puede editar (los 4 campos) o eliminar.
- Criterio 6: los datos de esta sección pertenecen únicamente al usuario que los crea — mismo aislamiento por usuario que el resto de la app (constitution §2).

**H3 — Registrar posiciones de Acciones**

Como usuario quiero anotar mis compras de acciones y su valoración actual, para ver cuánto valen hoy frente a lo que pagué por ellas.

- Criterio 1: cada entrada tiene Banco Custodia, Acción, Número de acciones, Precio de compra y Valoración actual.
- Criterio 2: Valor de compra (Precio de compra × Número de acciones) se muestra calculado — no es un campo que el usuario rellene, para que nunca pueda quedar desincronizado del precio/cantidad reales.
- Criterio 3: se pueden registrar varias entradas de la misma acción (compras en momentos distintos, a precios distintos) — mismo criterio de historial que Cuentas Bancarias (H2 criterio 2).
- Criterio 4: cada entrada se puede editar (todos los campos salvo el calculado) o eliminar.
- Criterio 5: mismo aislamiento por usuario que H2 criterio 6.

## 2. Fuera de alcance

- Cualquier funcionalidad real en Fondos Inversión, Cripto, Vehículos, Fondo Pensiones o Efectivo — quedan como categorías visibles con aviso de "próximamente" (H1 criterio 3), sin modelo de datos ni formulario.
- Un total de patrimonio agregado (suma de todas las categorías, evolución en un gráfico, etc.) — cada categoría se ve por separado; agregarlas queda para una spec futura si se decide.
- Cotización automática de acciones ("Valoración actual" es un campo manual, no se consulta ninguna fuente de mercado).
- Multidivisa — "Euros" es el único campo de importe de Cuentas Bancarias, y Acciones no lleva divisa propia (se asume € en toda la sección, igual que el resto de la app).
- Modo offline (mismo criterio ya aplicado a Dashboard y a Objetivos y presupuestos, spec 011 H6: fuera de alcance salvo que se pida explícitamente).

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. **Modelo de historial, no de valor único**: cada entrada de Cuentas Bancarias o Acciones es una fila independiente con su propia fecha (Cuentas Bancarias) o su propia compra (Acciones) — se pueden registrar varias entradas del mismo banco/cuenta o de la misma acción a lo largo del tiempo, en vez de una única fila por cuenta/posición que se sobrescribe. Encaja con que "Fecha" tenga el día de hoy como valor por defecto: cada alta es una nueva "foto", no una edición del valor ya existente.
2. **Euros admite negativo** (un descubierto bancario es una cuenta real) — el resto de importes nuevos (Precio de compra, Valoración actual) son siempre positivos, como cualquier precio.
3. Estructura visual: mismo patrón de secciones plegables ya construido para el Dashboard (spec 016/017) — icono + título por categoría, minimizada por defecto, independiente entre categorías.
