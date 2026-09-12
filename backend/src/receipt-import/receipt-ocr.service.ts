import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/**
 * Spec 034, plan.md §4: receta de preprocesado verificada a mano en
 * `spec.md` §1 (Pillow) — recorte del papel + escala de grises + upscale
 * x3 + autocontraste, **sin binarizar** (un umbral fijo empeoró el
 * resultado en la prueba real, destruye los trazos finos de la impresora
 * térmica). Aquí mismo con `sharp`.
 */
const BRIGHTNESS_THRESHOLD = 140; // 0-255, mismo umbral que la prueba con Pillow
const MIN_CROP_AREA_RATIO = 0.05; // plan.md §4.1: recorte que da menos del 5% del área se descarta
const UPSCALE_FACTOR = 3;

interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Columnas/filas cuyo brillo medio supera el umbral delimitan el papel del
 * ticket frente al fondo (mesa, tela...) — mismo método que el script de
 * prueba de `spec.md` §1 (`col_means > 140`). Si el recorte resultante es
 * casi toda la imagen o casi nada (fallo de detección — p. ej. una foto ya
 * recortada, o un fondo tan claro como el papel), se devuelve `null` y se
 * usa la imagen completa en vez de un recorte absurdo (plan.md §4.1).
 */
function computeCropBox(pixels: Buffer, width: number, height: number): CropBox | null {
  const colSums = new Float64Array(width);
  const rowSums = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const value = pixels[rowOffset + x];
      colSums[x] += value;
      rowSums[y] += value;
    }
  }

  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x++) {
    if (colSums[x] / height <= BRIGHTNESS_THRESHOLD) continue;
    if (left === -1) left = x;
    right = x;
  }
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    if (rowSums[y] / width <= BRIGHTNESS_THRESHOLD) continue;
    if (top === -1) top = y;
    bottom = y;
  }

  if (left === -1 || top === -1) return null; // ninguna columna/fila supera el umbral

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const ratio = (cropWidth * cropHeight) / (width * height);
  if (ratio < MIN_CROP_AREA_RATIO) return null;

  return { left, top, width: cropWidth, height: cropHeight };
}

/**
 * Única pieza que toca `sharp`/el binario de Tesseract/el sistema de
 * ficheros temporal (plan.md §12) — sin lógica de parseo de texto, eso vive
 * en `receipt-import.parsing.ts` como funciones puras testeables sin
 * invocar Tesseract de verdad.
 */
@Injectable()
export class ReceiptOcrService {
  async extractText(imageBuffer: Buffer): Promise<string> {
    const preprocessed = await this.preprocess(imageBuffer);
    return this.runTesseract(preprocessed);
  }

  private async preprocess(imageBuffer: Buffer): Promise<Buffer> {
    // `.rotate()` sin argumentos aplica la orientación EXIF de la foto
    // (una foto de móvil casi siempre trae orientación EXIF, no rotación
    // real de los píxeles) antes de calcular nada sobre las dimensiones.
    const base = sharp(imageBuffer).rotate();
    const { data, info } = await base.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
    const crop = computeCropBox(data, info.width, info.height);

    let pipeline = base.greyscale();
    if (crop) pipeline = pipeline.extract(crop);

    const cropWidth = crop?.width ?? info.width;
    return pipeline
      .resize({ width: cropWidth * UPSCALE_FACTOR, kernel: 'lanczos3' })
      .normalise() // autocontraste — plan.md §4.2, sin binarizar
      .png()
      .toBuffer();
  }

  private async runTesseract(imageBuffer: Buffer): Promise<string> {
    const tmpFile = join(tmpdir(), `receipt-ocr-${randomUUID()}.png`);
    await writeFile(tmpFile, imageBuffer);
    try {
      const { stdout } = await execFileAsync('tesseract', [tmpFile, 'stdout', '-l', 'spa', '--psm', '6']);
      return stdout;
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  }
}
