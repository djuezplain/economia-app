# Spec 045 — Rediseño oscuro tipo panel de observabilidad

**Estado:** Implementada (decidida directamente con Diego en conversación, a partir de una captura de referencia)
**Fase:** 4 de 4 (Spec → Plan → Tasks → Implementación)
**Sustituye a:** la paleta clara por defecto y la barra de navegación superior de los rediseños anteriores (specs 008/010 y peticiones posteriores).

## 0. Qué cambia

Diego aporta una captura de referencia (panel oscuro de una herramienta de observabilidad: menú lateral fijo, tarjetas KPI con mini-gráfico, tarjetas sobrias con borde fino, acento naranja, gráficos limpios sin puntos ni rejilla densa) y pide que la app se parezca a ella en estilo, colores, distribución y formato de gráficos. Es un cambio **solo de presentación**: no cambia ningún dato, endpoint ni cálculo financiero existente.

Decisiones tomadas con Diego antes de empezar:

1. **Solo tema oscuro.** La app deja de seguir la preferencia clara/oscura del sistema.
2. **Acento naranja**, como la captura. Verde/rojo quedan para ingresos/gastos, ganancias/pérdidas y estados; morado y azul para series de gráficos.
3. **Menú lateral fijo a la izquierda** (vuelve a ser lateral, en vez de la barra superior), plegable a solo iconos. En móvil se mantiene el cajón y la barra inferior de siempre.

## 1. Historias de usuario

**H1 — Aspecto oscuro coherente en toda la app**

- Criterio 1: fondo casi negro, tarjetas un punto más claras con borde fino y radios moderados (no "pill"), texto claro y texto secundario gris.
- Criterio 2: tipografía sans-serif neutra (Inter) y números tabulares en importes, para que las cifras se alineen.
- Criterio 3: acento naranja para el elemento activo de navegación, botones primarios, foco y pestañas activas.
- Criterio 4: se mantiene la semántica de color ya existente — verde = ingreso/ganancia, rojo = gasto/pérdida, colores fijos por categoría de patrimonio (spec 028).

**H2 — Menú lateral fijo**

- Criterio 1: en escritorio el menú ocupa una columna fija a la izquierda, a toda la altura, con la marca arriba, una entrada por sección (icono + texto) y "Cerrar sesión" al final.
- Criterio 2: la entrada activa se resalta con fondo y texto en naranja.
- Criterio 3: las subsecciones se despliegan debajo de su entrada (no como menú flotante), con el mismo comportamiento ya acordado: una abierta a la vez, se cierra al elegir una subsección, al hacer clic fuera o con Escape.
- Criterio 4: "Ocultar menú" sigue plegándolo a solo iconos.
- Criterio 5: en móvil no cambia nada de comportamiento (cajón con "Abrir menú", barra inferior y botón "+").

**H3 — Tarjetas KPI en Inicio**

- Criterio 1: Balance, Ingresos y Gastos del mes se muestran como tarjetas KPI: etiqueta, cifra grande, variación respecto al mes anterior y mini-gráfico de la evolución mensual del año en curso.
- Criterio 2: la variación se muestra con flecha y en verde si es favorable, rojo si es desfavorable (para Gastos, subir es desfavorable).
- Criterio 3: si no hay mes anterior en el año en curso (enero) o el mes anterior vale 0, no se muestra la variación; si el año tiene menos de dos meses, no se muestra el mini-gráfico. Si la evolución anual no carga, las tarjetas se ven igual sin variación ni mini-gráfico.

**H4 — Gráficos con el estilo de la captura**

- Criterio 1: todos los gráficos de la app comparten estilo: rejilla solo horizontal y muy tenue, sin líneas de eje, etiquetas de eje en gris pequeño, tooltip oscuro con borde fino.
- Criterio 2: las líneas son más finas, sin puntos en cada valor (el punto aparece al pasar el ratón).
- Criterio 3: las barras tienen las esquinas superiores redondeadas.
- Criterio 4: los colores de serie salen de una paleta común (naranja, verde, morado, azul, rojo...), manteniendo los colores fijos por categoría de patrimonio.

## 2. Fuera de alcance

- Barra superior con buscador, selector de rango global y avatar de la captura (la app no tiene búsqueda global).
- Vistas nuevas tipo "timeline"/traza, paneles de detalle laterales o cualquier dato nuevo distinto de la evolución mensual ya existente (`GET /dashboard/year`).
- Tema claro.
