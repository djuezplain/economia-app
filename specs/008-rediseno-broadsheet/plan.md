# Plan — Spec 008 (Rediseño visual "Broadsheet")

**Estado:** Aprobado
**Fase:** 2 de 4 (Spec → Plan → Tasks → Implementación)

Diseño técnico para `spec.md`. Todos los valores de color/tipografía son una aproximación visual del mockup (inspeccionado por captura de pantalla, ver `spec.md §5`) — se ajustarán con Diego tras ver la app real si algo no encaja.

## §1. Tokens de color y tipografía (H1)

Se sustituyen en `:root` de `index.css`, manteniendo el mismo nombre de variable donde ya existe uno (para no tocar cada sitio que la usa) y añadiendo las que faltan:

```css
:root {
  --text: #6c6a66;       /* antes #6b6375 — gris neutro cálido en vez de grisáceo-violeta */
  --text-h: #1c1a17;     /* antes #08060d — casi negro cálido, para titulares serif */
  --bg: #f2f0ec;         /* antes #fff — fondo cálido del mockup */
  --border: #e2ded7;     /* antes #e5e4e7 — ajustado al mismo tono cálido */
  --code-bg: #eae7e1;    /* antes #f4f3ec */
  --accent: #3b6e86;     /* antes #aa3bff — azul-verdoso apagado (etiquetas, ingresos, activo) */
  --accent-bg: rgba(59, 110, 134, 0.1);
  --accent-border: rgba(59, 110, 134, 0.5);
  --card-bg: #e9e6e1;    /* nueva — fondo de tarjeta (H3), distinto de --bg */

  --heading: Georgia, 'Times New Roman', Times, serif; /* antes = --sans */
  /* --sans, --mono, --status-*, --shadow, --social-bg: sin cambios */
}
```

- **Modo oscuro** (`@media (prefers-color-scheme: dark)`): no hay mockup oscuro. Se deriva con el mismo criterio que ya usa el bloque oscuro actual (invertir luminosidad, mantener el matiz del acento): `--text: #a8a49c`, `--text-h: #f0eee9`, `--bg: #1a1917`, `--border: #35322c`, `--code-bg: #232019`, `--card-bg: #26241f`, `--accent: #7fb3c9`, `--accent-bg: rgba(127,179,201,0.15)`, `--accent-border: rgba(127,179,201,0.5)`. `--status-*` no cambian (ya son independientes del resto de la paleta).
- **`--heading`** deja de ser igual a `--sans`: gana su propia familia serif. `h1`/`h2` (`index.css` ya los selecciona por `font-family: var(--heading)`) pasan a `font-weight: 700` (antes 500) para el peso "serif negrita" del mockup — único cambio de regla, no de estructura.
- Fuente serif exacta: no se puede leer del mockup (iframe de origen cruzado). Se usa una pila de serif de sistema (`Georgia`) en vez de cargar una tipografía web nueva — evita añadir una dependencia de red/Google Fonts que nadie ha pedido explícitamente. Si Diego quiere una serif concreta más adelante, es un cambio de una sola línea (valor de `--heading`), no de spec.
- Los colores de las tarjetas de `DashboardPage` (`COLOR_INCOME`/`COLOR_EXPENSE`/`COLOR_SAVINGS` en Recharts) y los `--status-*` de spec 007 **no se tocan** — son paletas categóricas ya validadas, fuera del alcance de esta spec (`spec.md §3`).

## §2. Layout a ancho completo (H2)

`#root` pierde el ancho fijo y el marco:

```css
#root {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* se quitan: width: 1126px; margin: 0 auto; text-align: center; border-inline */
}
```

`text-align: center` se quitaba de forma global — algunas páginas quizá dependían de centrado heredado. Búsqueda hecha en el frontend: ninguna regla ni test asume texto centrado por herencia (todo el contenido real ya vive dentro de `#app-shell`, que ya fuerza `text-align: left`, o de páginas previas al login como `LoginPage`/`RegisterPage`, que no tienen `<h1>` centrado como requisito). Se revisa visualmente tras implementar (T de verificación manual en `tasks.md`).

`#app-sidebar` pierde el borde vertical (el mockup no tiene línea divisoria, solo espacio):

```css
#app-sidebar {
  flex-shrink: 0;
  width: 220px;
  padding: 24px 20px;
  /* se quita: border-inline-end */
}

#app-content {
  flex: 1;
  min-width: 0;
  padding: 32px 40px;
}
```

Ancho de lectura acotado solo donde ya se acota hoy (formularios, criterio H2.2) — no en tablas/listados, que sí aprovechan el ancho completo:

```css
main form {
  max-width: 640px;
  /* resto de la regla sin cambios */
}
```

## §3. Página de Inicio (H3)

Reescritura de `HomePage.tsx`. Sin endpoints nuevos — reutiliza tres llamadas que ya existen:

