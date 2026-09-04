# Spec 017 — Iconos en las secciones plegables del Dashboard

**Estado:** Aprobada (decidida directamente con Diego en conversación, como continuación de spec 016)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

Spec 016 convirtió las 5 secciones del Dashboard en bloques plegables (`<details>`/`<summary>`), minimizados por defecto. Esta spec añade dos elementos visuales a esa misma cabecera:

1. Un icono propio de cada sección, para identificarla de un vistazo incluso minimizada.
2. Un icono de "maximizar"/"minimizar" que cambia según el estado — no solo el título, la propia cabecera indica con un icono si al pulsarla se va a abrir o a cerrar.

## 1. Historia de usuario

**H1 — Reconocer e interactuar con cada sección por su icono**

Como usuario quiero que cada sección del Dashboard tenga un icono identificativo junto a su título, y que la cabecera muestre un icono distinto según si la sección está minimizada (icono de maximizar) o maximizada (icono de minimizar), para reconocer cada sección más rápido y saber de un vistazo qué va a pasar al pulsarla.

- Criterio 1: las 5 secciones (Comparativa temporal, Categorías por periodo, Análisis estacional, Resumen del mes, Vista anual) llevan un icono propio junto a su título, siempre visible (minimizada o maximizada) — mismo criterio de icono-emoji ya usado en categorías (spec 007) y estaciones (spec 014).
- Criterio 2: mientras la sección está minimizada, la cabecera muestra un icono de "maximizar"; en cuanto se maximiza, ese icono cambia a uno de "minimizar" — es el propio icono el que cambia (no una simple rotación del mismo símbolo).
- Criterio 3: sin cambios de comportamiento respecto a spec 016 — sigue arrancando todo minimizado en cada entrada, sigue sin ser un acordeón exclusivo, sigue sin tocar la carga de datos.

## 2. Fuera de alcance

- Cualquier cambio a los datos, cálculos o endpoints — es un cambio puramente visual, igual que spec 016.
- Iconos personalizables por el usuario (a diferencia de los de categoría, spec 007, estos son fijos por sección).

## 3. Decisiones tomadas con Diego antes de implementar

1. Iconos por sección (emoji, mismo criterio ya usado en el resto de la app): ⚖️ Comparativa temporal, 🗂️ Categorías por periodo, 🌦️ Análisis estacional, 🗓️ Resumen del mes, 📈 Vista anual — elegidos por Claude sin que Diego pidiera unos en concreto, evitando repetir un emoji ya usado dentro de esa misma sección (p. ej. Análisis estacional ya usa ❄️🌸☀️🍂 para cada estación).
2. Icono de maximizar/minimizar: "+" minimizado / "−" maximizado — glifos simples y universales, distintos del icono de cada sección (que va delante del título) para no confundir ambos roles.
