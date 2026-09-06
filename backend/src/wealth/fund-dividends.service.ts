import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { fundDividends, funds } from '../db/schema/index.js';
import { FundsService } from './funds.service.js';
import type { CreateFundDividendDto } from './dto/create-fund-dividend.dto.js';
import type { UpdateFundDividendDto } from './dto/update-fund-dividend.dto.js';

export type FundDividend = typeof fundDividends.$inferSelect;

/**
 * H1 (spec 029). `fundDividends` no lleva `userId` propio (esquema
 * normalizado) — el aislamiento por usuario pasa siempre por
 * `FundsService.findOwnOrThrow()` (reutilizado, no duplicado) — mismo
 * patrón que `FundPurchasesService`/`FundValuationsService`.
 */
@Injectable()
export class FundDividendsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fundsService: FundsService,
  ) {}

  /** De la más reciente a la más antigua — mismo criterio que `FundPurchasesService.list()`. */
  async list(userId: string): Promise<FundDividend[]> {
    const ownFunds = await this.db.query.funds.findMany({ where: eq(funds.userId, userId), columns: { id: true } });
    if (ownFunds.length === 0) return [];

    return this.db.query.fundDividends.findMany({
      where: inArray(
        fundDividends.fundId,
        ownFunds.map((f) => f.id),
      ),
      orderBy: [desc(fundDividends.date), desc(fundDividends.createdAt)],
    });
  }

  /** H1 criterio 6: 404 si `fundId` no es un fondo propio. */
  async create(userId: string, dto: CreateFundDividendDto): Promise<FundDividend> {
    await this.fundsService.findOwnOrThrow(userId, dto.fundId);

    const [dividend] = await this.db
      .insert(fundDividends)
      .values({
        fundId: dto.fundId,
        netAmount: dto.netAmount,
        date: dto.date,
        ...(dto.retentionPercent !== undefined && { retentionPercent: dto.retentionPercent }),
      })
      .returning();
    return dividend;
  }

  async update(userId: string, id: string, dto: UpdateFundDividendDto): Promise<FundDividend> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(fundDividends)
      .set({
        ...(dto.netAmount !== undefined && { netAmount: dto.netAmount }),
        ...(dto.retentionPercent !== undefined && { retentionPercent: dto.retentionPercent }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(fundDividends.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(fundDividends).where(eq(fundDividends.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<FundDividend> {
    const dividend = await this.db.query.fundDividends.findFirst({ where: eq(fundDividends.id, id) });
    if (!dividend) {
      throw new NotFoundException('Dividendo no encontrado.');
    }
    await this.fundsService.findOwnOrThrow(userId, dividend.fundId);
    return dividend;
  }
}
