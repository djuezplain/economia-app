import { BadGatewayException, BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { receiptDocuments, receipts } from '../db/schema/index.js';
import { detectDocumentType } from '../receipt-import/document-type.js';
import type { DocumentMimeType } from '../receipt-import/document-type.js';
import { heicToJpeg } from './heic-to-jpeg.js';
import { ReceiptOcrService } from '../receipt-import/receipt-ocr.service.js';

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
  /** Spec 051 H3: hay texto reconocido guardado. */
  hasText: boolean;
  /** Spec 051 H3: cuándo se leyó el texto; `null` = nunca (documentos anteriores a la spec 051). */
  textReadAt: Date | null;
}

/** Spec 051 H3 criterio 4: el documento se guardó, pero no se pudo leer su texto. */
export interface StoredDocument extends DocumentInfo {
  ocrWarning?: string;
}

/** Spec 051 H3 criterio 5. */
export interface DocumentText {
  text: string | null;
  readAt: Date | null;
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
  private readonly logger = new Logger(ReceiptDocumentsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ocr: ReceiptOcrService,
  ) {}

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
  async storePending(userId: string, prepared: PreparedDocument, ocrText?: string): Promise<DocumentInfo> {
    const [row] = await this.db
      .insert(receiptDocuments)
      .values({ userId, receiptId: null, ...this.columns(prepared), ...(ocrText !== undefined && textColumns(ocrText)) })
      .returning(this.infoColumns());
    return toInfo(row);
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
  async replace(userId: string, receiptId: string, prepared: PreparedDocument): Promise<StoredDocument> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    const stored = await this.db.transaction(async (tx) => {
      await tx.delete(receiptDocuments).where(and(eq(receiptDocuments.receiptId, receiptId), eq(receiptDocuments.userId, userId)));
      const [row] = await tx
        .insert(receiptDocuments)
        .values({ userId, receiptId, ...this.columns(prepared) })
        .returning(this.infoColumns());
      return toInfo(row);
    });

    // Spec 051 H3 criterio 2 y 4: se lee el texto del documento nuevo; si el
    // OCR falla o no está configurado, el documento se queda sin texto y se
    // avisa, pero la subida nunca falla por eso.
    try {
      const text = await this.ocr.extractText(prepared.content, prepared.mimeType);
      const [row] = await this.db
        .update(receiptDocuments)
        .set(textColumns(text))
        .where(eq(receiptDocuments.id, stored.id))
        .returning(this.infoColumns());
      return toInfo(row);
    } catch (err) {
      this.logger.warn(`No se ha podido leer el texto del documento ${stored.id}: ${err instanceof Error ? err.message : String(err)}`);
      return {
        ...stored,
        ocrWarning:
          err instanceof ServiceUnavailableException
            ? 'El documento se ha guardado, pero el reconocimiento de texto no está configurado: no se podrá buscar en su texto.'
            : 'El documento se ha guardado, pero no se ha podido leer su texto. Puedes volver a intentarlo más tarde.',
      };
    }
  }

  /**
   * Spec 051 H3 criterio 3: vuelve a leer el texto del documento de un
   * ticket (los anteriores a la spec 051 no lo tienen). Sin Vision
   * configurado, 503; si Vision falla, 502 con un mensaje claro.
   */
  async readText(userId: string, receiptId: string): Promise<DocumentText> {
    const document = await this.getContent(userId, receiptId);
    let text: string;
    try {
      text = await this.ocr.extractText(document.content, document.mimeType);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`No se ha podido leer el texto del documento ${document.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('No se ha podido leer el texto del documento. Inténtalo de nuevo más tarde.');
    }
    const [row] = await this.db
      .update(receiptDocuments)
      .set(textColumns(text))
      .where(eq(receiptDocuments.id, document.id))
      .returning({ text: receiptDocuments.ocrText, readAt: receiptDocuments.ocrReadAt });
    return row;
  }

  /** Spec 051 H3 criterio 5: el texto guardado, aparte del detalle para no inflarlo. */
  async getText(userId: string, receiptId: string): Promise<DocumentText> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    const [row] = await this.db
      .select({ text: receiptDocuments.ocrText, readAt: receiptDocuments.ocrReadAt })
      .from(receiptDocuments)
      .where(and(eq(receiptDocuments.receiptId, receiptId), eq(receiptDocuments.userId, userId)));
    if (!row) throw new NotFoundException('Este ticket no tiene documento.');
    return row;
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
    return { ...toInfo(row), content: row.content };
  }

  /** Metadatos (sin contenido) de los documentos de varios tickets del usuario, por id de ticket. */
  async infoByReceipt(userId: string, receiptIds: string[]): Promise<Map<string, DocumentInfo>> {
    if (receiptIds.length === 0) return new Map();
    const rows = await this.db
      .select({ ...this.infoColumns(), receiptId: receiptDocuments.receiptId })
      .from(receiptDocuments)
      .where(and(eq(receiptDocuments.userId, userId), inArray(receiptDocuments.receiptId, receiptIds)));
    return new Map(rows.map(({ receiptId, ...info }) => [receiptId!, toInfo(info)]));
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
      ocrTextLength: sql<number | null>`length(${receiptDocuments.ocrText})`,
      textReadAt: receiptDocuments.ocrReadAt,
    };
  }
}

/** Texto reconocido, sin espacios sobrantes a los lados, y cuándo se leyó. */
function textColumns(text: string) {
  return { ocrText: text.trim(), ocrReadAt: new Date() };
}

/** Las columnas de `infoColumns` como `DocumentInfo` (el texto nunca se trae entero aquí). */
function toInfo(row: { id: string; mimeType: string; sizeBytes: number; pageCount: number | null; originalFilename: string; ocrTextLength: number | null; textReadAt: Date | null }): DocumentInfo {
  const { ocrTextLength, ...info } = row;
  return { ...info, hasText: (ocrTextLength ?? 0) > 0 };
}
