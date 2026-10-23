import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, receiptLines, receipts, shoppingListItems, supermarkets } from '../db/schema/index.js';
import { normalizeText } from '../common/normalize-text.util.js';

export type Product = typeof products.$inferSelect;

/** Spec 042, plan.md §1: precio más bajo entre los precios más recientes de cada supermercado (H1). */
export interface ProductLowestPrice {
  pricePerUnit: string;
  unit: string;
  supermarketId: string;
  supermarketName: string;
}

export interface ProductSummary {
  id: string;
  name: string;
  lowestRecentPrice: ProductLowestPrice | null;
}

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

  /**
   * Spec 042, plan.md §1 (H1): cada producto gana `lowestRecentPrice` — se
   * calcula aquí, en una sola pasada, en vez de con una petición extra por
   * producto desde el cliente (a diferencia del simulador de cesta, spec
   * 039, esto se llama en cada carga/búsqueda del listado, no como una
   * acción puntual).
   */
  async search(userId: string, search?: string): Promise<ProductSummary[]> {
    const conditions = [eq(products.userId, userId)];
    if (search) conditions.push(ilike(products.name, `%${search}%`));
    const productRows = await this.db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name));
    if (productRows.length === 0) return [];

    const lineRows = await this.db.select().from(receiptLines).where(
      inArray(
        receiptLines.productId,
        productRows.map((p) => p.id),
      ),
    );
    if (lineRows.length === 0) return productRows.map((p) => ({ id: p.id, name: p.name, lowestRecentPrice: null }));

    const receiptRows = await this.db.select().from(receipts).where(
      inArray(
        receipts.id,
        [...new Set(lineRows.map((line) => line.receiptId))],
      ),
    );
    const receiptById = new Map(receiptRows.map((r) => [r.id, r]));

    const supermarketRows = await this.db.select().from(supermarkets).where(
      inArray(
        supermarkets.id,
        [...new Set(receiptRows.map((r) => r.supermarketId))],
      ),
    );
    const supermarketById = new Map(supermarketRows.map((s) => [s.id, s]));

    const linesByProduct = new Map<string, typeof lineRows>();
    for (const line of lineRows) {
      // Spec 048: la consulta ya filtra por producto, pero el tipo admite `null`.
      if (line.productId === null) continue;
      const lines = linesByProduct.get(line.productId) ?? [];
      lines.push(line);
      linesByProduct.set(line.productId, lines);
    }

    return productRows.map((product) => ({
      id: product.id,
      name: product.name,
      lowestRecentPrice: this.lowestRecentPrice(linesByProduct.get(product.id) ?? [], receiptById, supermarketById),
    }));
  }

  /**
   * Spec 042, plan.md §1: para cada supermercado, su línea de fecha más
   * reciente (mismo criterio que `latestPricesBySupermarket` del simulador
   * de cesta, frontend, spec 039); de esas, la de `pricePerUnit` más bajo.
   */
  private lowestRecentPrice(
    lines: (typeof receiptLines.$inferSelect)[],
    receiptById: Map<string, typeof receipts.$inferSelect>,
    supermarketById: Map<string, typeof supermarkets.$inferSelect>,
  ): ProductLowestPrice | null {
    const latestBySupermarket = new Map<string, { date: string; pricePerUnit: string; unit: string }>();
    for (const line of lines) {
      const receipt = receiptById.get(line.receiptId);
      if (!receipt) continue;
      const current = latestBySupermarket.get(receipt.supermarketId);
      if (!current || receipt.date > current.date) {
        latestBySupermarket.set(receipt.supermarketId, { date: receipt.date, pricePerUnit: line.pricePerUnit, unit: line.unit });
      }
    }

    let best: { supermarketId: string; pricePerUnit: string; unit: string } | null = null;
    for (const [supermarketId, entry] of latestBySupermarket) {
      if (!best || new Decimal(entry.pricePerUnit).lessThan(best.pricePerUnit)) {
        best = { supermarketId, pricePerUnit: entry.pricePerUnit, unit: entry.unit };
      }
    }
    if (!best) return null;

    return {
      pricePerUnit: best.pricePerUnit,
      unit: best.unit,
      supermarketId: best.supermarketId,
      supermarketName: supermarketById.get(best.supermarketId)!.name,
    };
  }

  /** Spec 036, plan.md §2 (H2). */
  async getById(userId: string, id: string): Promise<Product> {
    const [product] = await this.db.select().from(products).where(and(eq(products.id, id), eq(products.userId, userId)));
    if (!product) throw new NotFoundException('El producto indicado no existe.');
    return product;
  }

  /**
   * Spec 041, plan.md §1 (H1). Mismo criterio de duplicados que `update()`
   * (nombre normalizado) — a diferencia de ahí, el 409 no lleva
   * `duplicateProductId`: no hay nada que "fusionar" con un producto que
   * nunca ha llegado a crearse.
   */
  async create(userId: string, name: string): Promise<Product> {
    const duplicate = await this.findDuplicateByName(userId, name);
    if (duplicate) throw new ConflictException('Ya tienes un producto con ese nombre.');

    const [created] = await this.db.insert(products).values({ userId, name }).returning();
    return created;
  }

  /**
   * Spec 036, plan.md §2 (H3). Bloquea si el nombre normalizado ya lo usa
   * otro producto del usuario (409) — no fusiona (spec.md H3 criterio 2,
   * mismo criterio que spec 034 §3).
   */
  async update(userId: string, id: string, name: string): Promise<Product> {
    await this.getById(userId, id);

    const duplicate = await this.findDuplicateByName(userId, name, id);
    if (duplicate) {
      // Spec 038 (H2): se manda el id del duplicado en el cuerpo del error para
      // que el frontend pueda ofrecer "fusionar con ese producto" en vez de solo
      // bloquear — mismo `ConflictException`, cuerpo enriquecido.
      throw new ConflictException({
        message: 'Ya tienes otro producto con ese nombre.',
        duplicateProductId: duplicate.id,
      });
    }

    const [updated] = await this.db.update(products).set({ name }).where(eq(products.id, id)).returning();
    return updated;
  }

  /** Spec 041, plan.md §1: comparación de nombre normalizado, compartida entre `create()` y `update()`. */
  private async findDuplicateByName(userId: string, name: string, excludeId?: string): Promise<Product | undefined> {
    const ownProducts = await this.db.select().from(products).where(eq(products.userId, userId));
    const normalized = normalizeText(name);
    return ownProducts.find((p) => p.id !== excludeId && normalizeText(p.name) === normalized);
  }

  /**
   * Spec 038, H1: fusiona uno o varios productos ("perdedores") en el
   * `survivorId` ("superviviente") — reasigna sus líneas de ticket y los
   * borra. `receiptLines.productId` es `restrict`, así que hay que reasignar
   * antes de borrar; transacción para que sea atómico (mismo patrón que
   * `ReceiptsService.update`).
   */
  async merge(userId: string, survivorId: string, mergedIds: string[]): Promise<Product> {
    const ids = [...new Set(mergedIds)].filter((mergedId) => mergedId !== survivorId);
    if (ids.length === 0) throw new BadRequestException('No hay ningún producto que fusionar.');

    const rows = await this.db
      .select()
      .from(products)
      .where(and(eq(products.userId, userId), inArray(products.id, [survivorId, ...ids])));
    const rowById = new Map(rows.map((p) => [p.id, p]));
    if (!rowById.has(survivorId)) throw new NotFoundException('El producto indicado no existe.');
    for (const mergedId of ids) {
      if (!rowById.has(mergedId)) throw new NotFoundException('El producto indicado no existe.');
    }

    await this.db.transaction(async (tx) => {
      await tx.update(receiptLines).set({ productId: survivorId }).where(inArray(receiptLines.productId, ids));

      // Spec 039, plan.md §3: `shoppingListItems.productId` también cascadea
      // sobre `products` — sin esto, un producto fusionado desaparecería en
      // silencio de cualquier lista de la compra que lo tuviera. Secuencial
      // (no en paralelo): si dos productos fusionados están en la misma
      // lista, el primero reasigna su item al superviviente y el segundo lo
      // encuentra ya presente y se borra en vez de violar el índice único
      // (shoppingListId, productId).
      const affectedItems = await tx.select().from(shoppingListItems).where(inArray(shoppingListItems.productId, ids));
      for (const item of affectedItems) {
        const [existing] = await tx
          .select()
          .from(shoppingListItems)
          .where(and(eq(shoppingListItems.shoppingListId, item.shoppingListId), eq(shoppingListItems.productId, survivorId)));
        if (existing) {
          await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id));
        } else {
          await tx.update(shoppingListItems).set({ productId: survivorId }).where(eq(shoppingListItems.id, item.id));
        }
      }

      await tx.delete(products).where(inArray(products.id, ids));
    });

    return rowById.get(survivorId)!;
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
