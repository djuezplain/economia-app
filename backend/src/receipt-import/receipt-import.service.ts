import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';
import { ConfirmReceiptDto, EntityRefDto } from './dto/confirm-receipt.dto.js';
import { detectDate, detectPrintedTotal, extractProductLines, guessSupermarketName, matchByNormalizedName } from './receipt-import.parsing.js';
import type { NamedEntity } from './receipt-import.parsing.js';
import { ReceiptOcrService } from './receipt-ocr.service.js';
import type { ReceiptPreview, ReceiptPreviewLine } from './receipt-import.types.js';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

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
  ) {}

  /** H1: no escribe nada — solo reconoce y sugiere. */
  async preview(userId: string, imageBuffer: Buffer): Promise<ReceiptPreview> {
    const text = await this.ocrService.extractText(imageBuffer);

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

    return {
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
  async confirm(userId: string, dto: ConfirmReceiptDto): Promise<{ receiptId: string }> {
    try {
      return await this.db.transaction(async (tx) => {
        const supermarketId = await this.resolveRef(tx, supermarkets, userId, dto.supermarket, 'El supermercado indicado no existe.');
        const [receipt] = await tx
          .insert(receipts)
          .values({ userId, supermarketId, date: dto.date, printedTotal: dto.printedTotal ?? null })
          .returning();

        for (const line of dto.lines) {
          const productId = await this.resolveRef(tx, products, userId, line.product, 'El producto indicado no existe.');
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

  /** plan.md §8-§9: `{ id }` existente (verificado que pertenece al usuario) o `{ name }` nuevo. */
  private async resolveRef(
    tx: Executor,
    table: typeof supermarkets | typeof products,
    userId: string,
    ref: EntityRefDto,
    notFoundMessage: string,
  ): Promise<string> {
    const t = table as typeof supermarkets;
    if (ref.id) {
      const [row] = await tx.select({ id: t.id }).from(t).where(and(eq(t.id, ref.id), eq(t.userId, userId)));
      if (!row) throw new NotFoundException(notFoundMessage);
      return row.id;
    }
    if (ref.name) {
      const [created] = await tx.insert(t).values({ userId, name: ref.name }).returning({ id: t.id });
      return created.id;
    }
    throw new BadRequestException('Falta el id o el nombre de la entidad indicada.');
  }
}
