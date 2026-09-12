import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';

export interface ReceiptSummary {
  id: string;
  date: string;
  supermarketId: string;
  supermarketName: string;
  printedTotal: string | null;
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

  async list(userId: string): Promise<ReceiptSummary[]> {
    const receiptRows = await this.db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.date));
    if (receiptRows.length === 0) return [];

    const supermarketIds = [...new Set(receiptRows.map((r) => r.supermarketId))];
    const supermarketRows = await this.db.select().from(supermarkets).where(inArray(supermarkets.id, supermarketIds));
    const supermarketById = new Map(supermarketRows.map((s) => [s.id, s]));

    return receiptRows.map((receipt) => ({
      id: receipt.id,
      date: receipt.date,
      supermarketId: receipt.supermarketId,
      supermarketName: supermarketById.get(receipt.supermarketId)!.name,
      printedTotal: receipt.printedTotal,
    }));
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
}
