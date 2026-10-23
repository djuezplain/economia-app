import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { receiptDocuments, receipts } from '../db/schema/index.js';
import { detectDocumentType } from '../receipt-import/document-type.js';
import type { DocumentMimeType } from '../receipt-import/document-type.js';
import { heicToJpeg } from './heic-to-jpeg.js';

/** Spec 048 H1 criterio 8: mismo límite que la importación de tickets de la spec 034. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
/** Plan.md §0 decisión 4: un documento subido en la vista previa y no confirmado se borra a las 24 horas. */
export const PENDING_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Base de datos o transacción en curso. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** Lo que se guarda (y se devuelve) de un documento, sin el contenido. */
export interface DocumentInfo {
  id: string;
  /** Uno de `StoredMimeType`. */
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  originalFilename: string;
}

/** Un HEIC se guarda ya convertido a JPEG. */
export type StoredMimeType = Exclude<DocumentMimeType, 'image/heic'>;

export interface PreparedDocument {
  mimeType: StoredMimeType;
  content: Buffer;
  sha256: string;
  pageCount: number | null;
  originalFilename: string;
}

const UNSUPPORTED_MESSAGE = 'Solo se admiten fotos (JPEG, PNG, WEBP o HEIC) o documentos PDF.';

/** Nº de páginas de un PDF contando sus objetos `/Type /Page` (aproximado, solo informativo). */
export function countPdfPages(content: Buffer): number | null {
  const matches = content.toString('latin1').match(/\/Type\s*\/Page(?!s)\b/g);
  return matches ? matches.length : null;
}

