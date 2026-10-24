/** Cabeceras reales de cada formato, con algo de relleno: el contenido no se interpreta salvo en HEIC. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg de prueba')]);
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF');
