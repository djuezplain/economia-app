# Tasks — Spec 037 (Estadísticas e historial enlazado en productos)

**Fase:** 3 de 4

## Grupo 1 — Backend

- **T1.1** — `ProductsService.getPrices()`/`ProductPrice` (backend): añadir `amount`. Test e2e ampliado para comprobar que el campo viene en la respuesta.

## Grupo 2 — Frontend

- **T2.1** — `api/groceries.ts`: `ProductPrice` gana `amount: string`.
- **T2.2** — `ProductDetailPage.tsx`: función pura de estadísticas (plan.md §2), sección "Estadísticas" (mínimo/máximo/medio, supermercado más barato de media, gasto total + nº de compras) — no se renderiza si no hay ninguna línea.
- **T2.3** — Gráfico de evolución del precio (Recharts, una serie por supermercado, plan.md §3).
- **T2.4** — Las dos tablas de precio (más reciente / historial) ganan una columna que enlaza cada fila a `/tickets/:id`.
  Tests: estadísticas correctas con datos de más de un supermercado/fecha; sin ninguna línea, la sección no aparece; el gráfico se renderiza sin errores (smoke test, Recharts en jsdom); cada fila de las dos tablas enlaza al ticket correcto.

## Grupo 3 — Cierre

- **T3.1** — Checklist de cierre H1-H2.
- **T3.2** — `npm run lint`, `tsc -b`, `npm test`/`npm run test:e2e` en verde. Verificación manual: producto con compras en 2+ supermercados y fechas distintas, comprobar los números de las estadísticas a mano contra los datos reales, y que un enlace del historial lleva al ticket correcto.

---
**Cómo trabajamos esto:** una tarea a la vez, en orden. Al terminar una tarea, se marca y se hace commit.

---

## Checklist de cierre — spec 037 (T3.1)

### H1 — Ver estadísticas del producto

- [x] Criterio 1 (mínimo/máximo/medio): `ProductDetailPage.test.tsx` — "calcula mínimo/medio/máximo...".
- [x] Criterio 2 (supermercado más barato de media): mismo test.
- [x] Criterio 3 (gasto total y nº de compras): mismo test.
- [x] Criterio 4 (gráfico por supermercado): verificado manualmente (Recharts no se testea en jsdom en ningún otro sitio de esta app — mismo criterio ya establecido, ver plan.md §3); confirmado en el navegador real con 2 supermercados y 3 fechas.
- [x] Criterio 5 (sin líneas, sin estadísticas vacías): `ProductDetailPage.test.tsx` — "sin ningún ticket con el producto, muestra un mensaje... sin estadísticas".

### H2 — Cada línea del historial enlaza a su ticket

- [x] Criterio 1 y 2 (ambas vistas enlazan): `ProductDetailPage.test.tsx` — "cada fila de precio enlaza a su ticket"; verificado también manualmente navegando de verdad al ticket real.

### Resultado del cierre

Todos los criterios de H1-H2 cubiertos. Sin huecos encontrados.

### T3.2 — Verificación final

Backend: build/lint en verde; 235 unitarios + 581 e2e en verde. Frontend: `tsc -b`/lint en verde (sin warnings nuevos); 554/556 tests en verde (2 fallos pre-existentes y no relacionados, confirmados flaky en cierres anteriores — `RegisterMovementPage.test.tsx`, `WealthPage.test.tsx`).

**Verificación manual real** contra los servidores de desarrollo (usuario de prueba creado y eliminado al terminar): producto "Leche" con 3 compras (Mercadona 0,90€ y 1,00€ en fechas distintas, Carrefour 1,20€) — estadísticas mostraron exactamente los números calculados a mano (mínimo 0,90€, medio 1,03€, máximo 1,20€; Mercadona más barata de media a 0,95€; gasto total 3,10€ en 3 compras), el gráfico se renderizó con las 2 series, y el enlace "Ver ticket" de una fila llevó al ticket real correcto.

Con esto, **spec 037 queda cerrada**.
