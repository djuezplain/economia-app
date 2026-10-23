// Spec 048 H1 (plan.md §4): preparación de un documento antes de subirlo.
// Las decisiones son funciones puras; el redimensionado real con `canvas`
// (`compressImageInBrowser`) se inyecta en `prepareUpload` para poder
// probar el flujo en jsdom, que no tiene `canvas`.

/** Mismo límite que el backend (spec 048 H1 criterio 8). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Lado largo máximo tras reducir: sobra para que Vision lea un ticket. */
export const MAX_IMAGE_SIDE = 3000;
export const JPEG_QUALITY = 0.85;

export const ACCEPTED_DOCUMENTS = 'image/*,application/pdf,.heic,.heif';

export function targetDimensions(width: number, height: number, maxSide = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Se intenta reducir cualquier imagen; un PDF se sube tal cual. */
export function isCompressible(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

/** Se envía la versión reducida solo si de verdad ocupa menos. */
export function pickSmaller<T extends { size: number }>(original: T, compressed: T | null): T {
  return compressed && compressed.size < original.size ? compressed : original;
}

export function sizeError(size: number): string | null {
  return size > MAX_UPLOAD_BYTES ? 'El documento ocupa más de 10 MB. Prueba con una foto más pequeña o un PDF con menos páginas.' : null;
}

export type Compressor = (file: File) => Promise<File | null>;

/**
 * Reduce la imagen y avisa si aun así supera el límite, sin subir nada.
 * Si el navegador no sabe abrirla (HEIC en Chrome o Android), el
 * compresor devuelve `null` y se sube el original: lo convierte el servidor.
 */
export async function prepareUpload(file: File, compress: Compressor = compressImageInBrowser): Promise<{ file: File; error: string | null }> {
  let chosen = file;
  if (isCompressible(file)) {
    const compressed = await compress(file).catch(() => null);
    chosen = pickSmaller(file, compressed);
  }
  return { file: chosen, error: sizeError(chosen.size) };
}

/** Redimensiona con `canvas` y recodifica como JPEG. `null` si el navegador no puede abrir la imagen. */
export async function compressImageInBrowser(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { width, height } = targetDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return null;
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
