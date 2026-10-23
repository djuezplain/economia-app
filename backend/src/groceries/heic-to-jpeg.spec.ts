import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heicToJpeg } from './heic-to-jpeg.js';

const FIXTURE = new URL('./__fixtures__/ticket-pequeno.heic', import.meta.url);

// Spec 048 T3.1: conversión real, con un HEIC pequeño de prueba (sintético).
describe('heicToJpeg', () => {
  it('convierte un HEIC a JPEG en un hilo aparte', async () => {
    const jpeg = await heicToJpeg(readFileSync(FIXTURE));
    expect(jpeg.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  }, 30_000);

  it('rechaza con un error lo que no es un HEIC válido', async () => {
    await expect(heicToJpeg(Buffer.from('no es una imagen'))).rejects.toThrow();
  }, 30_000);
});
