import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets, transactions } from '../db/schema/index.js';
import { isUniqueViolation } from '../common/db-errors.util.js';
import { LINK_DAYS_AFTER, LINK_DAYS_BEFORE, rankLinkCandidates } from './receipt-link.js';
import type { ConfirmReceiptDto } from '../receipt-import/dto/confirm-receipt.dto.js';
import { resolveEntityRef } from '../receipt-import/resolve-entity-ref.util.js';
import { assertReceiptHasAmount, resolveLineProduct } from '../receipt-import/receipt-rules.js';
import { receiptTotal } from './receipt-total.js';
import type { ListReceiptsQueryDto } from './dto/list-receipts-query.dto.js';
import type { UpdateReceiptDetailsDto } from './dto/receipt-details.dto.js';
import { ReceiptDocumentsService } from './receipt-documents.service.js';
import type { DocumentInfo } from './receipt-documents.service.js';
import { ReceiptTagsService } from './receipt-tags.service.js';
import type { ReceiptTag } from './receipt-tags.service.js';

export interface ReceiptSummary {
  id: string;
  date: string;
  supermarketId: string;
  supermarketName: string;
  printedTotal: string | null;
  /** Spec 040, plan.md §2: suma real de las líneas — el importe usado para filtrar (H1 criterio 4), no `printedTotal` (puede ser `null`). */
  linesTotal: string;
  /**
   * Spec 048 plan.md §0 decisión 6: el importe del ticket (suma de líneas o,
   * sin líneas, el total impreso). Es el que usa el filtro por importe.
   */
  total: string | null;
  /** Spec 048 H3: el movimiento enlazado, o `null`. */
  transactionId: string | null;
  /** Spec 048 H1: metadatos del documento original (sin el contenido), o `null` si no tiene. */
  document: DocumentInfo | null;
  /** Spec 051 H1: sus etiquetas, por nombre. */
  tags: ReceiptTag[];
  /** Spec 051 H4 criterio 2: el listado solo indica si hay nota; el detalle la trae entera. */
  hasNote: boolean;
  /** Spec 051 H5: fin de la garantía, o `null`. */
  warrantyUntil: string | null;
}

export interface ReceiptLineDetail {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  amount: string;
  /** Spec 048 H2 criterio 4: `null` = línea sin emparejar con ningún producto. */
  productId: string | null;
  productName: string | null;
}

export interface ReceiptDetail extends ReceiptSummary {
  lines: ReceiptLineDetail[];
  note: string | null;
}

