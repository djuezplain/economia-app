import yauzl from 'yauzl';

/** Spec 048 plan.md §3.4: tope de lo que se descomprime en total (defensa contra "zip bombs"). */
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

export class ZipFormatError extends Error {}

/**
 * Lector de un `.zip` ya guardado en disco. Solo se leen las entradas que se
 * piden por nombre exacto (nunca se extrae nada a disco, así que una ruta con
 * `../` no puede escribir fuera), y `yauzl` comprueba que cada entrada mide
 * lo que declara (`validateEntrySizes`).
 */
export class ZipReader {
  private constructor(
    private readonly zip: yauzl.ZipFile,
    private readonly entries: Map<string, yauzl.Entry>,
  ) {}

  static open(path: string): Promise<ZipReader> {
    return new Promise((resolve, reject) => {
      yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: false }, (err, zip) => {
        if (err || !zip) return reject(new ZipFormatError('El fichero no es un .zip válido.'));
        const entries = new Map<string, yauzl.Entry>();
        let total = 0;
        const fail = (message: string) => {
          zip.close();
          reject(new ZipFormatError(message));
        };
        zip.on('entry', (entry: yauzl.Entry) => {
          total += entry.uncompressedSize;
          if (entries.size >= MAX_ENTRIES || total > MAX_TOTAL_UNCOMPRESSED_BYTES) {
            return fail('El .zip es demasiado grande una vez descomprimido.');
          }
          entries.set(entry.fileName, entry);
          zip.readEntry();
        });
        zip.on('end', () => resolve(new ZipReader(zip, entries)));
        zip.on('error', () => fail('El fichero no es un .zip válido.'));
        zip.readEntry();
      });
    });
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Tamaño declarado de una entrada, sin leerla. */
  size(name: string): number | null {
    return this.entries.get(name)?.uncompressedSize ?? null;
  }

  /** Contenido de una entrada; error si no existe, si supera `maxBytes` o si mide distinto de lo declarado. */
  read(name: string, maxBytes: number): Promise<Buffer> {
    const entry = this.entries.get(name);
    if (!entry) return Promise.reject(new ZipFormatError(`Falta "${name}" en el .zip.`));
    if (entry.uncompressedSize > maxBytes) return Promise.reject(new ZipFormatError(`"${name}" es demasiado grande.`));
    return new Promise((resolve, reject) => {
      this.zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(new ZipFormatError(`No se ha podido leer "${name}".`));
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', () => reject(new ZipFormatError(`"${name}" está dañado o no mide lo que declara.`)));
      });
    });
  }

  close(): void {
    this.zip.close();
  }
}
