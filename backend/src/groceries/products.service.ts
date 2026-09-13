import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, supermarkets } from '../db/schema/index.js';
import { normalizeText } from '../common/normalize-text.util.js';

export type Product = typeof products.$inferSelect;

export interface ProductPrice {
  receiptId: string;
  supermarketId: string;
  supermarketName: string;
  date: string;
  unit: string;
  pricePerUnit: string;
  /** Spec 037, plan.md §1: importe de la línea — para "gasto total" (H1 criterio 3). */
  amount: string;
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

  /** Spec 036, plan.md §2 (H2). */
  async getById(userId: string, id: string): Promise<Product> {
    const [product] = await this.db.select().from(products).where(and(eq(products.id, id), eq(products.userId, userId)));
    if (!product) throw new NotFoundException('El producto indicado no existe.');
    return product;
  }

  /**
   * Spec 036, plan.md §2 (H3). Bloquea si el nombre normalizado ya lo usa
   * otro producto del usuario (409) — no fusiona (spec.md H3 criterio 2,
   * mismo criterio que spec 034 §3).
   */
  async update(userId: string, id: string, name: string): Promise<Product> {
    await this.getById(userId, id);

    const ownProducts = await this.db.select().from(products).where(eq(products.userId, userId));
    const normalized = normalizeText(name);
    const duplicate = ownProducts.find((p) => p.id !== id && normalizeText(p.name) === normalized);
    if (duplicate) throw new ConflictException('Ya tienes otro producto con ese nombre.');

    const [updated] = await this.db.update(products).set({ name }).where(eq(products.id, id)).returning();
    return updated;
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
        amount: line.amount,
      };
    });

    return prices.sort((a, b) => new Decimal(a.pricePerUnit).comparedTo(new Decimal(b.pricePerUnit)));
  }
}
