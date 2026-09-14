import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { products, shoppingListItems, shoppingLists } from '../db/schema/index.js';
import { isUniqueViolation } from '../common/db-errors.util.js';

export type ShoppingList = typeof shoppingLists.$inferSelect;

export interface ShoppingListSummary {
  id: string;
  name: string;
  itemCount: number;
  createdAt: Date;
}

export interface ShoppingListItemDetail {
  id: string;
  productId: string;
  productName: string;
}

export interface ShoppingListDetail {
  id: string;
  name: string;
  createdAt: Date;
  items: ShoppingListItemDetail[];
}

/**
 * Spec 039, plan.md §2. Mismo criterio que `ProductsService` (spec 034):
 * sin joins SQL, se consultan las tablas por separado y se combinan en JS —
 * a esta escala (datos de un solo usuario) no hace falta más.
 */
@Injectable()
export class ShoppingListsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** H1 criterio 3: más reciente primero. */
  async list(userId: string): Promise<ShoppingListSummary[]> {
    const lists = await this.db.select().from(shoppingLists).where(eq(shoppingLists.userId, userId)).orderBy(desc(shoppingLists.createdAt));
    if (lists.length === 0) return [];

    const items = await this.db
      .select({ shoppingListId: shoppingListItems.shoppingListId })
      .from(shoppingListItems)
      .where(
        inArray(
          shoppingListItems.shoppingListId,
          lists.map((list) => list.id),
        ),
      );
    const countByList = new Map<string, number>();
    for (const item of items) countByList.set(item.shoppingListId, (countByList.get(item.shoppingListId) ?? 0) + 1);

    return lists.map((list) => ({ id: list.id, name: list.name, itemCount: countByList.get(list.id) ?? 0, createdAt: list.createdAt }));
  }

  /** H1 criterio 1. */
  async create(userId: string, name: string): Promise<ShoppingList> {
    const [list] = await this.db.insert(shoppingLists).values({ userId, name }).returning();
    return list;
  }

  /** H1: detalle con los productos ya añadidos, por nombre (plan.md §2). */
  async getById(userId: string, id: string): Promise<ShoppingListDetail> {
    const list = await this.findOwnOrThrow(userId, id);
    const items = await this.db.select().from(shoppingListItems).where(eq(shoppingListItems.shoppingListId, id));
    if (items.length === 0) return { id: list.id, name: list.name, createdAt: list.createdAt, items: [] };

    const productRows = await this.db.select().from(products).where(
      inArray(
        products.id,
        items.map((item) => item.productId),
      ),
    );
    const productById = new Map(productRows.map((product) => [product.id, product]));

    const detailItems = items
      .map((item) => ({ id: item.id, productId: item.productId, productName: productById.get(item.productId)?.name ?? '' }))
      .sort((a, b) => a.productName.localeCompare(b.productName));

    return { id: list.id, name: list.name, createdAt: list.createdAt, items: detailItems };
  }

  /** H1 criterio 2: renombrar. */
  async update(userId: string, id: string, name: string): Promise<ShoppingList> {
    await this.findOwnOrThrow(userId, id);
    const [updated] = await this.db.update(shoppingLists).set({ name }).where(eq(shoppingLists.id, id)).returning();
    return updated;
  }

  /** H1 criterio 2: sus items se borran en cascada (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(shoppingLists).where(eq(shoppingLists.id, id));
  }

  /**
   * H1 criterio 2: añade un producto del catálogo del propio usuario a la
   * lista. 404 si el producto no existe o no es suyo; 409 si ya está en la
   * lista (índice único `shopping_list_items_list_product_unique`,
   * H1 criterio 4) — se deja que la constraint SQL sea la fuente de verdad
   * en vez de comprobarlo antes con una consulta aparte (misma condición de
   * carrera que evita `isUniqueViolation` en el resto del proyecto).
   */
  async addItem(userId: string, shoppingListId: string, productId: string): Promise<ShoppingListItemDetail> {
    await this.findOwnOrThrow(userId, shoppingListId);
    const [product] = await this.db.select().from(products).where(and(eq(products.id, productId), eq(products.userId, userId)));
    if (!product) throw new NotFoundException('El producto indicado no existe.');

    try {
      const [item] = await this.db.insert(shoppingListItems).values({ shoppingListId, productId }).returning();
      return { id: item.id, productId: item.productId, productName: product.name };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ese producto ya está en la lista.');
      throw err;
    }
  }

  /** H1 criterio 2: quita un producto de la lista. 404 si la lista o el item no son del usuario. */
  async removeItem(userId: string, shoppingListId: string, itemId: string): Promise<void> {
    await this.findOwnOrThrow(userId, shoppingListId);
    const [item] = await this.db
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.shoppingListId, shoppingListId)));
    if (!item) throw new NotFoundException('El producto indicado no está en esta lista.');
    await this.db.delete(shoppingListItems).where(eq(shoppingListItems.id, itemId));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<ShoppingList> {
    const [list] = await this.db.select().from(shoppingLists).where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId)));
    if (!list) throw new NotFoundException('La lista de la compra indicada no existe.');
    return list;
  }
}
