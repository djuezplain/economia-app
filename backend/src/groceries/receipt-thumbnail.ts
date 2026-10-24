import sharp from 'sharp';

/** Spec 051 plan.md §0 decisión 3: lado largo de la miniatura de la galería. */
export const THUMBNAIL_SIZE = 480;

/**
 * Miniatura JPEG de una imagen (respetando su orientación EXIF y sin
 * agrandarla). `sharp` trabaja en su propio hilo, fuera del bucle de
 * eventos. Si la imagen no se puede leer, devuelve 0 bytes: el documento
 * se guarda igual y la galería muestra un icono (plan.md §5), sin
 * reintentarlo en cada carga.
 */
export async function makeThumbnail(image: Buffer): Promise<Buffer> {
  try {
    return await sharp(image, { failOn: 'error' })
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer();
  } catch {
    return Buffer.alloc(0);
  }
}
