# Plan — Spec 016 (Secciones plegables del Dashboard)

**Fase:** 2 de 4

## 1. Alcance técnico

Solo frontend (`DashboardPage.tsx` + `index.css`) — sin cambios de backend, endpoints ni cálculos (spec.md §2).

## 2. Marcado

Cada uno de los 5 `<section>` de `DashboardPage.tsx` pasa a `<details className="dashboard-section">`, con el `<h2>` de título envuelto en `<summary>`:

```jsx
<details className="dashboard-section">
  <summary>
    <h2>Comparativa temporal</h2>
  </summary>
  {/* resto del contenido de la sección, sin cambios */}
</details>
```

- Sin atributo `open`: `<details>` empieza cerrado por defecto — cubre H1 criterio 1 y criterio 3 (cada montaje de `DashboardPage` es un árbol nuevo, así que siempre arranca minimizado, sin necesidad de resetear nada a mano).
- Cada `<details>` es independiente (no hay un único estado compartido) — cubre H1 criterio 2 (no es un acordeón exclusivo).
- H1 criterio 4 (los datos se seguen cargando igual): los `useEffect` que ya piden `getMonthSummary`/`getYearSummary`/`getComparison`/`getCategoryComparison`/`getSeasonal` no se tocan — no dependen de si el `<details>` está abierto, así que el contenido sigue llegando en segundo plano y está listo en cuanto el usuario maximiza.
- H1 criterio 5 (accesibilidad): `<details>`/`<summary>` gestionan `aria-expanded`, foco y activación por teclado (Intro/Espacio) de forma nativa — no hace falta ningún `role`/`aria-*`/`onKeyDown` propio.

## 3. Estilos (`index.css`)

Nueva regla `.dashboard-section` (nombre de clase, no hay ninguna ya con ese propósito):

- `summary` sin el marcador nativo del navegador (`list-style: none` + regla `::-webkit-details-marker` para Chrome/Safari, que no respetan `list-style` en `<summary>`), sustituido por un indicador propio (▾/▴ vía `::after`, rotado según `[open]`) — mismo criterio visual en toda la app, no el triángulo por defecto de cada navegador.
- El `<h2>` dentro de `summary` pierde su `margin` propio (ya lo pone `.dashboard-section`), y `summary` se pone en fila (`display: flex`, `cursor: pointer`) para que el indicador quede alineado a la derecha.
- Separación entre secciones (`margin-bottom`) la lleva ahora `.dashboard-section`, no el `<h1>`/`<h2>` por defecto — mismo espaciado visual que ya había entre `<section>` sueltos (vía el `margin` de sus propios `h2`/último elemento), para que este cambio no mueva nada más en la página.
- Foco visible (`:focus-visible`) en la cabecera — mismo token `--accent` que ya usa el resto de controles interactivos de la app.

## 4. Tests (`DashboardPage.test.tsx`)

No hace falta ningún test nuevo dedicado a "plegar/desplegar" en sí — es comportamiento nativo del navegador, no lógica propia que debamos verificar. Lo que sí cambia es que las secciones arrancan cerradas: todos los tests existentes que hoy interactúan con controles dentro de una sección (radios de tipo/periodo/alcance, inputs de mes/año) deben abrir esa sección primero (un click en su `<summary>`) antes de esa interacción — mismo motivo por el que `userEvent` ya rechaza clics sobre elementos no visibles en el resto de la suite. Los tests que solo comprueban texto ya renderizado sin interactuar no necesitan cambio si jsdom no oculta el contenido cerrado (a verificar al ejecutar la suite); si lo oculta, se añade el mismo `click` de apertura antes de esas aserciones.

## 5. Fuera de este plan

- No se toca ningún endpoint, DTO, servicio ni cálculo de backend.
- No se toca el menú lateral de `AppLayout` (spec.md §2, fuera de alcance).
