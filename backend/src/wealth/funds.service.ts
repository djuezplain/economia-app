import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { funds } from '../db/schema/index.js';
import type { CreateFundDto } from './dto/create-fund.dto.js';
import type { UpdateFundDto } from './dto/update-fund.dto.js';

export type Fund = typeof funds.$inferSelect;

/**
 * H1 (spec 021). Igual que `StocksService` (spec 020): ningún método acepta
 * una consulta sin `userId` explícito, y "mismo fondo dos veces" se
 * comprueba aquí (409), no con una constraint SQL.
 */
@Injectable()
export class FundsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Fund[]> {
    return this.db.query.funds.findMany({ where: eq(funds.userId, userId) });
  }

  /** H1 criterio 2: 409 si ya existe un fondo con el mismo banco custodia + fondo. */
  async create(userId: string, dto: CreateFundDto): Promise<Fund> {
    await this.assertNotDuplicate(userId, dto.custodyBank, dto.fund);

    const [fund] = await this.db.insert(funds).values({ userId, custodyBank: dto.custodyBank, fund: dto.fund }).returning();
    return fund;
  }

  /** H1 criterio 3: editable, repitiendo la comprobación de unicidad si cambia banco custodia/fondo. */
  async update(userId: string, id: string, dto: UpdateFundDto): Promise<Fund> {
    const existing = await this.findOwnOrThrow(userId, id);

    if (dto.custodyBank !== undefined || dto.fund !== undefined) {
      await this.assertNotDuplicate(userId, dto.custodyBank ?? existing.custodyBank, dto.fund ?? existing.fund, id);
    }

    const [updated] = await this.db
      .update(funds)
      .set({
        ...(dto.custodyBank !== undefined && { custodyBank: dto.custodyBank }),
        ...(dto.fund !== undefined && { fund: dto.fund }),
        updatedAt: new Date(),
      })
      .where(eq(funds.id, id))
      .returning();
    return updated;
  }

  /** H1 criterio 4: los historiales de compras y valoraciones se borran en cascada (ON DELETE CASCADE). */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(funds).where(eq(funds.id, id));
  }

  async findOwnOrThrow(userId: string, id: string): Promise<Fund> {
    const fund = await this.db.query.funds.findFirst({ where: and(eq(funds.id, id), eq(funds.userId, userId)) });
    if (!fund) {
      throw new NotFoundException('Fondo no encontrado.');
    }
    return fund;
  }

  private async assertNotDuplicate(userId: string, custodyBank: string, fund: string, excludeId?: string): Promise<void> {
    const existing = await this.db.query.funds.findFirst({
      where: and(
        eq(funds.userId, userId),
        eq(funds.custodyBank, custodyBank),
        eq(funds.fund, fund),
        ...(excludeId ? [ne(funds.id, excludeId)] : []),
      ),
    });
    if (existing) {
      throw new ConflictException('Ya tienes registrado ese fondo (mismo banco custodia y fondo). Añade la compra o valoración dentro de él.');
    }
  }
}
