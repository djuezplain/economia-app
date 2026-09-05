# Spec 021 — Alias para cuentas bancarias

**Estado:** Aprobada (decidida directamente con Diego en conversación)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Una cuenta bancaria (spec 019) se identifica hoy solo por Banco + Número de Cuenta. Esta spec añade un **alias opcional** (apodo de texto libre, p. ej. "Nómina" o "Ahorro emergencia") para poder identificarla de un vistazo sin tener que leer el número de cuenta completo.

## 1. Historias de usuario

**H1 — Ponerle un alias a una cuenta bancaria**

Como usuario quiero poder añadir un alias a mis cuentas bancarias, para identificarlas más fácilmente que solo por banco + número de cuenta.

- Criterio 1: al crear una cuenta se puede indicar, opcionalmente, un alias de texto libre.
- Criterio 2: el alias de una cuenta ya creada se puede añadir, editar o quitar en cualquier momento.
- Criterio 3: si una cuenta tiene alias, se muestra de forma destacada en la lista de cuentas (en vez de, o además de, banco + número de cuenta); si no tiene alias, se sigue mostrando banco + número de cuenta como hasta ahora.
- Criterio 4: el alias no participa en la comprobación de "misma cuenta dos veces" (H1 criterio 2 de spec 019, banco + número de cuenta) — dos cuentas distintas pueden tener el mismo alias, o ninguno.

## 2. Fuera de alcance

- Alias para "Acciones" (spec 020) — no forma parte de esta spec.
- Cualquier validación de unicidad sobre el alias (no se impide repetirlo entre cuentas, ni entre una cuenta y otra).

## 3. Decisiones tomadas con Diego antes de escribir el plan

1. El alias es opcional y de texto libre — sin restricciones adicionales de formato.
2. No afecta a la regla de unicidad existente (banco + número de cuenta) — es un campo puramente descriptivo.
