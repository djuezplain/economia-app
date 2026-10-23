// Spec 048 T0.1: `heic-convert` no publica tipos. Solo se declara lo que usa
// `ReceiptDocumentsService` (conversión de una imagen HEIC/HEIF a JPEG).
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    /** 0..1, solo para JPEG. */
    quality?: number;
  }
  function convert(options: ConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
