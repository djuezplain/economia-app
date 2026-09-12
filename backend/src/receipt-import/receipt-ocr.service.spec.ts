import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ReceiptOcrService } from './receipt-ocr.service.js';

/**
 * Tests de integración reales contra Tesseract (plan.md §13, T3.1) — no
 * mockean nada del pipeline. La imagen es una foto sintética renderizada
 * con SVG (nunca una foto real de un ticket, plan.md §14): un rectángulo de
 * fondo oscuro (simula la mesa/tela de la prueba real de `spec.md` §1)
 * alrededor de un "papel" claro con texto, para ejercitar también el
 * recorte por brillo, no solo el OCR en sí.
 */
function buildSyntheticReceiptImage(lines: string[]): Buffer {
  const paperWidth = 500;
  const paperHeight = 80 + lines.length * 36;
  const margin = 120;
  const totalWidth = paperWidth + margin * 2;
  const totalHeight = paperHeight + margin * 2;

  const textElements = lines
    .map((line, index) => `<text x="${margin + 20}" y="${margin + 50 + index * 36}" font-family="monospace" font-size="26" fill="black">${line}</text>`)
    .join('\n');

  const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${totalWidth}" height="${totalHeight}" fill="#334455"/>
      <rect x="${margin}" y="${margin}" width="${paperWidth}" height="${paperHeight}" fill="white"/>
      ${textElements}
    </svg>
  `;
  return Buffer.from(svg);
}

describe('ReceiptOcrService', () => {
  it('reconoce texto de una imagen sintética con fondo oscuro alrededor del papel', async () => {
    const image = await sharp(
      buildSyntheticReceiptImage(['MERCADONA, S.A.', 'Descripcion P.Unit Imp.', '1 CHOCOLATE CLASSIC 1,30', 'TOTAL 1,30']),
    )
      .png()
      .toBuffer();

    const service = new ReceiptOcrService();
    const text = await service.extractText(image);

    expect(text).toContain('MERCADONA');
    expect(text).toContain('CHOCOLATE');
    expect(text).toContain('TOTAL');
  }, 20000);

  it('no lanza con una imagen casi en blanco, sin texto legible', async () => {
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: 'white' } })
      .png()
      .toBuffer();

    const service = new ReceiptOcrService();
    await expect(service.extractText(image)).resolves.not.toThrow();
  }, 20000);

  it('no reduce el área a casi cero cuando el papel ya ocupa toda la imagen (sin fondo que recortar)', async () => {
    // Sin margen oscuro alrededor — ninguna columna/fila queda por debajo
    // del umbral de brillo, `computeCropBox` debe devolver `null` (usar la
    // imagen completa) en vez de un recorte degenerado.
    const svg = `
      <svg width="500" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="500" height="200" fill="white"/>
        <text x="20" y="100" font-family="monospace" font-size="26" fill="black">SOLO PAPEL SIN FONDO</text>
      </svg>
    `;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();

    const service = new ReceiptOcrService();
    const text = await service.extractText(image);
    expect(text.length).toBeGreaterThan(0);
  }, 20000);
});
