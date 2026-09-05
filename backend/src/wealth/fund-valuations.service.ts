import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { fundValuations, funds } from '../db/schema/index.js';
import { FundsService } from './funds.service.js';
import type { CreateFundValuationDto } from './dto/create-fund-valuation.dto.js';
import type { UpdateFundValuationDto } from './dto/update-fund-valuation.dto.js';

export type FundValuation = typeof fundValuations.$inferSelect;

/**
 * H3 (spec 021). Mismo patrón que `FundPurchasesService`: sin `userId`
 * propio, aislamiento vía `FundsService.findOwnOrThrow()`.
 */
@Injectable()
export class FundValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly fundsService: FundsService,
  ) {}

  /** H3 criterio 3: de la más reciente a la más antigua, de todos los fondos del usuario a la vez. */
  async list(userId: string): Promise<FundValuation[]> {
    const ownFunds = await this.db.query.funds.findMany({ where: eq(funds.userId, userId), columns: { id: true } });
    if (ownFunds.length === 0) return [];

    return this.db.query.fundValuations.findMany({
      where: inArray(
        fundValuations.fundId,
        ownFunds.map((f) => f.id),
      ),
      orderBy: [desc(fundValuations.date), desc(fundValuations.createdAt)],
    });
  }

  /** H3 criterio 5: 404 si `fundId` no es un fondo propio. */
  async create(userId: string, dto: CreateFundValuationDto): Promise<FundValuation> {
    await this.fundsService.findOwnOrThrow(userId, dto.fundId);

    const [valuation] = await this.db
      .insert(fundValuations)
      .values({ fundId: dto.fundId, pricePerShare: dto.pricePerShare, date: dto.date })
      .returning();
    return valuation;
  }

  async update(userId: string, id: string, dto: UpdateFundValuationDto): Promise<FundValuation> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(fundValuations)
      .set({
        ...(dto.pricePerShare !== undefined && { pricePerShare: dto.pricePerShare }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(fundValuations.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(fundValuations).where(eq(fundValuations.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<FundValuation> {
    const valuation = await this.db.query.fundValuations.findFirst({ where: eq(fundValuations.id, id) });
    if (!valuation) {
      throw new NotFoundException('Valoración no encontrada.');
    }
    await this.fundsService.findOwnOrThrow(userId, valuation.fundId);
    return valuation;
  }
}
