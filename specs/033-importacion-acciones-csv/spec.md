# Spec 033 — Importación de posiciones de acciones desde CSV (Investing.com)

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** el fichero real `Actual_Holdings_10092026.csv`, exportado por Diego desde Investing.com ("Resumen de posiciones"), revisado directamente columna por columna y fila por fila — no solo a partir de una descripción del formato.

## 0. Qué cambia

Diego lleva parte de su cartera de acciones registrada en Investing.com desde hace años (primeras posiciones cerradas en 2015) y no quiere volver a teclear a mano cada compra y cada venta histórica en "Acciones" (spec 020, con las ventas de spec 031). Investing.com permite exportar el estado completo de una cartera a CSV.

Esta spec añade una importación dedicada de ese CSV a "Acciones": crea las posiciones (acción = Banco Custodia + Acción, spec 020 H1) que falten, y les añade su historial de compras (spec 020 H2), ventas (spec 031) y una valoración con el precio actual (spec 020 H3) — de forma aditiva, igual que el resto de importaciones ya existentes en la app (spec 003, spec 032 H2), nunca borrando ni pisando nada ya registrado a mano.

A diferencia de spec 032 (que importa un JSON generado por la propia app, con ids), este CSV es un fichero externo sin ids ni referencia a qué ya existe en la aplicación — el emparejamiento con lo ya registrado se hace por contenido (sección 4).

## 1. Estructura real del fichero (verificada)

El CSV de Investing.com trae tres secciones dentro del mismo fichero, separadas por líneas en blanco, cada una con su propia cabecera:

1. **"Resumen de posiciones"** — una fila por posición abierta hoy, con `Nombre`, `Símbolo`, `Mercado`, `Cantidad` (total), `Precio medio`, **`Precio actual`**. Es un agregado (no lleva histórico de compras individuales) — solo se usa para sacar el precio actual de cada posición abierta.
2. **"Posiciones abiertas"** — una fila por cada compra (lote) que compone las posiciones de la sección 1: `Nombre`, `Símbolo`, `Mercado`, `Fecha apertura`, `Cantidad`, `Precio entrada`.
3. **"Posiciones cerradas"** — una fila por cada lote ya vendido, incluso de acciones que hoy no tienen ninguna posición abierta (p. ej. Amadeus, Cellnex, Inditex...): `Nombre`, `Símbolo`, `Mercado`, `F. apertura`, `Cantidad`, `Precio entrada`, `Fecha cierre`, `Precio cierre`.

Números en formato español (`.` miles, `,` decimales), todo entre comillas. Verificado en el fichero real: 17 posiciones abiertas (agregadas) formadas por 60 lotes de compra, y 63 lotes ya cerrados (vendidos) de 33 acciones distintas en total.

## 2. Historias de usuario

**H1 — Subir el CSV y ver qué se va a importar antes de confirmar**

Como usuario quiero subir el CSV exportado de Investing.com y ver un resumen de lo que se importaría, antes de que se toque ningún dato real — mismo criterio que ya usa el resto de importaciones de la app (spec 003 H1, spec 032 H2 criterio 4).

- Criterio 1: la vista previa muestra, por cada acción del fichero: si es una posición nueva o ya existente en la app, y cuántas compras/ventas/valoraciones nuevas traería frente a cuántas ya existen y se omitirían (sección 4).
- Criterio 2: no se escribe nada en la base de datos hasta confirmar explícitamente.
- Criterio 3: si el fichero no tiene la estructura esperada (secciones/columnas de sección 1, verificadas contra el fichero real), se rechaza con un error claro, igual que spec 003 H1 criterio 1.

**H2 — Importar sin duplicar si se repite el CSV (o se solapa con uno anterior)**

