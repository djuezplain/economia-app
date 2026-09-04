# Spec 019 — Cuentas bancarias únicas, con historial de saldos

**Estado:** Aprobada (decidida directamente con Diego en conversación, como corrección de spec 018 H2)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 018 (Resumen Patrimonio) implementó "Cuentas Bancarias" como un histórico plano: cada alta era una fila suelta con Banco, Número de Cuenta, Euros y Fecha, sin ninguna relación entre filas del mismo banco/cuenta más allá de que el texto coincidiera. Esta spec lo corrige: **la cuenta bancaria (Banco + Número de Cuenta) pasa a ser una entidad única por usuario**, y el histórico de saldos (Euros + Fecha) se registra **dentro** de esa cuenta, no como filas sueltas — así se puede sacar el historial de una cuenta de forma fiable, sin depender de que el texto se haya escrito igual cada vez.

## 1. Historias de usuario

**H1 — Dar de alta una cuenta bancaria una sola vez**

Como usuario quiero registrar cada cuenta bancaria (Banco + Número de Cuenta) una única vez, para no tener que volver a escribirla cada vez que quiero anotar su saldo.

- Criterio 1: una cuenta se crea con Banco y Número de Cuenta.
- Criterio 2: no se puede crear dos veces la misma cuenta (mismo Banco + mismo Número de Cuenta) para el mismo usuario — se avisa con un error claro en vez de crear un duplicado.
- Criterio 3: Banco y Número de Cuenta se pueden editar después de creada la cuenta (p. ej. para corregir una errata), sin perder su historial de saldos.
- Criterio 4: eliminar una cuenta elimina también todo su historial de saldos (no puede quedar un historial huérfano) — se avisa antes de que sea irreversible.

**H2 — Registrar el saldo de una cuenta en distintos momentos**

Como usuario quiero anotar, dentro de una cuenta ya creada, cuánto dinero tenía en distintas fechas, para ver su evolución en el tiempo.

- Criterio 1: cada entrada de saldo tiene Euros y Fecha (con el día de hoy por defecto) — el Banco y el Número de Cuenta ya no se repiten en cada entrada, los hereda la cuenta a la que pertenece.
- Criterio 2: una cuenta puede tener cualquier número de entradas de saldo, en cualquier fecha (incluidas varias en el mismo día si el usuario quiere corregir o repetir una anotación).
- Criterio 3: Euros sigue admitiendo importes negativos (descubierto) — sin cambios respecto a spec 018.
- Criterio 4: el historial de una cuenta se muestra ordenado de la entrada más reciente a la más antigua.
- Criterio 5: cada entrada de saldo se puede editar (Euros, Fecha) o eliminar, sin afectar a las demás entradas ni a la cuenta.
- Criterio 6: mismo aislamiento por usuario que el resto de la app — una entrada de saldo solo se puede añadir a una cuenta propia, nunca a una de otro usuario.

## 2. Fuera de alcance

- Cualquier cambio a "Acciones" — sigue exactamente igual que en spec 018 (varias entradas de la misma acción, sin entidad "acción única").
- Cualquier cambio a las 5 categorías sin implementar de spec 018.
- Migrar automáticamente cuentas que en spec 018 se escribieron con variaciones de texto (p. ej. "BBVA" vs "Bbva") a una única cuenta — cada combinación exacta de texto sigue siendo una cuenta distinta; unificar duplicados por texto parecido no es parte de esta spec.

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. Modelo en dos niveles: **cuenta** (Banco + Número de Cuenta, única por usuario) y **saldo** (Euros + Fecha, muchos por cuenta) — no un histórico plano de filas sueltas.
2. La unicidad de una cuenta (Banco + Número de Cuenta) se valida en el servicio, no con una constraint SQL — mismo criterio ya usado en `SavingsGoalsService` (constitution, "las reglas de negocio se comprueban en el servicio").
3. Los datos que ya existan en producción bajo el modelo de spec 018 (tabla `bank_account_entries`) se migran automáticamente a las cuentas y saldos nuevos en la propia migración de base de datos, sin perder ninguna entrada — no es una tabla nueva sin usar, ya se desplegó con spec 018.
