import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';
import type { ConfirmReceiptDto } from '../receipt-import/dto/confirm-receipt.dto.js';
import { resolveEntityRef } from '../receipt-import/resolve-entity-ref.util.js';
import type { ListReceiptsQueryDto } from './dto/list-receipts-query.dto.js';

export interface ReceiptSummary {
  id: string;
  date: string;
  supermarketId: string;
  supermarketName: string;
  printedTotal: string | null;
  /** Spec 040, plan.md §2: suma real de las líneas — el importe usado para filtrar (H1 criterio 4), no `printedTotal` (puede ser `null`). */
  linesTotal: string;
}

export interface ReceiptLineDetail {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  amount: string;
  productId: string;
  productName: string;
}

export interface ReceiptDetail extends ReceiptSummary {
  lines: ReceiptLineDetail[];
}

/** Spec 034, plan.md §3 (H5). Mismo criterio "sin joins SQL" que `ProductsService`. */
@Injectable()
export class ReceiptsService {
  constructor(@Inject(DB) private readonly db: Database) {}

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
        // Presencia del producto filtrado, para el filtro de `productId` (T1.3) — se calcula
        // aquí porque `lines` ya está disponible, se descarta abajo si no se necesita.
        hasFilteredProduct: query.productId ? lines.some((line) => line.productId === query.productId) : true,
      };
    });

    return summaries
      .filter((summary) => summary.hasFilteredProduct)
      .filter((summary) => !query.amountMin || new Decimal(summary.linesTotal).greaterThanOrEqualTo(query.amountMin))
      .filter((summary) => !query.amountMax || new Decimal(summary.linesTotal).lessThanOrEqualTo(query.amountMax))
      .map(({ hasFilteredProduct: _hasFilteredProduct, ...summary }) => summary);
  }

  async getById(userId: string, receiptId: string): Promise<ReceiptDetail> {
    const [receipt] = await this.db.select().from(receipts).where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));
    if (!receipt) throw new NotFoundException('El ticket indicado no existe.');

    const [supermarket] = await this.db.select().from(supermarkets).where(eq(supermarkets.id, receipt.supermarketId));

    const lineRows = await this.db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const productIds = [...new Set(lineRows.map((line) => line.productId))];
    const productRows = productIds.length > 0 ? await this.db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productById = new Map(productRows.map((p) => [p.id, p]));

    return {
      id: receipt.id,
      date: receipt.date,
      supermarketId: receipt.supermarketId,
      supermarketName: supermarket.name,
      printedTotal: receipt.printedTotal,
      linesTotal: lineRows.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2),
      lines: lineRows.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        pricePerUnit: line.pricePerUnit,
        amount: line.amount,
        productId: line.productId,
        productName: productById.get(line.productId)!.name,
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
          const productId = await resolveEntityRef(tx, products, userId, line.product, 'El producto indicado no existe.');
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
}
