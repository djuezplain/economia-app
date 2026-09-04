# Plan — Spec 017 (Iconos en las secciones plegables)

**Fase:** 2 de 4

## 1. Alcance técnico

Solo frontend (`DashboardPage.tsx` + `index.css`), sobre lo ya construido en spec 016 — sin backend.

## 2. Marcado

Cada `<h2>` dentro del `<summary>` de las 5 secciones lleva el emoji de la decisión 1 como prefijo de su propio texto (`<h2>⚖️ Comparativa temporal</h2>`), igual que ya hacen las tarjetas de estación (spec 014, `SEASON_ICONS`) — sin `aria-hidden` ni `<span>` propio, mismo criterio ya aceptado en ese sitio (el emoji forma parte del texto visible, sin tratamiento especial de accesibilidad).

## 3. Estilos (`index.css`)

`.dashboard-section > summary::after` (el indicador de maximizar/minimizar que introdujo spec 016 con `content: '▾'` + `transform: rotate()`) pasa a dos reglas con `content` distinto en vez de una rotación:

- `.dashboard-section > summary::after { content: '+'; … }` — minimizada.
- `.dashboard-section[open] > summary::after { content: '−'; }` — maximizada.

Se retira la `transition: transform` (ya no aplica, el cambio es de contenido, no de orientación).

## 4. Tests (`DashboardPage.test.tsx`)

Las 3 consultas `screen.getByRole('heading', { name: 'Comparativa temporal' | 'Análisis estacional' | 'Categorías por periodo' })` (usadas para acotar cada sección con `within`) pasan a un matcher por expresión regular (`/Comparativa temporal/`, etc.) — el nombre accesible del `<h2>` ahora incluye el emoji delante, y una comparación exacta por string ya no encuentra el elemento.

## 5. Fuera de este plan

- No se toca ningún endpoint, DTO, servicio ni cálculo de backend.
- No se toca el comportamiento de plegado en sí (ya cubierto por spec 016).
