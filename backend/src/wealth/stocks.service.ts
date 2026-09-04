import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stocks } from '../db/schema/index.js';
import type { CreateStockDto } from './dto/create-stock.dto.js';
import type { UpdateStockDto } from './dto/update-stock.dto.js';

export type Stock = typeof stocks.$inferSelect;

/**
 * H1 (spec 020). Igual que `BankAccountsService` (spec 019): ningún método
 * acepta una consulta sin `userId` explícito, y "misma acción dos veces" se
 * comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class StocksService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Stock[]> {
    return this.db.query.stocks.findMany({ where: eq(stocks.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe una acción con el mismo banco custodia + acción. */
  async create(userId: string, dto: CreateStockDto): Promise<Stock> {
    await this.assertNotDuplicate(userId, dto.custodyBank, dto.stock);

    const [stock] = await this.db.insert(stocks).values({ userId, custodyBank: dto.custodyBank, stock: dto.stock }).returning();
    return stock;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia banco custodia/acción. */
  async update(userId: string, id: string, dto: UpdateStockDto): Promise<Stock> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.custodyBank !== undefined || dto.stock !== undefined) {
      await this.assertNotDuplicate(userId, dto.custodyBank ?? existing.custodyBank, dto.stock ?? existing.stock, id);
    }

    const [updated] = await this.db
      .update(stocks)
      .set({
        ...(dto.custodyBank !== undefined && { custodyBank: dto.custodyBank }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        updatedAt: new Date(),
      })
      .where(eq(stocks.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: los historiales de compras y valoraciones se borran en cascada (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stocks).where(eq(stocks.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<Stock> {
    const stock = await this.db.query.stocks.findFirst({ where: and(eq(stocks.id, id), eq(stocks.userId, userId)) });
    if (!stock) {
      throw new NotFoundException('Acción no encontrada.');
    }
    return stock;
  }

  private async assertNotDuplicate(userId: string, custodyBank: string, stock: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.stocks.findFirst({
      where: and(
        eq(stocks.userId, userId),
        eq(stocks.custodyBank, custodyBank),
        eq(stocks.stock, stock),
        ...(excludeId ? [ne(stocks.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException('Ya tienes registrada esa acción (mismo banco custodia y acción). Añade la compra o valoración dentro de ella.');
    }
  }
}