function cleanFilename(name: string | undefined, mimeType: StoredMimeType): string {
  const fallback = mimeType === 'application/pdf' ? 'documento.pdf' : 'foto.jpg';
  const base = (name ?? '').replace(/[\\/\r\n"]/g, '_').trim().slice(0, 200);
  if (!base) return fallback;
  // Un HEIC convertido conserva el nombre pero con la extensión de lo que se guarda.
  return mimeType === 'image/jpeg' ? base.replace(/\.(heic|heif)$/i, '.jpg') : base;
}

/**
 * Spec 048 H1 (plan.md §3.1). Toda consulta filtra por `userId`
 * (constitution §2): un documento pendiente aún no tiene ticket por el que
 * filtrar, por eso la tabla lleva `userId` propio.
 */
@Injectable()
export class ReceiptDocumentsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Valida el tipo por los primeros bytes y convierte HEIC a JPEG. No escribe nada. */
  async prepare(buffer: Buffer, filename: string | undefined): Promise<PreparedDocument> {
    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('El documento ocupa más de 10 MB.');
    }
    const detected = detectDocumentType(buffer);
    if (!detected) throw new BadRequestException(UNSUPPORTED_MESSAGE);

    let content = buffer;
    let mimeType: StoredMimeType;
    if (detected === 'image/heic') {
      try {
        content = await heicToJpeg(buffer);
      } catch {
        throw new BadRequestException('No se ha podido leer la foto HEIC; prueba a subirla en JPEG.');
      }
      mimeType = 'image/jpeg';
    } else {
      mimeType = detected;
    }

    return {
      mimeType,
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
      pageCount: mimeType === 'application/pdf' ? countPdfPages(content) : null,
      originalFilename: cleanFilename(filename, mimeType),
    };
  }

  /** Vista previa de la importación: guarda el documento como pendiente (sin ticket). */
  async storePending(userId: string, prepared: PreparedDocument): Promise<DocumentInfo> {
    const [row] = await this.db
      .insert(receiptDocuments)
      .values({ userId, receiptId: null, ...this.columns(prepared) })
      .returning(this.infoColumns());
    return row;
  }

  /**
   * Confirmación de la importación, dentro de su transacción: asocia el
   * pendiente al ticket recién creado. Solo un pendiente del propio usuario.
   */
  async attachPending(tx: Executor, userId: string, documentId: string, receiptId: string): Promise<void> {
    const updated = await tx
      .update(receiptDocuments)
      .set({ receiptId })
      .where(and(eq(receiptDocuments.id, documentId), eq(receiptDocuments.userId, userId), isNull(receiptDocuments.receiptId)))
      .returning({ id: receiptDocuments.id });
    if (updated.length === 0) {
      throw new BadRequestException('El documento ya no está disponible; vuelve a subirlo.');
    }
  }

  /** H1 criterio 3: adjunta un documento a un ticket guardado, o sustituye el que tenga. */
  async replace(userId: string, receiptId: string, prepared: PreparedDocument): Promise<DocumentInfo> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    return this.db.transaction(async (tx) => {
      await tx.delete(receiptDocuments).where(and(eq(receiptDocuments.receiptId, receiptId), eq(receiptDocuments.userId, userId)));
      const [row] = await tx
        .insert(receiptDocuments)
        .values({ userId, receiptId, ...this.columns(prepared) })
        .returning(this.infoColumns());
      return row;
    });
  }

  /** H1 criterio 3: quita el documento de un ticket. */
  async remove(userId: string, receiptId: string): Promise<void> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    const deleted = await this.db
      .delete(receiptDocuments)
      .where(and(eq(receiptDocuments.receiptId, receiptId), eq(receiptDocuments.userId, userId)))
      .returning({ id: receiptDocuments.id });
    if (deleted.length === 0) throw new NotFoundException('Este ticket no tiene documento.');
  }

  /** H1 criterio 2: el documento de un ticket, con su contenido. */
  async getContent(userId: string, receiptId: string): Promise<DocumentInfo & { content: Buffer }> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    const [row] = await this.db
      .select({ ...this.infoColumns(), content: receiptDocuments.content })
      .from(receiptDocuments)
      .where(and(eq(receiptDocuments.receiptId, receiptId), eq(receiptDocuments.userId, userId)));
    if (!row) throw new NotFoundException('Este ticket no tiene documento.');
    return row;
  }

  /** Metadatos (sin contenido) de los documentos de varios tickets del usuario, por id de ticket. */
  async infoByReceipt(userId: string, receiptIds: string[]): Promise<Map<string, DocumentInfo>> {
    if (receiptIds.length === 0) return new Map();
    const rows = await this.db
      .select({ ...this.infoColumns(), receiptId: receiptDocuments.receiptId })
      .from(receiptDocuments)
      .where(and(eq(receiptDocuments.userId, userId), inArray(receiptDocuments.receiptId, receiptIds)));
    return new Map(rows.map(({ receiptId, ...info }) => [receiptId!, info]));
  }

  /** Plan.md §3.1: borra los pendientes de más de 24 horas. Nunca uno ya asociado a un ticket. */
  async purgeStalePending(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_DOCUMENT_TTL_MS);
    const deleted = await this.db
      .delete(receiptDocuments)
      .where(and(isNull(receiptDocuments.receiptId), lt(receiptDocuments.createdAt, cutoff)))
      .returning({ id: receiptDocuments.id });
    return deleted.length;
  }

  private async findOwnReceiptOrThrow(userId: string, receiptId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: receipts.id })
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!row) throw new NotFoundException('El ticket indicado no existe.');
  }

  private columns(prepared: PreparedDocument) {
    return {
      mimeType: prepared.mimeType,
      sizeBytes: prepared.content.length,
      sha256: prepared.sha256,
      originalFilename: prepared.originalFilename,
      pageCount: prepared.pageCount,
      content: prepared.content,
    };
  }

  private infoColumns() {
    return {
      id: receiptDocuments.id,
      mimeType: receiptDocuments.mimeType,
      sizeBytes: receiptDocuments.sizeBytes,
      pageCount: receiptDocuments.pageCount,
      originalFilename: receiptDocuments.originalFilename,
    };
  }
}
