import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VISION_ANNOTATE_URL = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionWord {
  boundingBox?: { vertices?: VisionVertex[] };
  symbols?: Array<{ text: string }>;
}
interface VisionFullTextAnnotation {
  text: string;
  pages?: Array<{
    blocks?: Array<{
      paragraphs?: Array<{
        words?: VisionWord[];
      }>;
    }>;
  }>;
}
interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: VisionFullTextAnnotation;
    error?: { message: string };
  }>;
}

interface PositionedWord {
  text: string;
  x: number;
  yCenter: number;
  height: number;
}

/**
 * Bug real encontrado con un ticket real de Lidl (Diego: "casi no
 * reconoce texto"): Vision sí reconocía el texto bien, pero
 * `fullTextAnnotation.text` lo entrega agrupado por bloques/párrafos
 * internos de Vision, no por fila visual — en un ticket con "nombre en una
 * línea, peso/precio en la siguiente" eso puede invertir el orden
 * (`"0,760 kg x 2,69"` antes que `"PIMIENTO VERDE FREÍR"`, al revés que en
 * el papel), rompiendo el parseo línea a línea que ya esperaba `Tesseract`.
 *
 * Cada palabra de `fullTextAnnotation` sí trae su caja delimitadora en
 * píxeles — de ahí se puede reconstruir el orden de lectura real (fila a
 * fila, izquierda a derecha) ignorando cómo Vision agrupó internamente el
 * texto. `receipt-import.parsing.ts` no cambia nada: sigue recibiendo una
 * única cadena con saltos de línea, ahora en el orden correcto.
 */
export function extractPositionedWords(fullTextAnnotation: VisionFullTextAnnotation): PositionedWord[] {
  const words: PositionedWord[] = [];
  for (const page of fullTextAnnotation.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const vertices = word.boundingBox?.vertices ?? [];
          const xs = vertices.map((v) => v.x ?? 0);
          const ys = vertices.map((v) => v.y ?? 0);
          if (xs.length === 0 || ys.length === 0) continue;
          const text = (word.symbols ?? []).map((s) => s.text).join('');
          if (text === '') continue;
          words.push({
            text,
            x: Math.min(...xs),
            yCenter: (Math.min(...ys) + Math.max(...ys)) / 2,
            height: Math.max(...ys) - Math.min(...ys) || 1,
          });
        }
      }
    }
  }
  return words;
}

/**
 * Agrupa palabras en filas por proximidad vertical (dos palabras caen en
 * la misma fila si sus centros verticales están a menos del 60% de la
 * altura de palabra más alta de las dos) y las ordena de izquierda a
 * derecha dentro de cada fila — mismo criterio general que cualquier
 * reconstructor de líneas a partir de cajas de OCR, independiente del
 * formato de ticket concreto (a diferencia de una regla ad-hoc por
 * supermercado).
 */
export function reconstructRowText(words: PositionedWord[]): string {
  if (words.length === 0) return '';
  const sorted = [...words].sort((a, b) => a.yCenter - b.yCenter);
  const rows: PositionedWord[][] = [];
  for (const word of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const rowYCenter = lastRow.reduce((sum, w) => sum + w.yCenter, 0) / lastRow.length;
      const rowHeight = Math.max(...lastRow.map((w) => w.height));
      const tolerance = Math.max(rowHeight, word.height) * 0.6;
      if (Math.abs(word.yCenter - rowYCenter) <= tolerance) {
        lastRow.push(word);
        continue;
      }
    }
    rows.push([word]);
  }
  return rows
    .map((row) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((w) => w.text)
        .join(' '),
    )
    .join('\n');
}

/**
 * Spec 034, plan.md §2/§4 (revisado — cambio de motor de OCR pedido por
 * Diego, de Tesseract a Google Cloud Vision, después de la implementación
 * inicial ya cerrada). Única pieza que toca la red/la API de Vision — el
 * parseo del texto reconocido vive aparte, en funciones puras
 * (`receipt-import.parsing.ts`), agnósticas al motor.
 *
 * Sin preprocesado de imagen (a diferencia de la versión con Tesseract):
 * Vision es robusto contra fondo, rotación e iluminación variable sin
 * ayuda adicional — la ventaja real de pasar a un motor en la nube.
 */
@Injectable()
export class ReceiptOcrService {
  constructor(private readonly config: ConfigService) {}

  /** Spec 048: `mimeType` es el tipo ya detectado del documento (el PDF se lee en T3.3). */
  async extractText(imageBuffer: Buffer, _mimeType = 'image/jpeg'): Promise<string> {
    const apiKey = this.config.get<string>('GOOGLE_CLOUD_VISION_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El reconocimiento de tickets no está configurado (falta GOOGLE_CLOUD_VISION_API_KEY).',
      );
    }

    const response = await fetch(`${VISION_ANNOTATE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBuffer.toString('base64') },
            // DOCUMENT_TEXT_DETECTION, no TEXT_DETECTION: pensado para
            // bloques densos de texto (documentos, recibos), no para texto
            // disperso en una foto general.
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['es'] },
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Cloud Vision respondió ${response.status}: ${body}`);
    }

    const json = (await response.json()) as VisionAnnotateResponse;
    const result = json.responses?.[0];
    if (result?.error) {
      throw new Error(`Google Cloud Vision: ${result.error.message}`);
    }

    const fullTextAnnotation = result?.fullTextAnnotation;
    if (!fullTextAnnotation) return '';

    // Reconstruido por geometría (ver comentario de `reconstructRowText`);
    // si por lo que sea no hay palabras posicionadas (respuesta atípica),
    // se cae al texto plano de Vision en vez de devolver una cadena vacía.
    const positionedWords = extractPositionedWords(fullTextAnnotation);
    return positionedWords.length > 0 ? reconstructRowText(positionedWords) : fullTextAnnotation.text;
  }
}