- `getMonthSummary()` (`api/dashboard.ts`, spec 002 H4) → `income`, `expense`, y balance = `income - expense` (nuevo cálculo puramente de presentación, resta de dos totales ya calculados por el backend — no es lógica financiera nueva, ver `constitution.md §2`, así que se hace en el componente igual que ya hace `goals-shared.ts` con `parseFloat` para pintar, no para persistir).
- `getMonthProgress()` (`api/goals-progress.ts`, spec 004 H3) → `savingsGoal` (puede ser `null` si no hay objetivo configurado) para el criterio H3.2.
- `listTransactions({ limit: 5 })` (`api/transactions.ts`, spec 002 H1) → ya ordenado por fecha descendente en el backend (`transactions.service.ts`, `orderBy: [desc(date), desc(createdAt)]`), así que sin parámetros de orden adicionales se obtienen los últimos 5 tal cual pide el criterio H3.3.

Formato de importe: el resto de la app hoy muestra los números tal cual llegan del backend (`"648.20"`, sin símbolo ni coma, ver `DashboardPage.tsx`) — no hay ningún formateador de moneda en el proyecto todavía. Para igualar el mockup (`"648,20 €"`) se añade un helper nuevo, solo usado en Inicio:

```ts
// pages/home-shared.ts
export function formatCurrency(amount: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(parseFloat(amount));
}
```

Fijo a `es-ES`/`EUR` (no lee el `currency`/`locale` del perfil del usuario, spec 001) porque ya es el idioma fijo de toda la interfaz (ningún otro texto de la app se traduce hoy) y porque `useAuth().user` no expone esos campos (son de `UserProfile`, un fetch aparte que HomePage no hace hoy) — traerlos solo para esto sería una llamada de red nueva para un dato cosmético. Aplicar este mismo formateo al resto de páginas (Dashboard, Goals, Movements) queda fuera de esta spec (`spec.md §3`): se deja el helper exportado en `home-shared.ts` para que una spec futura lo reutilice si Diego decide extenderlo.

Estructura de la página (semántica, sin clases salvo las ya justificadas de §5):

```html
<main>
  <h1>App de Gestión de Economía Personal</h1>
  <p>Agosto 2026 · Sesión iniciada como {user.name}.</p>
  {/* aviso de verificación pendiente: igual que hoy, sin cambios */}

  {/* H3 criterio 6: estado vacío si income === '0.00' && expense === '0.00' */}
  <p>Sin movimientos registrados este mes.</p>

  {/* o, si hay datos: */}
  <div id="home-summary">
    <div>
      <p>Balance del mes</p>
      <p>{formatCurrency(balance)}</p>
      <p>{savingsGoal ? `Sobre un objetivo de ${formatCurrency(savingsGoal.targetAmount)}` : 'Sin objetivo de ahorro configurado'}</p>
    </div>
    <div>
      <p>Ingresos</p>
      <p>{formatCurrency(monthSummary.income)}</p>
      <p>{/* fuentes principales: fuera de alcance calcularlas, se omite o se deja genérico */}</p>
    </div>
    <div>
      <p>Gastos</p>
      <p>{formatCurrency(monthSummary.expense)}</p>
      <p>{transactionsResult.totalItems} movimientos</p>
    </div>
  </div>

  <h2>Últimos movimientos</h2>
  <ul id="home-recent-list">
    {items.map((t) => (
      <li key={t.id}>
        <span className={`dot${t.type === 'INCOME' ? ' dot-accent' : ''}`} aria-hidden="true" />
        <span>
          <strong>{t.concept}</strong>
          <br />
          <small>{t.merchant ?? categoryName(categories, t.categoryId)} · {formatDate(t.date)}</small>
        </span>
        <span>{t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}</span>
      </li>
    ))}
  </ul>
  <p><Link to="/movements">Ver todos los movimientos</Link></p>
</main>
```

- La caja de "Ingresos" del mockup muestra "Nómina · Freelance" (las fuentes) como tercera línea — eso exigiría agrupar por concepto/comercio, un cálculo que hoy no expone ningún endpoint. Se deja esa tercera línea vacía/genérica en vez de inventar un cálculo nuevo (`spec.md §3`, "no calcula datos nuevos"); si Diego lo quiere de verdad, es un criterio para una spec futura sobre el propio Dashboard.
- `#home-recent-list li` necesita layout de fila (icono + texto + importe a la derecha) — como esto solo aplica a esta lista concreta de Inicio (no a los `<ul><li>` genéricos del resto de la app, que son líneas de texto simples, spec 007 H4), se añade una regla acotada por `id`, no se toca la regla genérica `main ul li`:

```css
#home-recent-list li {
  display: flex;
  align-items: center;
  gap: 12px;
}
#home-recent-list li > span:last-child {
  margin-inline-start: auto;
  font-weight: 600;
}
```

- Criterio H3.4 ("enlaza o es coherente con Movimientos"): se resuelve con el enlace `Ver todos los movimientos` al final de la lista — no se añade un enlace por fila (no hay página de detalle de un movimiento suelto hoy, solo edición vía `/movements/register/:id`, y enlazar ahí desde Inicio se sale del criterio, que solo pide coherencia, no navegación por fila).
- Criterio H3.6 (estado vacío): mismo criterio que spec 007 H2 en `DashboardPage` — comprobar `income === '0.00' && expense === '0.00'` antes de pintar tarjetas/lista.

