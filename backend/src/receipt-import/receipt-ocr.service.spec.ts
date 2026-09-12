import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptOcrService, extractPositionedWords, reconstructRowText } from './receipt-ocr.service.js';

/**
 * Spec 034, plan.md §13 (revisado): Google Cloud Vision es un servicio de
 * pago — a diferencia de Tesseract (binario local, gratis), no se invoca
 * de verdad en la suite automática. Se mockea `global.fetch`.
 */
function configWithApiKey(apiKey: string | undefined): ConfigService {
  return { get: (key: string) => (key === 'GOOGLE_CLOUD_VISION_API_KEY' ? apiKey : undefined) } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Palabra de Vision con caja delimitadora rectangular, en el formato real de `fullTextAnnotation.pages[].blocks[].paragraphs[].words[]`. */
function visionWord(text: string, x: number, y: number, width = 20, height = 20) {
  return {
    boundingBox: {
      vertices: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
    },
    symbols: text.split('').map((c) => ({ text: c })),
  };
}

function fullTextAnnotationFromWords(words: Array<ReturnType<typeof visionWord>>) {
  return { text: 'texto plano sin usar (fallback)', pages: [{ blocks: [{ paragraphs: [{ words }] }] }] };
}

describe('reconstructRowText / extractPositionedWords', () => {
  it('reconstruye el orden visual real aunque Vision entregue las palabras en otro orden — caso real de un ticket de Lidl', () => {
    // "PIMIENTO VERDE FREÍR" está impreso arriba, "0,760 kg x 2,69 EUR/kg"
    // debajo — pero se simulan en el ARRAY en el orden invertido que
    // Vision devolvió de verdad (bug real reportado por Diego).
    const words = [
      visionWord('0,760', 10, 100),
      visionWord('kg', 70, 100),
      visionWord('x', 100, 100),
      visionWord('2,69', 120, 100),
      visionWord('PIMIENTO', 10, 50),
      visionWord('VERDE', 90, 50),
      visionWord('FREÍR', 150, 50),
    ];

    const text = reconstructRowText(extractPositionedWords(fullTextAnnotationFromWords(words)));

    expect(text).toBe('PIMIENTO VERDE FREÍR\n0,760 kg x 2,69');
  });

  it('ordena de izquierda a derecha dentro de la misma fila aunque lleguen desordenadas', () => {
    const words = [visionWord('CLASSIC', 90, 50), visionWord('CHOCOLATE', 10, 50), visionWord('1,30', 200, 50)];

    const text = reconstructRowText(extractPositionedWords(fullTextAnnotationFromWords(words)));

    expect(text).toBe('CHOCOLATE CLASSIC 1,30');
  });

  it('sin palabras posicionadas, devuelve cadena vacía', () => {
    expect(reconstructRowText([])).toBe('');
    expect(extractPositionedWords({ text: '', pages: [] })).toEqual([]);
  });
});

describe('ReceiptOcrService', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sin GOOGLE_CLOUD_VISION_API_KEY configurada, rechaza con 503 sin llamar a Google', async () => {
    const service = new ReceiptOcrService(configWithApiKey(undefined));
    await expect(service.extractText(Buffer.from('img'))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reconstruye el texto por geometría en vez de usar fullTextAnnotation.text tal cual', async () => {
    const words = [visionWord('CLASSIC', 90, 50), visionWord('CHOCOLATE', 10, 50)];
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(200, { responses: [{ fullTextAnnotation: fullTextAnnotationFromWords(words) }] }));
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    const text = await service.extractText(Buffer.from('img'));

    expect(text).toBe('CHOCOLATE CLASSIC');
    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain('key=fake-key');
  });

  it('sin palabras posicionadas en la respuesta, cae al texto plano de Vision', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(200, { responses: [{ fullTextAnnotation: { text: 'MERCADONA, S.A.' } }] }));
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    await expect(service.extractText(Buffer.from('img'))).resolves.toBe('MERCADONA, S.A.');
  });

  it('imagen sin ningún texto reconocible devuelve cadena vacía, sin lanzar (H1 criterio 4)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(200, { responses: [{}] }));
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    await expect(service.extractText(Buffer.from('img'))).resolves.toBe('');
  });

  it('un HTTP no-2xx de Google lanza con el cuerpo real de la respuesta', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('quota exceeded', { status: 429 }));
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    await expect(service.extractText(Buffer.from('img'))).rejects.toThrow(/429/);
  });

  it('un error a nivel de respuesta de Vision (responses[0].error) lanza con su mensaje', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(200, { responses: [{ error: { message: 'Bad image data.' } }] }));
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    await expect(service.extractText(Buffer.from('img'))).rejects.toThrow(/Bad image data/);
  });
});
