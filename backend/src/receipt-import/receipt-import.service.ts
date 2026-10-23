import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';
import type { ConfirmImportReceiptDto } from './dto/confirm-receipt.dto.js';
import { ReceiptDocumentsService } from '../groceries/receipt-documents.service.js';
import { detectDate, detectPrintedTotal, extractProductLines, guessSupermarketName, matchByNormalizedName } from './receipt-import.parsing.js';
import type { NamedEntity } from './receipt-import.parsing.js';
import { ReceiptOcrService } from './receipt-ocr.service.js';
import { resolveEntityRef } from './resolve-entity-ref.util.js';
import { assertReceiptHasAmount, resolveLineProduct } from './receipt-rules.js';
import type { ReceiptPreview, ReceiptPreviewLine } from './receipt-import.types.js';

/** Máximo de páginas que lee `files:annotate` de Vision en modo síncrono. */
const MAX_OCR_PDF_PAGES = 5;

/**
 * Spec 034 (H1-H5). A diferencia de `StockImportService` (spec 033),
 * `preview` y `confirm` no comparten la misma función de cálculo: el OCR no
 * es determinista, así que `confirm` no vuelve a leer la imagen — recibe el
 * `ConfirmReceiptDto` ya corregido por Diego (plan.md §7) como única fuente
 * de verdad.
 */
@Injectable()
export class ReceiptImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ocrService: ReceiptOcrService,
    private readonly documents: ReceiptDocumentsService,
  ) {}

  /**
   * H1: no escribe ningún ticket — solo reconoce y sugiere. Spec 048 H1
   * (plan.md §0 decisión 4): sí guarda el documento como pendiente, para no
   * tener que volver a subirlo al confirmar; si nadie confirma, se purga a
   * las 24 horas. Se guarda después del OCR, así un fallo de Vision no deja
   * un pendiente huérfano; y se guarda aunque el OCR no reconozca nada,
   * porque un ticket se puede guardar sin líneas.
   */
  async preview(userId: string, fileBuffer: Buffer, filename?: string): Promise<ReceiptPreview> {
    const prepared = await this.documents.prepare(fileBuffer, filename);
    const text = await this.ocrService.extractText(prepared.content, prepared.mimeType);

    const [existingSupermarkets, existingProducts] = await Promise.all([
      this.fetchNamedEntities(supermarkets, userId),
      this.fetchNamedEntities(products, userId),
    ]);

    const supermarketGuess = guessSupermarketName(text);
    const supermarketMatch = supermarketGuess ? matchByNormalizedName(supermarketGuess, existingSupermarkets) : null;

    const parsedLines = extractProductLines(text);
    const lines: ReceiptPreviewLine[] = parsedLines.map((line) => {
      const productMatch = matchByNormalizedName(line.description, existingProducts);
      return {
        description: line.description,
        quantity: line.quantity.toString(),
        unit: line.unit,
        pricePerUnit: line.pricePerUnit.toFixed(3),
        amount: line.amount.toFixed(2),
        product: {
          matchedId: 'matchedId' in productMatch ? productMatch.matchedId : null,
          suggestedName: line.description,
        },
      };
    });

    const linesTotal = parsedLines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2);
    const date = detectDate(text);
    const printedTotal = detectPrintedTotal(text);

    const warnings: string[] = [];
    if (lines.length === 0) warnings.push('No se ha podido reconocer ninguna línea de producto en la imagen.');
    if (!date) warnings.push('No se ha podido leer la fecha del ticket.');
    if (!printedTotal) warnings.push('No se ha podido leer el total del ticket.');
    // Spec 048 plan.md §3.2: Vision solo lee las 5 primeras páginas de un PDF.
    if (prepared.pageCount !== null && prepared.pageCount > MAX_OCR_PDF_PAGES) {
      warnings.push(`El PDF tiene ${prepared.pageCount} páginas: solo se han leído las ${MAX_OCR_PDF_PAGES} primeras. El documento se guarda entero.`);
    }

    const document = await this.documents.storePending(userId, prepared);

    return {
      document: { id: document.id, mimeType: document.mimeType, sizeBytes: document.sizeBytes, pageCount: document.pageCount },
      supermarket: supermarketMatch
        ? { matchedId: 'matchedId' in supermarketMatch ? supermarketMatch.matchedId : null, suggestedName: 'suggestedName' in supermarketMatch ? supermarketMatch.suggestedName : null }
        : { matchedId: null, suggestedName: null },
      date,
      printedTotal,
      linesTotal,
      lines,
      warnings,
    };
  }

  /** H2-H5: todo dentro de una única transacción — mismo criterio "todo o nada" que spec 033. */
  async confirm(userId: string, dto: ConfirmImportReceiptDto): Promise<{ receiptId: string }> {
    assertReceiptHasAmount(dto);
    try {
      return await this.db.transaction(async (tx) => {
        const supermarketId = await resolveEntityRef(tx, supermarkets, userId, dto.supermarket, 'El supermercado indicado no existe.');
        const [receipt] = await tx
          .insert(receipts)
          .values({ userId, supermarketId, date: dto.date, printedTotal: dto.printedTotal ?? null })
          .returning();

        for (const line of dto.lines) {
          const productId = await resolveLineProduct(tx, userId, line.product);
          await tx.insert(receiptLines).values({
            receiptId: receipt.id,
            productId,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            pricePerUnit: line.pricePerUnit,
            amount: line.amount,
          });
        }

        // Spec 048 H1 criterio 1: en la misma transacción — o se guardan
        // ticket y documento, o ninguno.
        if (dto.documentId) await this.documents.attachPending(tx, userId, dto.documentId, receipt.id);

        return { receiptId: receipt.id };
      });
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new BadRequestException(`No se ha podido guardar el ticket: ${message}`);
    }
  }

  private async fetchNamedEntities(table: typeof supermarkets | typeof products, userId: string): Promise<NamedEntity[]> {
    const rows = await this.db
      .select({ id: table.id, name: table.name })
      .from(table as typeof supermarkets)
      .where(eq((table as typeof supermarkets).userId, userId));
    return rows;
  }
}
