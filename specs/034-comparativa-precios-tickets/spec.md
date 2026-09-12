# Spec 034 — Comparativa de precios de supermercado a partir de tickets escaneados (OCR)

**Estado:** Aprobada
**Fase:** 1 de 4 (Spec → Plan → Tasks → Implementación)
**Basado en:** una prueba real de OCR (Tesseract, motor gratuito y sin límite de uso) sobre un ticket real de Mercadona fotografiado por Diego, verificada línea por línea contra el ticket original — no solo a partir de una descripción teórica de qué tan bien funciona el OCR. Resultado y limitaciones reales en la sección 1.

## 0. Qué cambia

Diego quiere poder fotografiar los tickets de la compra y que la app reconozca automáticamente sus líneas (producto + precio), para poder comparar cuánto le cuesta el mismo producto en distintos supermercados y decidir dónde le compensa comprar cada cosa.

Esto es una funcionalidad nueva, sin nada parecido hoy en la app: no existe ningún concepto de "producto", "supermercado" ni "ticket" en el modelo actual (los "Movimientos" de spec 002 registran gastos como transacciones completas, no desglosadas por artículo). Sigue el mismo patrón que otras veces que se ha añadido un tipo de dato nuevo a la app (spec 020 Acciones, spec 022 Cripto, spec 023 Vehículos): vive en su propia sección, con su propio modelo, sin modificar Movimientos.

**Importante — esto no sustituye ni duplica el registro de gastos:** un ticket importado aquí sirve para comparar precios de productos, no para llevar la cuenta de cuánto se gasta (eso ya lo cubre el resto de la app vía el extracto bancario, spec 003). Ver sección 4.

## 1. Qué hemos verificado con una prueba real de OCR

**Nota (revisión posterior a la aprobación inicial):** esta sección documenta la prueba que llevó a elegir Tesseract al aprobar la spec. Diego decidió después pasar a Google Cloud Vision (sección 4, decisión 1) — la razón de H2 (revisión obligatoria) sigue siendo válida igual: ningún OCR, tampoco uno de pago, garantiza el 100% de acierto en nombres de producto ni en el total impreso, así que la corrección manual sigue siendo necesaria.

Se probó Tesseract (gratuito, sin cuota) contra una foto real de un ticket de Mercadona (26 líneas de producto, papel térmico, foto tomada con el móvil sobre una superficie de tela, no un escáner):

- **El preprocesado de la imagen importa mucho más que el motor de OCR.** Sin recortar el ticket del fondo, el resultado es ilegible. Recortando solo la zona del ticket, pasando a escala de grises, aumentando la resolución (x3) y el contraste — **sin binarizar** (probamos umbral fijo y empeora el resultado, destruye los trazos finos de la impresora térmica) — el resultado es bueno.
- **Los precios salen casi siempre correctos.** Los nombres de producto salen legibles pero con ruido típico de OCR (confusión O/0, S/5, I/1 — p. ej. "CLASSIC" → "CLAESIO").
- **Dos fallos concretos, no cosméticos:**
  1. Una línea con dos importes en la misma fila (precio unitario y subtotal, p. ej. artículos vendidos por peso o en cantidad >1) a veces se fusiona mal y da un número sin sentido.
  2. La línea del **total** puede salir completamente mal si coincide con un pliegue/arruga física del papel — en la prueba real dio "321" en vez de "39,27". El total impreso **no puede darse por bueno sin más**.

Estos dos fallos, más el ruido normal en nombres de producto, son la razón de H2 (revisión obligatoria antes de guardar): ninguna línea reconocida por OCR se guarda directamente sin que Diego la vea.

## 2. Historias de usuario

**H1 — Subir la foto de un ticket y ver qué se ha reconocido, antes de guardar nada**

Como usuario quiero subir la foto de un ticket de supermercado y ver qué productos y precios ha reconocido la app, sin que se guarde nada todavía — mismo criterio que el resto de importaciones de la app (spec 003 H1, spec 032 H2, spec 033 H1).

- Criterio 1: se acepta una imagen (foto tomada con el móvil o ya guardada) de un ticket.
- Criterio 2: la vista previa muestra, por cada línea reconocida, el nombre de producto y el precio; y por separado, la fecha del ticket, el supermercado detectado (H3) y el total impreso, si se pudieron leer.
- Criterio 3: no se escribe nada en la base de datos hasta confirmar explícitamente.
- Criterio 4: si la imagen es tan ilegible que no se reconoce ninguna línea, se avisa de que no se ha podido leer nada — nunca se ofrece una vista previa vacía como si el ticket no tuviera productos.

**H2 — Corregir lo reconocido antes de guardar (obligatorio, no un extra opcional)**

Como usuario quiero poder corregir cualquier línea mal reconocida (o añadir una que el OCR se haya saltado, o borrar una inventada) antes de guardar el ticket, porque la sección 1 demuestra que ni los nombres ni el total pueden darse por buenos sin revisión.

- Criterio 1: cada línea de la vista previa (nombre, precio) es editable.
- Criterio 2: se puede borrar una línea reconocida por error y añadir una línea nueva a mano.
- Criterio 3: la vista previa muestra la suma de las líneas reconocidas junto al total impreso leído del ticket (si se pudo leer), para que un desajuste se note a simple vista — no bloquea el guardado si no coinciden, es un aviso, no una validación dura.

**H3 — Asociar el ticket a un supermercado**

Como usuario quiero que cada ticket quede asociado al supermercado donde compré, para poder comparar precios entre supermercados (H4).

