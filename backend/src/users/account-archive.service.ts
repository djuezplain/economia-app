import { Inject, Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import yazl from 'yazl';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { receiptDocuments } from '../db/schema/index.js';
import type { AccountExport } from './users.service.js';
import { UsersService } from './users.service.js';

/** Nombre de los datos dentro del `.zip`. */
export const ARCHIVE_DATA_ENTRY = 'datos.json';

export function archiveFilename(date = new Date()): string {
  return `economia-app-datos-${date.toISOString().slice(0, 10)}.zip`;
}

/**
 * Spec 048 H1 criterio 6 / plan.md §3.4: la exportación de la cuenta como
 * `.zip` — `datos.json` (la misma exportación JSON de siempre, con los
 * metadatos de los documentos) y cada documento en su ruta `file`.
 *
 * En streaming y leyendo **un documento cada vez** de la base de datos
 * (`addReadStreamLazy`: `yazl` pide el contenido solo cuando le toca
 * escribirlo), para no cargar todos los binarios en memoria en la Raspberry
 * Pi. Los documentos no se comprimen (JPEG y PDF ya lo están).
 */
@Injectable()
export class AccountArchiveService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async createArchive(userId: string): Promise<{ stream: Readable; data: AccountExport }> {
    const data = await this.users.exportData(userId);
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2), 'utf-8'), ARCHIVE_DATA_ENTRY);

    for (const document of data.economicData.receiptDocuments) {
      zip.addReadStreamLazy(document.file, { compress: false, size: document.sizeBytes }, (callback) => {
        this.loadContent(userId, document.id)
          .then((content) => callback(null, Readable.from([content])))
          .catch((err: unknown) => callback(err, Readable.from([])));
      });
    }
    zip.end();
    return { stream: zip.outputStream as Readable, data };
  }

  private async loadContent(userId: string, documentId: string): Promise<Buffer> {
    const [row] = await this.db
      .select({ content: receiptDocuments.content })
      .from(receiptDocuments)
      .where(and(eq(receiptDocuments.id, documentId), eq(receiptDocuments.userId, userId)));
    if (!row) throw new Error(`El documento ${documentId} ya no existe.`);
    return row.content;
  }
}
