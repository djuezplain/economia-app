import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';

export type Product = typeof products.$inferSelect;

export interface ProductPrice {
  receiptId: string;
  supermarketId: string;
  supermarketName: string;
  date: string;
  unit: string;
  pricePerUnit: string;
}

/**
 * Spec 034, plan.md §3. Mismo criterio que el resto del proyecto (sin joins
 * SQL en ningún sitio, p. ej. `stock-import.service.ts`): se consultan las
 * tablas por separado y se combinan en JS — a esta escala (datos de un solo
 * usuario, uso personal) no hay necesidad real de un `innerJoin`.
 */
@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search(userId: string, search?: string): Promise<Product[]> {
    const conditions = [eq(products.userId, userId)];
    if (search) conditions.push(ilike(products.name, `%${search}%`));
    return this.db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name));
  }

  /** H4 criterio 3: precio de un producto en cada supermercado/fecha, de más barato a más caro. */
  async getPrices(userId: string, productId: string): Promise<ProductPrice[]> {
    const [product] = await this.db.select().from(products).where(and(eq(products.id, productId), eq(products.userId, userId)));
    if (!product) throw new NotFoundException('El producto indicado no existe.');

    const lines = await this.db.select().from(receiptLines).where(eq(receiptLines.productId, productId));
    if (lines.length === 0) return [];

    const receiptIds = [...new Set(lines.map((line) => line.receiptId))];
    const receiptRows = await this.db.select().from(receipts).where(inArray(receipts.id, receiptIds));
    const receiptById = new Map(receiptRows.map((r) => [r.id, r]));

    const supermarketIds = [...new Set(receiptRows.map((r) => r.supermarketId))];
    const supermarketRows = await this.db.select().from(supermarkets).where(inArray(supermarkets.id, supermarketIds));
    const supermarketById = new Map(supermarketRows.map((s) => [s.id, s]));

    const prices: ProductPrice[] = lines.map((line) => {
      const receipt = receiptById.get(line.receiptId)!;
      const supermarket = supermarketById.get(receipt.supermarketId)!;
      return {
        receiptId: line.receiptId,
        supermarketId: supermarket.id,
        supermarketName: supermarket.name,
        date: receipt.date,
        unit: line.unit,
        pricePerUnit: line.pricePerUnit,
      };
    });

    return prices.sort((a, b) => new Decimal(a.pricePerUnit).comparedTo(new Decimal(b.pricePerUnit)));
  }
}