- Criterio 1: se intenta detectar el supermercado a partir de la cabecera del ticket (p. ej. "MERCADONA, S.A.").
- Criterio 2: si no se reconoce con confianza, se pide elegir uno de los supermercados ya usados antes, o crear uno nuevo escribiendo su nombre — igual de manual que el emparejamiento de acciones de spec 033 H3 criterio 2 cuando hay ambigüedad.
- Criterio 3: el supermercado es editable en la vista previa antes de confirmar, igual que las líneas (H2).

**H4 — Comparar el precio de un mismo producto entre supermercados**

Como usuario quiero, dado un producto, ver su precio en cada supermercado donde lo he comprado y en qué fecha, para saber dónde me compensa comprarlo. Este es el objetivo real de la funcionalidad — H1-H3 son solo el mecanismo para rellenar los datos sin teclearlos a mano.

- Criterio 1: al guardar una línea (H2), Diego puede emparejarla con un producto ya existente (creado desde un ticket anterior, de cualquier supermercado) o crear uno nuevo con el nombre de la línea.
- Criterio 2: no hay fusión automática de nombres de producto parecidos pero no idénticos (p. ej. "Leche Pascual 1L" vs "Leche Pascual Entera 1L") — se resuelve a mano, mismo criterio que spec 033 §4 y spec 020 §2 para casos equivalentes.
- Criterio 3: hay una pantalla, por producto, que lista su precio en cada supermercado, ordenada de más barato a más caro. **Revisado (petición de Diego, spec 036):** por defecto muestra solo el precio más reciente de cada supermercado, no cada compra histórica — un botón "Historial" muestra la lista completa (todas las fechas, agrupadas por supermercado).
- Criterio 4: si el producto se vende por peso (el ticket trae cantidad en kg y precio/kg, como fruta o verdura), la comparación se hace por precio/kg; si se vende por unidad, por precio de la línea. No se convierte entre ambas unidades.

**H5 — Ver el historial de tickets importados**

Como usuario quiero ver la lista de tickets que ya he importado (fecha, supermercado, total) y poder abrir uno para revisar sus líneas, igual que cualquier otro historial de la app.

- Criterio 1: listado de tickets importados, ordenado por fecha descendente, con supermercado y total.
- Criterio 2: al abrir un ticket se ven sus líneas (producto, precio, y a qué producto de H4 quedó emparejada cada una).

## 3. Fuera de alcance

- **Crear un Movimiento/gasto automáticamente a partir del ticket** — el gasto de esa compra ya se registra por el cauce habitual (extracto bancario, spec 003); hacerlo también aquí duplicaría el gasto. Si en el futuro se quiere enlazar un ticket ya importado con su Movimiento correspondiente, es una spec/decisión aparte.
- **Reconocimiento de código de barras/EAN** para emparejar productos entre supermercados de forma exacta (evitaría el emparejamiento manual de H4) — mejora real pero es una spec propia, no bloquea esta.
- **Fusión automática de nombres de producto parecidos** — ver H4 criterio 2.
- **Tickets que no sean de supermercado** (otros comercios, facturas) o en otro idioma — esta spec fija el reconocimiento contra el formato de ticket de supermercado español verificado en sección 1.
- **Conversión de divisa o de unidad de medida** entre productos que no comparten unidad (p. ej. comparar un producto vendido por kg contra el mismo vendido por unidad) — ver H4 criterio 4, se muestra tal cual, no se convierte.
- **Captura de cámara en vivo dentro de la app** — se sube una foto ya tomada (galería o cámara del móvil vía el selector de fichero estándar), como cualquier otro adjunto; no hay una vista de cámara integrada en esta spec.
- **Multiusuario compartido** (comparar precios agregando tickets de varios usuarios) — cada usuario ve solo sus propios tickets y productos, mismo aislamiento por `user_id` que el resto de la app (constitution §2).

## 4. Decisiones tomadas con Diego

1. ~~Motor de OCR: Tesseract (gratuito)~~ **Revisado — motor de OCR: Google Cloud Vision.** La decisión original (sección 4, versión previa de esta spec) ya dejaba esto como "revisable": Tesseract dio buen resultado en la prueba de sección 1, pero Diego ha pedido pasar a Google Cloud Vision (API de pago, con capa gratuita) para mejor precisión sin depender del preprocesado manual de imagen. H1-H5 no cambian — el motor concreto es un detalle de `plan.md`, no de esta spec.
2. **El OCR se invoca vía la API REST de Google Cloud Vision desde el propio backend NestJS** (autenticación por API key, sin SDK de Google Cloud) — no se introduce un microservicio aparte. Al ser un servicio externo ya gestionado por Google, ya no hace falta preprocesar la imagen (recorte/escala de grises/contraste) como sí hacía falta con Tesseract — Vision es robusto contra fondos, rotación e iluminación variable sin ayuda adicional.
3. **"Supermercado" es una lista abierta**: Diego escribe el nombre la primera vez que aparece (detectado de la cabecera del ticket, H3, o a mano si no se reconoce) y se reutiliza después — mismo patrón que otros catálogos abiertos de la app (bancos custodia de spec 020, categorías de spec 002).
4. **No se guarda la foto original del ticket.** Solo se guardan los datos ya extraídos y corregidos (H2). Evita añadir almacenamiento de ficheros a la app (no existe hoy en ningún otro sitio) — una vez corregida la vista previa, la foto no aporta nada que no esté ya en los datos guardados.

---
**Siguiente paso:** escribir `plan.md` con el diseño técnico (modelo de datos de Producto/Supermercado/Ticket, cómo se invoca Tesseract y el preprocesado de imagen desde NestJS, algoritmo de detección del supermercado a partir de la cabecera, forma de la vista previa editable).
