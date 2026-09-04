# Spec 016 — Secciones plegables del Dashboard

**Estado:** Aprobada (decidida directamente con Diego en conversación — el Dashboard ya tiene 5 secciones, specs 002/013/014/015, y sigue creciendo)
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)

## 0. Qué cambia

El Dashboard (specs 002, 013, 014, 015) ha ido acumulando secciones — Comparativa temporal, Categorías por periodo, Análisis estacional, Resumen del mes, Vista anual — hasta el punto de que entrar en la página obliga a hacer scroll por mucho contenido antes de llegar a lo que se quiere ver. Esta spec convierte cada sección en un bloque plegable: minimizado al entrar, con su título siempre visible como cabecera para poder maximizarlo.

## 1. Historia de usuario

**H1 — Ver el Dashboard como una lista de secciones plegadas**

Como usuario quiero que, al entrar en el Dashboard, cada sección aparezca minimizada (solo su título visible) en vez de todo su contenido desplegado, para poder ver de un vistazo qué secciones hay y abrir solo la que me interesa en cada momento.

- Criterio 1: las 5 secciones actuales del Dashboard (Comparativa temporal, Categorías por periodo, Análisis estacional, Resumen del mes, Vista anual) se comportan igual: minimizadas por defecto, con su título como cabecera clicable.
- Criterio 2: pulsar el título de una sección la maximiza (muestra su contenido); pulsarlo de nuevo la vuelve a minimizar. Cualquier número de secciones puede estar maximizado a la vez (no es un acordeón exclusivo — abrir una no cierra las demás).
- Criterio 3: cada vez que se entra en el Dashboard (carga o navegación nueva a la página) todas las secciones vuelven a empezar minimizadas — no se recuerda cuáles estaban abiertas.
- Criterio 4: los datos de cada sección se siguen cargando igual que hoy (en segundo plano, aunque esté minimizada) — minimizar es solo un cambio visual, no deja de pedir datos ni los descarta; así, al maximizar, el contenido ya está listo sin esperar a una carga nueva.
- Criterio 5: la cabecera de cada sección es accesible por teclado (foco, Intro/Espacio para maximizar/minimizar) y expone su estado a lectores de pantalla — mismo criterio de accesibilidad que ya se exige en el resto de la app (constitution, controles interactivos nativos en vez de reimplementados a mano).

## 2. Fuera de alcance

- Recordar entre sesiones (o entre navegaciones) qué secciones estaban abiertas — criterio 3 lo fija explícitamente como "siempre minimizadas al entrar".
- Reordenar las secciones o permitir moverlas.
- Cualquier cambio a los datos, cálculos o endpoints de las secciones existentes — es un cambio puramente de presentación.
- Un menú de navegación aparte (p. ej. saltar a una sección desde el menú lateral de `AppLayout`) — la propia cabecera de cada sección, siempre visible, ya cumple ese papel dentro de la página.

## 3. Decisiones tomadas con Diego antes de implementar

1. Se implementa con `<details>`/`<summary>` nativos del navegador, no con un acordeón hecho a mano — accesibilidad de teclado y lector de pantalla correcta de fábrica, consistente con el resto de la app (controles nativos en vez de reimplementados, ver decisión ya tomada en spec 001 sobre el panel de confirmación de borrado de cuenta).
2. Todas las secciones minimizadas por defecto (no solo las secundarias) — el propio Diego señala que la página "está creciendo mucho", así que el punto de partida debe ser el más compacto posible.
