import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VISION_ANNOTATE_URL = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: { text: string };
    error?: { message: string };
  }>;
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
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(private readonly config: ConfigService) {}

  async extractText(imageBuffer: Buffer): Promise<string> {
    // Log temporal de diagnóstico (Diego: "casi no reconoce texto" con un
    // ticket real) — quitar en cuanto se confirme la causa real. El texto
    // de un ticket de supermercado no es dato sensible.
    this.logger.debug(`Enviando imagen a Vision: ${imageBuffer.length} bytes`);

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

    // Cadena única con saltos de línea — misma forma que la salida de
    // `tesseract ... stdout` que ya esperaba el parseo (H1 criterio 4: ''
    // si Vision no reconoce ningún texto, no lanza).
    const text = result?.fullTextAnnotation?.text ?? '';
    this.logger.debug(`Vision reconoció ${text.length} caracteres:\n${text}`);
    return text;
  }
}