Como usuario quiero poder volver a exportar e importar mi cartera de Investing.com periódicamente (para traer compras/ventas nuevas desde la última vez) sin que las compras y ventas que ya importé se dupliquen — mismo motivo que llevó a spec 012 (detección de duplicados en la importación de Excel, tras duplicar 1487 movimientos con una reimportación accidental).

- Criterio 1: un lote de compra/venta del CSV se considera "ya existente" si la acción, la fecha, el número de acciones y el precio coinciden exactamente con una compra/venta ya registrada de esa acción — mismo criterio de coincidencia exacta que spec 012 H1 criterio 1.
- Criterio 2: los lotes ya existentes se omiten automáticamente al confirmar, sin bloquear el resto de la importación (mismo criterio que spec 003 decisión 4: lo demás se importa igual).
- Criterio 3: importar el mismo fichero dos veces seguidas la segunda vez no añade nada nuevo (0 compras, 0 ventas, 0 valoraciones) — mismo criterio de idempotencia que spec 032 H2 criterio 3.

**H3 — Emparejar cada acción del CSV con una posición ya existente, sin duplicarla**

Como usuario quiero que, si una acción del CSV ya la tengo dada de alta en la app, la importación añada su historial a esa misma posición — no que cree una posición nueva y duplicada con el mismo nombre.

- Criterio 1: una fila del CSV se empareja con una acción ya existente del usuario si su columna `Nombre` coincide, de forma insensible a mayúsculas/minúsculas, tildes y espacios sobrantes, con el campo "Acción" de una posición ya existente — mismo criterio de normalización que spec 003 H2 criterio 1 (categorías).
- Criterio 2: si hay más de una posición existente cuyo nombre normalizado coincide (p. ej. la misma acción dada de alta bajo dos bancos custodia distintos), no se elige ninguna automáticamente — esa fila se trata como ambigua y se señala en la vista previa (H1) para que Diego la resuelva a mano (editando el banco custodia después de importar, o renombrando una de las dos antes de reintentar) — mismo criterio pragmático que spec 032 §2 para duplicados "semánticos".
- Criterio 3: si no hay ninguna coincidencia, se crea una acción nueva con "Acción" = columna `Nombre` del CSV tal cual, y "Banco Custodia" = `"-"` — un valor de relleno explícito, porque el CSV no trae ningún dato de banco/bróker; Diego lo edita a mano después si quiere precisarlo (spec 020 H1 criterio 3 ya permite editar el banco custodia sin perder historial).

**H4 — Traer también las posiciones ya cerradas (histórico de ventas)**

Como usuario quiero importar también las posiciones que ya vendí del todo (sección "Posiciones cerradas" del CSV, algunas de 2015), para tener el histórico completo de ganancias/pérdidas realizadas en la app (spec 031), no solo lo que tengo abierto hoy.

- Criterio 1: cada lote de "Posiciones cerradas" del CSV se importa como una compra (Número de acciones, Precio entrada, Fecha apertura) y una venta (mismo número de acciones, Precio cierre, Fecha cierre) de la misma acción — igual que si Diego los hubiera registrado a mano uno a uno.
- Criterio 2: una acción que solo aparece en "Posiciones cerradas" (no tiene ninguna posición abierta hoy) se crea igualmente como acción nueva (H3 criterio 3) — queda en la app con historial de compra/venta pero sin valoración actual, mostrando "Sin valoración" (spec 020 H3 criterio 6), igual que cualquier acción vendida del todo a mano.

**H5 — Traer el precio actual de cada posición abierta**

Como usuario quiero que las posiciones abiertas importadas ya tengan una valoración con el precio actual del CSV, para no tener que anotarla a mano justo después de importar.

- Criterio 1: por cada fila de la sección "Resumen de posiciones" (posiciones abiertas), se añade una valoración (Precio por acción actual = columna `Precio actual`, Fecha = fecha de la importación) a la acción correspondiente.
- Criterio 2: si ya existe una valoración de esa acción con la misma fecha, no se duplica (H2 criterio 1, aplicado también a valoraciones).

