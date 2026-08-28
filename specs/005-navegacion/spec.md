# Spec 005 — Navegación de la app

**Estado:** Aprobado
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** feedback directo de Diego probando la app en local — comprobado en el código: ninguna página autenticada salvo `HomePage` tiene forma de volver (ni `CategoriesPage`, ni `MovementsPage`, ni `DashboardPage`, ni `ImportPage`, ni `GoalsPage`), y el botón de "Cerrar sesión" solo existe en `HomePage`.

## 1. Por qué

Hasta ahora cada página nueva se ha ido añadiendo con sus propios enlaces sueltos (`HomePage` enlaza a todas las secciones, pero ninguna sección enlaza de vuelta). Con 5 secciones ya en la app (categorías, movimientos, dashboard, importación, objetivos y presupuestos) más perfil y sesiones, navegar sin un menú persistente ya no funciona: una vez dentro de una sección, la única forma de moverse es el botón "atrás" del navegador o editar la URL a mano — y no hay ninguna forma de cerrar sesión salvo volviendo primero a la Home.

## 2. Historias de usuario

**H1 — Moverme entre secciones sin quedarme atrapado**

Como usuario autenticado, quiero tener siempre visible una forma de ir a cualquier sección de la app y de cerrar sesión, sin tener que volver primero a la página de inicio, para no depender del botón "atrás" del navegador.

- Criterio de aceptación 1: en todas las páginas autenticadas (Categorías, Movimientos, Dashboard, Importar Excel, Objetivos y presupuestos, Perfil, Dispositivos y sesiones, y la propia Home), hay un menú de navegación lateral siempre presente con enlaces a las 7 secciones, a "Inicio" y a "Cerrar sesión".
- Criterio de aceptación 2: el enlace de la sección en la que ya estoy se distingue visualmente de los demás (para saber "dónde estoy"), sin necesidad de un breadcrumb aparte.
- Criterio de aceptación 3: el menú lateral se puede plegar y desplegar con un botón, para quien prefiera más espacio de pantalla.
- Criterio de aceptación 4: en las páginas sin sesión (login, registro, recuperar contraseña, verificar email...) no aparece el menú lateral — no hay nada a lo que navegar todavía.

**H2 — Home deja de ser el único punto de navegación**

Como usuario autenticado, quiero que la página de inicio ya no dependa de una lista de enlaces para moverme por la app (eso ya lo cubre el menú lateral de H1), para no tener dos listados de navegación que puedan quedar desincronizados según se añadan páginas nuevas.

- Criterio de aceptación 1: `HomePage` deja de mostrar el listado de enlaces a secciones; conserva el saludo, el aviso de cuenta sin verificar (H2 criterio 3, spec 001) y el botón de cerrar sesión pasa a vivir en el menú lateral (ya cubierto por H1).
- Criterio de aceptación 2: los enlaces de "Crear cuenta"/"Iniciar sesión" para quien no tiene sesión se mantienen tal cual en Home (no hay menú lateral sin sesión, ver H1 criterio 4).

## 3. Decisión sobre el "botón de volver atrás" pedido

Diego pidió explícitamente, además del menú lateral, "un botón de volver atrás" para cuando se navega a una categoría. Interpretación propuesta: con el menú lateral de H1 siempre presente en todas las páginas, ya se puede ir a cualquier sección (incluida la Home/Dashboard) desde cualquier otra sin depender del botón "atrás" del navegador — que era el problema real descrito. No se añade, además, un botón de "atrás" literal (tipo `history.back()`) independiente del menú, porque hoy ninguna página tiene navegación interna en varios niveles (todas son secciones de nivel único, alcanzables directamente desde el menú) — un botón de "atrás" no tendría a dónde volver que el menú no cubra ya. Si al usar la app esto no resulta suficiente, se ajusta en una spec futura.

## 4. Fuera de alcance de esta spec

- **Breadcrumbs** — con secciones de un único nivel (sin sub-páginas dentro de cada sección), un breadcrumb no aporta nada que el ítem resaltado del menú (H1 criterio 2) no cubra ya.
- **Menú responsive/adaptado a móvil** — la app no se ha diseñado para móvil en ninguna spec anterior; el comportamiento en pantallas pequeñas queda para cuando se aborde el soporte móvil en general, si se prioriza.
- **Personalización del menú** (reordenar secciones, ocultar las que no se usan) — todas las secciones son visibles siempre, sin configuración por usuario.
- **Recordar si el menú estaba plegado o desplegado entre sesiones** (por ejemplo, en `localStorage`) — el estado se mantiene mientras se navega dentro de la app (no se resetea al cambiar de página), pero vuelve al estado por defecto (desplegado) al recargar la página o volver a entrar.

## 5. Decisiones

1. **Los enlaces de `HomePage` se sustituyen por el menú lateral**, no se mantienen ambos — decisión tomada explícitamente con Diego al arrancar esta spec, para no mantener dos listados de navegación.
2. **El menú lateral es plegable** (con botón de mostrar/ocultar), no siempre fijo — decisión tomada explícitamente con Diego, frente a la alternativa más simple de un menú siempre visible sin poder ocultarlo.

---
**Aprobada por Diego.** Siguiente paso: `plan.md` con el diseño técnico (dónde vive el componente de layout, qué librería/CSS si hace falta alguna, cómo se resalta la sección activa).