/** Spec 034, plan.md §3 (H5). Mismo criterio "sin joins SQL" que `ProductsService`. */
@Injectable()
export class ReceiptsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly documents: ReceiptDocumentsService,
    private readonly tags: ReceiptTagsService,
  ) {}

  /**
   * Spec 040, plan.md §2 (H1): filtros de `query`, todos opcionales y
   * combinables con Y lógico (criterio 5). `supermarketId`/`dateFrom`/
   * `dateTo` se aplican como condiciones SQL sobre `receipts`;
   * `productId`/`amountMin`/`amountMax` se aplican en JS tras traer las
   * líneas relacionadas — mismo criterio "sin joins SQL" que el resto del
   * módulo (`ProductsService.getPrices`).
   */
  async list(userId: string, query: ListReceiptsQueryDto = {}): Promise<ReceiptSummary[]> {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException('El rango de fechas no es válido: "dateFrom" es posterior a "dateTo".');
    }
    if (query.amountMin && query.amountMax && new Decimal(query.amountMin).greaterThan(query.amountMax)) {
      throw new BadRequestException('El rango de importe no es válido: "amountMin" es mayor que "amountMax".');
    }

    const conditions = [eq(receipts.userId, userId)];
    if (query.supermarketId) conditions.push(eq(receipts.supermarketId, query.supermarketId));
    if (query.dateFrom) conditions.push(gte(receipts.date, query.dateFrom));
    if (query.dateTo) conditions.push(lte(receipts.date, query.dateTo));

    const receiptRows = await this.db
      .select()
      .from(receipts)
      .where(and(...conditions))
      .orderBy(desc(receipts.date));
    if (receiptRows.length === 0) return [];

    const supermarketIds = [...new Set(receiptRows.map((r) => r.supermarketId))];
    const supermarketRows = await this.db.select().from(supermarkets).where(inArray(supermarkets.id, supermarketIds));
    const supermarketById = new Map(supermarketRows.map((s) => [s.id, s]));

    const lineRows = await this.db
      .select()
      .from(receiptLines)
      .where(
        inArray(
          receiptLines.receiptId,
          receiptRows.map((r) => r.id),
        ),
      );
    const documentByReceipt = await this.documents.infoByReceipt(
      userId,
      receiptRows.map((r) => r.id),
    );
    const tagsByReceipt = await this.tags.byReceipt(
      this.db,
      receiptRows.map((r) => r.id),
    );
    const linesByReceipt = new Map<string, (typeof lineRows)[number][]>();
    for (const line of lineRows) {
      const lines = linesByReceipt.get(line.receiptId) ?? [];
      lines.push(line);
      linesByReceipt.set(line.receiptId, lines);
    }

    const summaries = receiptRows.map((receipt) => {
      const lines = linesByReceipt.get(receipt.id) ?? [];
      const linesTotal = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2);
      return {
        id: receipt.id,
        date: receipt.date,
        supermarketId: receipt.supermarketId,
        supermarketName: supermarketById.get(receipt.supermarketId)!.name,
        printedTotal: receipt.printedTotal,
        linesTotal,
        total: receiptTotal(lines, receipt.printedTotal),
        transactionId: receipt.transactionId,
        document: documentByReceipt.get(receipt.id) ?? null,
        tags: tagsByReceipt.get(receipt.id) ?? [],
        hasNote: receipt.note !== null,
        warrantyUntil: receipt.warrantyUntil,
        // Presencia del producto filtrado, para el filtro de `productId` (T1.3) — se calcula
        // aquí porque `lines` ya está disponible, se descarta abajo si no se necesita.
        hasFilteredProduct: query.productId ? lines.some((line) => line.productId === query.productId) : true,
      };
    });

    return summaries
      .filter((summary) => summary.hasFilteredProduct)
      // Spec 048: sobre `total`; para un ticket con líneas es su suma, igual que en la spec 040.
      .filter((summary) => !query.amountMin || (summary.total !== null && new Decimal(summary.total).greaterThanOrEqualTo(query.amountMin)))
      .filter((summary) => !query.amountMax || (summary.total !== null && new Decimal(summary.total).lessThanOrEqualTo(query.amountMax)))
      .map(({ hasFilteredProduct: _hasFilteredProduct, ...summary }) => summary);
  }

  /** Spec 051 H4 y H5: nota y garantía, sin tocar el resto del ticket (plan.md §3.2). */
  async updateDetails(userId: string, receiptId: string, dto: UpdateReceiptDetailsDto): Promise<ReceiptDetail> {
    const changes: { note?: string | null; warrantyUntil?: string | null } = {};
    if (dto.note !== undefined) changes.note = dto.note;
    if (dto.warrantyUntil !== undefined) changes.warrantyUntil = dto.warrantyUntil;
    const [owned] = await this.db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!owned) throw new NotFoundException('El ticket indicado no existe.');
    if (Object.keys(changes).length > 0) await this.db.update(receipts).set(changes).where(eq(receipts.id, receiptId));
    return this.getById(userId, receiptId);
  }

  async getById(userId: string, receiptId: string): Promise<ReceiptDetail> {
    const [receipt] = await this.db.select().from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!receipt) throw new NotFoundException('El ticket indicado no existe.');

    const [supermarket] = await this.db.select().from(supermarkets).where(eq(supermarkets.id, receipt.supermarketId));

    const lineRows = await this.db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const productIds = [...new Set(lineRows.map((line) => line.productId).filter((id): id is string => id !== null))];
    const productRows = productIds.length > 0 ? await this.db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productById = new Map(productRows.map((p) => [p.id, p]));
    const documentByReceipt = await this.documents.infoByReceipt(userId, [receipt.id]);
    const tagsByReceipt = await this.tags.byReceipt(this.db, [receipt.id]);

    return {
      id: receipt.id,
      date: receipt.date,
      supermarketId: receipt.supermarketId,
      supermarketName: supermarket.name,
      printedTotal: receipt.printedTotal,
      linesTotal: lineRows.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2),
      total: receiptTotal(lineRows, receipt.printedTotal),
      transactionId: receipt.transactionId,
      document: documentByReceipt.get(receipt.id) ?? null,
      tags: tagsByReceipt.get(receipt.id) ?? [],
      hasNote: receipt.note !== null,
      warrantyUntil: receipt.warrantyUntil,
      note: receipt.note,
      lines: lineRows.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        pricePerUnit: line.pricePerUnit,
        amount: line.amount,
        productId: line.productId,
        productName: line.productId === null ? null : productById.get(line.productId)!.name,
      })),
    };
  }

  /**
   * Spec 035, plan.md §3 (H2-H3). `PUT`, no `PATCH`: el cliente manda el
   * estado completo del ticket. Sustituye todas las líneas existentes en
   * vez de hacer un diff línea a línea — más simple, y el volumen de
   * líneas de un ticket (decenas, no miles) hace irrelevante el coste de
   * borrar+reinsertar.
   */
  async update(userId: string, receiptId: string, dto: ConfirmReceiptDto): Promise<ReceiptDetail> {
    assertReceiptHasAmount(dto);
    try {
      await this.db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
        if (!existing) throw new NotFoundException('El ticket indicado no existe.');

        const supermarketId = await resolveEntityRef(tx, supermarkets, userId, dto.supermarket, 'El supermercado indicado no existe.');
        await tx
          .update(receipts)
          .set({ date: dto.date, supermarketId, printedTotal: dto.printedTotal ?? null })
          .where(eq(receipts.id, receiptId));

        await tx.delete(receiptLines).where(eq(receiptLines.receiptId, receiptId));
        for (const line of dto.lines) {
          const productId = await resolveLineProduct(tx, userId, line.product);
          await tx.insert(receiptLines).values({
            receiptId,
            productId,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            pricePerUnit: line.pricePerUnit,
            amount: line.amount,
          });
        }
      });
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new BadRequestException(`No se ha podido guardar el ticket: ${message}`);
    }

    return this.getById(userId, receiptId);
  }

  /** Spec 035, plan.md §4 (H1). La cascada existente (`receipt_lines.receipt_id`, spec 034) se lleva las líneas. */
  async remove(userId: string, receiptId: string): Promise<void> {
    const [existing] = await this.db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!existing) throw new NotFoundException('El ticket indicado no existe.');
    await this.db.delete(receipts).where(eq(receipts.id, receiptId));
  }

  // --- Spec 048 H3: enlace con el movimiento ------------------------------
  // Ninguno de estos métodos crea ni modifica un movimiento (H3 criterio 6,
  // decisión de Diego): solo escriben `receipts.transaction_id`.

  /** H3 criterio 1: gastos sin ticket enlazado que pueden corresponder a este ticket, ordenados. */
  async linkCandidates(userId: string, receiptId: string): Promise<Array<typeof transactions.$inferSelect>> {
    const receipt = await this.findOwnReceiptOrThrow(userId, receiptId);
    const [shop] = await this.db.select({ name: supermarkets.name }).from(supermarkets).where(eq(supermarkets.id, receipt.supermarketId));
    const lines = await this.db.select({ amount: receiptLines.amount }).from(receiptLines).where(eq(receiptLines.receiptId, receiptId));

    const from = shiftDays(receipt.date, -LINK_DAYS_BEFORE);
    const to = shiftDays(receipt.date, LINK_DAYS_AFTER);
    const rows = await this.db
      .select({ transaction: transactions })
      .from(transactions)
      .leftJoin(receipts, eq(receipts.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'EXPENSE'),
          gte(transactions.date, from),
          lte(transactions.date, to),
          isNull(receipts.id),
        ),
      );

    return rankLinkCandidates(
      {
        date: receipt.date,
        printedTotal: receipt.printedTotal,
        linesTotal: lines.length > 0 ? receiptTotal(lines, null) : null,
        merchantName: shop.name,
      },
      rows.map((r) => r.transaction),
    );
  }

  /** H3 criterios 1 y 2: enlaza el ticket con un gasto del usuario, o cambia el enlace. */
  async linkTransaction(userId: string, receiptId: string, transactionId: string): Promise<ReceiptDetail> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    const [movement] = await this.db
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    if (!movement) throw new NotFoundException('El movimiento indicado no existe.');
    if (movement.type !== 'EXPENSE') throw new BadRequestException('Un ticket solo se puede enlazar con un gasto.');

    try {
      await this.db.update(receipts).set({ transactionId }).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    } catch (err) {
      // H3 criterio 3: un movimiento, como mucho un ticket (índice único).
      if (isUniqueViolation(err)) throw new ConflictException('Ese movimiento ya está enlazado a otro ticket.');
      throw err;
    }
    return this.getById(userId, receiptId);
  }

  /** H3: quita el enlace. Ni el ticket ni el movimiento se borran. */
  async unlinkTransaction(userId: string, receiptId: string): Promise<void> {
    await this.findOwnReceiptOrThrow(userId, receiptId);
    await this.db.update(receipts).set({ transactionId: null }).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
  }

  private async findOwnReceiptOrThrow(userId: string, receiptId: string) {
    const [receipt] = await this.db.select().from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!receipt) throw new NotFoundException('El ticket indicado no existe.');
    return receipt;
  }
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
