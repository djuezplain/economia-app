import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { stockValuations, stocks } from '../db/schema/index.js';
import { StocksService } from './stocks.service.js';
import type { CreateStockValuationDto } from './dto/create-stock-valuation.dto.js';
import type { UpdateStockValuationDto } from './dto/update-stock-valuation.dto.js';

export type StockValuation = typeof stockValuations.$inferSelect;

/**
 * H3 (spec 020). Mismo patrón que `StockPurchasesService`: sin `userId`
 * propio, aislamiento vía `StocksService.findOwnOrThrow()`.
 */
@Injectable()
export class StockValuationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly stocksService: StocksService,
  ) {}

  /** H3 criterio 3: de la más reciente a la más antigua, de todas las acciones del usuario a la vez. */
  async list(userId: string): Promise<StockValuation[]> {
    const ownStocks = await this.db.query.stocks.findMany({ where: eq(stocks.userId, userId), columns: { id: true } });
    if (ownStocks.length === 0) return [];

    return this.db.query.stockValuations.findMany({
      where: inArray(
        stockValuations.stockId,
        ownStocks.map((s) => s.id),
      ),
      orderBy: [desc(stockValuations.date), desc(stockValuations.createdAt)],
    });
  }

  /** H3 criterio 5: 404 si `stockId` no es una acción propia. */
  async create(userId: string, dto: CreateStockValuationDto): Promise<StockValuation> {
    await this.stocksService.findOwnOrThrow(userId, dto.stockId);

    const [valuation] = await this.db
      .insert(stockValuations)
      .values({ stockId: dto.stockId, pricePerShare: dto.pricePerShare, date: dto.date })
      .returning();
    return valuation;
  }

  async update(userId: string, id: string, dto: UpdateStockValuationDto): Promise<StockValuation> {
    await this.findOwnOrThrow(userId, id);

    const [updated] = await this.db
      .update(stockValuations)
      .set({
        ...(dto.pricePerShare !== undefined && { pricePerShare: dto.pricePerShare }),
        ...(dto.date !== undefined && { date: dto.date }),
        updatedAt: new Date(),
      })
      .where(eq(stockValuations.id, id))
      .returning();
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    await this.db.delete(stockValuations).where(eq(stockValuations.id, id));
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<StockValuation> {
    const valuation = await this.db.query.stockValuations.findFirst({ where: eq(stockValuations.id, id) });
    if (!valuation) {
      throw new NotFoundException('Valoración no encontrada.');
    }
    await this.stocksService.findOwnOrThrow(userId, valuation.stockId);
    return valuation;
  }
}