## §4. Marca "Ledger" (H4)

En `AppLayout.tsx`, dentro de `#app-sidebar`, antes del botón de plegar:

```tsx
<p id="app-sidebar-brand">Ledger</p>
```

```css
#app-sidebar-brand {
  font-family: var(--heading);
  font-weight: 700;
  font-size: 22px;
  color: var(--text-h);
  margin: 0 0 20px;
}
```

Siempre visible, plegado o no (criterio H4.1) — no depende de `isCollapsed`, a diferencia del texto de los enlaces. No se toca `document.title` ni metadatos (criterio H4.2, `index.html` fuera de alcance).

## §5. Menú lateral: punto de color en vez de iconos (H5)

Se retiran los imports de `lucide-react` y el campo `Icon` de `NAV_ITEMS`:

```tsx
const NAV_ITEMS = [
  { to: '/', end: true, label: 'Inicio' },
  { to: '/categories', end: false, label: 'Categorías' },
  // ...resto igual, sin `Icon`
] as const;
```

```tsx
<NavLink to={to} end={end} {...collapsedLabel(label)}>
  <span className="dot" aria-hidden="true" /> <span className={isCollapsed ? 'sr-only' : undefined}>{label}</span>
</NavLink>
```

```css
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}
.dot-accent,
#app-sidebar a[aria-current='page'] .dot {
  background: var(--accent);
}
```

- **Tercera y cuarta excepción a "sin className"** (`spec.md §5`, junto a `.progress-bar` y `.sr-only` de spec 007): `.dot`/`.dot-accent` son un elemento reutilizable instanciado varias veces por página (una por enlace del menú, y de nuevo en la lista de Inicio, H3) — mismo motivo exacto que `ProgressBar`. Se documenta en el propio código, igual que las anteriores.
- El color de "activo" lo decide el CSS por descendencia de `a[aria-current='page']` (mismo patrón que el texto en negrita ya existente), no una prop de React nueva — así el punto de Inicio y el de las filas de movimientos comparten la misma clase `.dot`/`.dot-accent` sin lógica duplicada.
- **Criterio H5.2** (plegado): se mantiene `aria-label`/`title` con el nombre completo (ya resuelto por `collapsedLabel()`, sin cambios) — el punto no aporta ni quita nada a la accesibilidad, es decorativo (`aria-hidden`) igual que antes lo era el icono.
- **Criterio H5.3**: se retira `lucide-react` de `frontend/package.json` y del lockfile raíz — confirmado que `AppLayout.tsx` es el único fichero del frontend que la importa.
- Tests de `AppLayout.test.tsx` a actualizar: el test "cada uno con su icono" deja de buscar `<svg>` y pasa a comprobar `.dot`; el resto (accesible-name-persiste-plegado) no cambia de intención, solo dejará de encontrar `<svg>` y buscará el `<span className="dot">`.

## §6. Casos de prueba

- `formatCurrency`: negativos, cero, decimales de un dígito (`"5.4"` → `"5,40 €"`), string vacía/no numérica no se pasa nunca (viene siempre de la API).
- `HomePage`: sin sesión (igual que hoy); con sesión y datos → 3 tarjetas + 5 movimientos; con sesión y mes vacío → mensaje de estado vacío, sin tarjetas ni lista; sin objetivo de ahorro configurado (`savingsGoal: null`) → tarjeta de balance sin la referencia al objetivo, sin romper; error de alguno de los 3 fetches → no bloquea el resto (mismo patrón `try/catch` por endpoint que ya usa `DashboardPage`).
- `AppLayout`: el punto de color marca la sección activa (por clase `.dot-accent`, no por `<svg>`); con menú plegado, el punto sigue presente y el nombre accesible se mantiene (ya cubierto, solo cambia el detalle de implementación del test).
- Verificación manual (no automatizable): capturas de pantalla de `/`, `/dashboard`, `/goals`, `/movements` tras el cambio de tokens, para confirmar que ninguna página quedó ilegible por el cambio de `--bg`/`--text`/ancho de `#root` (regla de oro de H1 criterio 3 y H2 criterio 2).

## §7. Fuera de alcance (confirmado, sin cambios respecto a `spec.md §3`)

Categorías, Movimientos, Dashboard, Importar Excel, Objetivos y presupuestos, Perfil y Dispositivos y sesiones no cambian de estructura ni de formato de importes en esta spec — solo heredan `--bg`/`--text`/`--text-h`/`--accent`/`--heading`/layout de ancho completo por ser variables globales y por el cambio de `#root`/`#app-sidebar`/`#app-content`. Cualquier inconsistencia visual que quede en esas páginas tras heredar los tokens (p. ej. números sin formatear conviviendo con Inicio ya formateado) es esperada y se deja para una spec futura si Diego la pide.

---
**Pendiente de aprobación por Diego.** Siguiente paso: `tasks.md`.