## 3. Casos encontrados en el fichero real (a resolver explícitamente, no descartar la fila)

- **Lotes a precio de entrada 0** (Vidrala, 1,35 acciones; Viscofan, 1 acción — probablemente acciones regalo/ajuste de bróker, con un `%Beneficio` sin sentido en el CSV, `875.999.999.900,00%`). Se importan tal cual, con Precio de compra = 0 — no se descartan ni se tratan como fila inválida. *(Decidido con Diego, sección 5.)*
- **Comisión con importe** (columna `Comisión`, p. ej. `3,17 €` en Santander, `13,98 €` en Enagás) — no tiene equivalente en el modelo de compras/ventas de la app (spec 020/031 no llevan comisión). Se ignora esa columna; el coste importado es Número de acciones × Precio de compra, igual que cualquier compra dada de alta a mano.
- **Acciones en mercados en USD** (UnitedHealth `NYSE`, Fiserv `NASDAQ.O`) — el modelo de acciones de la app no distingue divisa (spec 020); el número del CSV se guarda tal cual, sin convertir. *(Decidido con Diego, sección 5 — limitación conocida y documentada, no se resuelve en esta spec.)*

## 4. Fuera de alcance

- **Cotización o precio en vivo** — el precio actual importado (H5) es una foto del momento de exportar el CSV desde Investing.com, no una conexión en directo; sigue sin haber ninguna fuente de mercado consultada por la app (spec 020 §2, sin cambios).
- **Conversión de divisa** — ver sección 3; los importes en USD se guardan tal cual, sin tipo de cambio. Si en el futuro se prioriza, es una spec/decisión aparte (probablemente transversal a toda la app, no solo a esta importación).
- **Dividendos** (`stockDividends`, spec 029) — esta exportación de Investing.com ("Resumen de posiciones") no trae dividendos cobrados; no se importa nada en ese historial. Investing.com sí permite exportar un CSV de dividendos aparte — se añadiría como una spec futura si Diego lo pide, reutilizando el mismo mecanismo de emparejamiento de H3.
- **Fusión automática de nombres parecidos pero no idénticos tras normalizar** (p. ej. "Repsol" vs "Repsol SA") — mismo criterio que spec 020 §2 y spec 032 §2: se resuelve a mano, no es una spec de matching difuso.
- **Otros formatos de exportación de cartera** (de otro bróker o de otra plantilla de Investing.com con columnas distintas) — esta spec fija el mapeo contra la estructura real verificada en sección 1; un fichero con otras columnas se rechaza (H1 criterio 3), igual que spec 003 §5 para el Excel.
- **Editar o completar filas del CSV desde la propia pantalla de importación** (p. ej. rellenar el banco custodia fila a fila antes de confirmar) — igual que spec 003 §5, se resuelve el 100% del fichero con las reglas de H3, y lo que quede impreciso (banco custodia `"-"`) se edita después desde la propia acción ya creada.

## 5. Decisiones tomadas con Diego

1. **Se importan tanto las posiciones abiertas como las cerradas** (H4) — Diego quiere el histórico completo de ganancias/pérdidas realizadas, no solo la foto de hoy.
2. **Los importes en USD se guardan sin convertir a euros** — limitación conocida (sección 3/4); no se resuelve en esta spec.
3. **Los lotes a precio de entrada 0 se importan tal cual**, sin descartarlos ni pedir un precio distinto.
4. **Banco Custodia**: si la acción ya existe en la app (H3 criterio 1), se reutiliza su banco custodia real; si es una acción nueva, se rellena con `"-"` en vez de pedirlo en el momento de importar.

---
**Siguiente paso:** revisar esta spec con Diego; con su aprobación (o los ajustes que pida), se escribe `plan.md` con el diseño técnico (endpoint, parseo del CSV, algoritmo de emparejamiento/detección de duplicados, forma de la vista previa).
