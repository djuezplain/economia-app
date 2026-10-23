// Spec 048 plan.md §0 decisión 7 / §2. Función pura: el tipo de un
// documento se deduce de sus primeros bytes ("magic numbers"), nunca del
// `Content-Type` o la extensión que manda el navegador — un SVG o un HTML
// renombrado a `.png` no debe guardarse ni servirse como imagen.

export type DocumentMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf';

/** Marcas de una caja `ftyp` que corresponden a HEIC/HEIF (no AVIF ni MP4). */
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, i) => buffer[offset + i] === byte);
}

function asciiAt(buffer: Buffer, offset: number, length: number): string {
  if (buffer.length < offset + length) return '';
  return buffer.toString('latin1', offset, offset + length);
}

export function detectDocumentType(buffer: Buffer): DocumentMimeType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP') return 'image/webp';
  if (asciiAt(buffer, 0, 5) === '%PDF-') return 'application/pdf';
  if (asciiAt(buffer, 4, 4) === 'ftyp' && HEIF_BRANDS.has(asciiAt(buffer, 8, 4))) return 'image/heic';
  return null;
}

/** Extensión con la que se descarga o se guarda en el `.zip` (spec 048 §3.4). */
export function extensionFor(mimeType: DocumentMimeType): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }[mimeType];
}

/** Spec 048 plan.md §3.4: ruta de un documento dentro del `.zip` de exportación. */
export function archivePathFor(documentId: string, mimeType: string): string {
  return `documentos/${documentId}.${extensionFor(mimeType as DocumentMimeType)}`;
}
