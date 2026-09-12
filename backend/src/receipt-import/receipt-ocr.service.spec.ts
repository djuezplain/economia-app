import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptOcrService } from './receipt-ocr.service.js';

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

  it('devuelve el texto reconocido de fullTextAnnotation.text', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse(200, { responses: [{ fullTextAnnotation: { text: 'MERCADONA, S.A.\n1 CHOCOLATE CLASSIC 1,30' } }] }),
    );
    const service = new ReceiptOcrService(configWithApiKey('fake-key'));

    const text = await service.extractText(Buffer.from('img'));

    expect(text).toBe('MERCADONA, S.A.\n1 CHOCOLATE CLASSIC 1,30');
    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain('key=fake-key');
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
