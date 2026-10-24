import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { makeThumbnail } from './receipt-thumbnail.js';

const image = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: { r: 240, g: 238, b: 230 } } })[format]().toBuffer();

describe('makeThumbnail (spec 051 H6)', () => {
  it('reduce una foto grande a 480 px de lado largo, en JPEG, manteniendo la proporción', async () => {
    const thumb = await makeThumbnail(await image(3000, 4000));
    const meta = await sharp(thumb).metadata();
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: 'jpeg', width: 360, height: 480 });
    expect(thumb.length).toBeLessThan(40_000);
  });

  it('no agranda una imagen pequeña y acepta PNG y WEBP', async () => {
    for (const format of ['png', 'webp'] as const) {
      const meta = await sharp(await makeThumbnail(await image(200, 100, format))).metadata();
      expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: 'jpeg', width: 200, height: 100 });
    }
  });

  it('una imagen que no se puede leer da 0 bytes, sin lanzar', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('no es una foto')]);
    expect((await makeThumbnail(broken)).length).toBe(0);
  });
});
